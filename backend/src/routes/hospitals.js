import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticateUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { calculateDistance } from '../services/geolocation/haversine.js';
import {
  hideDevelopmentDoctor,
  hideDevelopmentHospital
} from '../lib/developmentFixtures.js';
import { getPublicDoctorAvailability } from '../data/publicDoctorAvailability.js';
import {
  getLocalHospitalRatingSummary,
  saveLocalHospitalRating
} from '../services/ratings/localHospitalRatings.js';
import {
  getStorageHospitalRatingSummary,
  saveStorageHospitalRating
} from '../services/ratings/storageHospitalRatings.js';

const router = Router();
const communityFacilityCache = new Map();
const COMMUNITY_FACILITY_CACHE_MS = 30 * 60 * 1000;
const googleRatingCache = new Map();
const GOOGLE_RATING_CACHE_MS = 24 * 60 * 60 * 1000;
const GOOGLE_PLACES_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const GOOGLE_PLACES_AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const GOOGLE_PLACE_DETAILS_URL = 'https://places.googleapis.com/v1/places';
let googleTextSearchUnavailableUntil = 0;
const GOOGLE_RATING_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri'
].join(',');
const legacyDelhiHospitalNames = new Set([
  'Aakash Healthcare Super Speciality Hospital',
  'BLK-Max Super Speciality Hospital',
  'Connaught Place Diagnostic & Care',
  'Fortis Escorts Heart Institute',
  'Lajpat Nagar Family Clinic',
  'Max Super Speciality Hospital Saket'
]);

const directoryPriority = {
  'data.gov.in-national-hospital-directory': 3,
  'data.gov.in-all-india-health-centres': 2
};

function hospitalRatingSummary(hospital) {
  return {
    ratingAvg: Number(hospital.rating_avg) || 0,
    ratingCount: Number(hospital.rating_count) || 0
  };
}

function hospitalOperatingHoursSummary(hospital) {
  const weekly = hospital?.timings && typeof hospital.timings === 'object' && !Array.isArray(hospital.timings)
    ? Object.fromEntries(Object.entries(hospital.timings).filter(([, hours]) => Boolean(hours)))
    : null;
  const weeklyEntries = weekly ? Object.entries(weekly) : [];
  const text = String(hospital?.operating_hours || hospital?.opening_hours || '').trim();

  if (weeklyEntries.length > 0) {
    return {
      operatingHours: {
        status: 'published',
        label: 'Published hours',
        weekly
      }
    };
  }

  if (text) {
    return {
      operatingHours: {
        status: 'published',
        label: text,
        text
      }
    };
  }

  return {
    operatingHours: {
      status: 'unpublished',
      label: 'Hours not published'
    }
  };
}

function normalizeDoctorName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^dr\.?\s+/, '')
    .replace(/\s+/g, ' ');
}

async function fetchBookableRatingsByName() {
  const { data, error } = await supabase
    .from('doctor_profiles')
    .select(`
      rating_avg,
      rating_count,
      users:user_id (
        full_name
      )
    `)
    .eq('status', 'active')
    .gt('rating_count', 0);

  if (error) {
    console.warn('Unable to load bookable doctor ratings for hospital roster:', error.message || error);
    return new Map();
  }

  const ratingsByName = new Map();
  for (const profile of data || []) {
    const key = normalizeDoctorName(profile.users?.full_name);
    const count = Number(profile.rating_count) || 0;
    const average = Number(profile.rating_avg) || 0;
    if (!key || count < 1 || average <= 0) continue;

    const current = ratingsByName.get(key) || { weightedTotal: 0, ratingCount: 0 };
    current.weightedTotal += average * count;
    current.ratingCount += count;
    ratingsByName.set(key, current);
  }

  return new Map([...ratingsByName.entries()].map(([key, value]) => [
    key,
    {
      ratingAvg: Number((value.weightedTotal / value.ratingCount).toFixed(2)),
      ratingCount: value.ratingCount
    }
  ]));
}

function hospitalRatingSchemaMissing(error) {
  return ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error?.code) ||
    /hospital_ratings|rating_avg|rating_count/i.test(error?.message || '');
}

async function refreshHospitalRatingSummary(hospitalId) {
  const { data: ratings, error: ratingsError } = await supabase
    .from('hospital_ratings')
    .select('rating')
    .eq('hospital_id', hospitalId);

  if (ratingsError) throw ratingsError;

  const ratingCount = ratings.length;
  const ratingAvg = ratingCount
    ? Number((ratings.reduce((sum, entry) => sum + entry.rating, 0) / ratingCount).toFixed(2))
    : 0;

  const { error: updateError } = await supabase
    .from('hospitals')
    .update({ rating_avg: ratingAvg, rating_count: ratingCount })
    .eq('id', hospitalId);

  if (updateError) throw updateError;
  return { ratingAvg, ratingCount };
}

async function fetchGoogleHospitalRating(hospital) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    const error = new Error('Google Maps API key is not configured');
    error.code = 'GOOGLE_PLACES_NOT_CONFIGURED';
    throw error;
  }

  const cacheKey = normalizedFacilityKey(hospital);
  const cached = googleRatingCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < GOOGLE_RATING_CACHE_MS) {
    return cached.rating;
  }

  const locationParts = [
    hospital.name,
    hospital.address,
    hospital.city,
    hospital.district,
    hospital.state,
    'India'
  ].filter(Boolean);
  const body = {
    textQuery: locationParts.join(', '),
    pageSize: 1,
    regionCode: 'IN',
    languageCode: 'en'
  };

  if (Number.isFinite(hospital.latitude) && Number.isFinite(hospital.longitude)) {
    body.locationBias = {
      circle: {
        center: {
          latitude: hospital.latitude,
          longitude: hospital.longitude
        },
        radius: 5000
      }
    };
  }

  let place = null;
  if (Date.now() >= googleTextSearchUnavailableUntil) {
    const response = await fetch(GOOGLE_PLACES_TEXT_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': GOOGLE_RATING_FIELD_MASK
      },
      body: JSON.stringify(body)
    });
    const data = await response.json();

    if (!response.ok && data.error?.status === 'RESOURCE_EXHAUSTED') {
      googleTextSearchUnavailableUntil = Date.now() + (60 * 60 * 1000);
    } else if (!response.ok) {
      const error = new Error(data.error?.message || 'Google Places lookup failed');
      error.code = data.error?.status || 'GOOGLE_PLACES_ERROR';
      error.status = response.status;
      throw error;
    } else {
      place = data.places?.[0] || null;
    }
  }

  if (!place) {
    const autocompleteBody = {
      input: locationParts.join(', '),
      includedRegionCodes: ['in'],
      languageCode: 'en'
    };
    if (Number.isFinite(hospital.latitude) && Number.isFinite(hospital.longitude)) {
      autocompleteBody.locationBias = {
        circle: {
          center: {
            latitude: hospital.latitude,
            longitude: hospital.longitude
          },
          radius: 5000
        }
      };
    }

    const autocompleteResponse = await fetch(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey
      },
      body: JSON.stringify(autocompleteBody)
    });
    const autocompleteData = await autocompleteResponse.json();
    if (!autocompleteResponse.ok) {
      const error = new Error(autocompleteData.error?.message || 'Google Places autocomplete failed');
      error.code = autocompleteData.error?.status || 'GOOGLE_PLACES_ERROR';
      error.status = autocompleteResponse.status;
      throw error;
    }

    const placeId = autocompleteData.suggestions?.[0]?.placePrediction?.placeId;
    if (placeId) {
      const detailsResponse = await fetch(`${GOOGLE_PLACE_DETAILS_URL}/${placeId}`, {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': GOOGLE_RATING_FIELD_MASK.replaceAll('places.', '')
        }
      });
      const detailsData = await detailsResponse.json();
      if (!detailsResponse.ok) {
        const error = new Error(detailsData.error?.message || 'Google Place Details lookup failed');
        error.code = detailsData.error?.status || 'GOOGLE_PLACES_ERROR';
        error.status = detailsResponse.status;
        throw error;
      }
      place = detailsData;
    }
  }

  if (!place || !Number.isFinite(place.rating)) {
    googleRatingCache.set(cacheKey, { createdAt: Date.now(), rating: null });
    return null;
  }

  const rating = {
    placeId: place.id,
    name: place.displayName?.text || hospital.name,
    formattedAddress: place.formattedAddress || null,
    rating: place.rating,
    ratingCount: place.userRatingCount || 0,
    googleMapsUrl: place.googleMapsUri || null
  };
  googleRatingCache.set(cacheKey, { createdAt: Date.now(), rating });
  return rating;
}

const knownLocationCatalog = [
  { name: 'Chas, Bokaro, Jharkhand', place: 'Chas', district: 'Bokaro', state: 'Jharkhand', latitude: 23.6355, longitude: 86.1678, aliases: ['chas', 'bokaro chas', 'chas bokaro', 'chira chas', 'chirachas'] },
  { name: 'Bokaro Steel City, Bokaro, Jharkhand', place: 'Bokaro Steel City', district: 'Bokaro', state: 'Jharkhand', latitude: 23.6579595, longitude: 86.0839161, aliases: ['bokaro steel city', 'bokaro steel', 'bs city'] },
  { name: 'Bokaro, Jharkhand', place: 'Bokaro', district: 'Bokaro', state: 'Jharkhand', latitude: 23.6692956, longitude: 85.99, aliases: ['bokaro'] },
  { name: 'Ranchi, Jharkhand', place: 'Ranchi', district: 'Ranchi', state: 'Jharkhand', latitude: 23.3441, longitude: 85.3096, aliases: ['ranchi'] },
  { name: 'Dhanbad, Jharkhand', place: 'Dhanbad', district: 'Dhanbad', state: 'Jharkhand', latitude: 23.7957, longitude: 86.4304, aliases: ['dhanbad'] },
  { name: 'Jamshedpur, East Singhbhum, Jharkhand', place: 'Jamshedpur', district: 'East Singhbhum', state: 'Jharkhand', latitude: 22.8046, longitude: 86.2029, aliases: ['jamshedpur', 'tatanagar'] },
  { name: 'Amritpuri, East of Kailash, South Delhi, Delhi', place: 'Amritpuri', district: 'South Delhi', state: 'Delhi', latitude: 28.5585595, longitude: 77.2510379, aliases: ['amritpuri', 'amritpuri delhi', 'amritpuri garhi'] },
  { name: 'East of Kailash, South East Delhi, Delhi', place: 'East of Kailash', district: 'South East Delhi', state: 'Delhi', latitude: 28.5570322, longitude: 77.2446139, aliases: ['east of kailash'] },
  { name: 'Delhi, Delhi', place: 'Delhi', district: 'New Delhi', state: 'Delhi', latitude: 28.6139, longitude: 77.209, aliases: ['delhi', 'new delhi'] },
  { name: 'Patna, Bihar', place: 'Patna', district: 'Patna', state: 'Bihar', latitude: 25.5941, longitude: 85.1376, aliases: ['patna'] },
  { name: 'Kolkata, West Bengal', place: 'Kolkata', district: 'Kolkata', state: 'West Bengal', latitude: 22.5726, longitude: 88.3639, aliases: ['kolkata', 'calcutta'] },
  { name: 'Pune, Maharashtra', place: 'Pune', district: 'Pune', state: 'Maharashtra', latitude: 18.5204, longitude: 73.8567, aliases: ['pune'] },
  { name: 'Bengaluru, Karnataka', place: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', latitude: 12.9716, longitude: 77.5946, aliases: ['bengaluru', 'bangalore'] },
  { name: 'Mumbai, Maharashtra', place: 'Mumbai', district: 'Mumbai', state: 'Maharashtra', latitude: 19.076, longitude: 72.8777, aliases: ['mumbai', 'bombay'] },
  { name: 'Chennai, Tamil Nadu', place: 'Chennai', district: 'Chennai', state: 'Tamil Nadu', latitude: 13.0827, longitude: 80.2707, aliases: ['chennai', 'madras'] },
  { name: 'Hyderabad, Telangana', place: 'Hyderabad', district: 'Hyderabad', state: 'Telangana', latitude: 17.385, longitude: 78.4867, aliases: ['hyderabad'] },
  { name: 'Ahmedabad, Gujarat', place: 'Ahmedabad', district: 'Ahmedabad', state: 'Gujarat', latitude: 23.0225, longitude: 72.5714, aliases: ['ahmedabad'] },
  { name: 'Jaipur, Rajasthan', place: 'Jaipur', district: 'Jaipur', state: 'Rajasthan', latitude: 26.9124, longitude: 75.7873, aliases: ['jaipur'] },
  { name: 'Lucknow, Uttar Pradesh', place: 'Lucknow', district: 'Lucknow', state: 'Uttar Pradesh', latitude: 26.8467, longitude: 80.9462, aliases: ['lucknow'] },
  { name: 'Bhopal, Madhya Pradesh', place: 'Bhopal', district: 'Bhopal', state: 'Madhya Pradesh', latitude: 23.2599, longitude: 77.4126, aliases: ['bhopal'] },
  { name: 'Indore, Madhya Pradesh', place: 'Indore', district: 'Indore', state: 'Madhya Pradesh', latitude: 22.7196, longitude: 75.8577, aliases: ['indore'] },
  { name: 'Guwahati, Assam', place: 'Guwahati', district: 'Kamrup Metropolitan', state: 'Assam', latitude: 26.1445, longitude: 91.7362, aliases: ['guwahati'] }
];

function normalizedWords(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function normalizedFacilityKey(hospital) {
  const normalize = value => String(value || '')
    .toLowerCase()
    .replace(/\b(?:hospital|hosp|clinic|centre|center|health|facility)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');
  return [
    normalize(hospital.name),
    normalize(hospital.district),
    normalize(hospital.state)
  ].join('|');
}

function mergeDirectoryRows(rows) {
  const merged = new Map();

  for (const hospital of rows) {
    const key = normalizedFacilityKey(hospital);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...hospital, alternateSources: [] });
      continue;
    }

    const existingPriority = directoryPriority[existing.sourceDataset] || 1;
    const hospitalPriority = directoryPriority[hospital.sourceDataset] || 1;
    const primary = hospitalPriority > existingPriority ? hospital : existing;
    const secondary = primary === hospital ? existing : hospital;
    const source = {
      dataset: secondary.sourceDataset,
      url: secondary.sourceUrl,
      lastUpdated: secondary.sourceLastUpdated
    };

    merged.set(key, {
      ...secondary,
      ...Object.fromEntries(
        Object.entries(primary).map(([field, value]) => [
          field,
          value === null || value === undefined || value === '' ? secondary[field] : value
        ])
      ),
      departments: [...new Set([
        ...(primary.departments || []),
        ...(secondary.departments || [])
      ])],
      alternateSources: [
        ...(primary.alternateSources || []),
        ...(secondary.alternateSources || []),
        source
      ].filter((item, index, all) =>
        item.dataset &&
        all.findIndex(candidate => candidate.dataset === item.dataset) === index
      )
    });
  }

  return [...merged.values()];
}

function communityFacilityType(row) {
  const tags = row.extratags || row.tags || {};
  const text = [
    tags.healthcare,
    tags.amenity,
    tags.office,
    row.type,
    row.class,
    row.display_name
  ].filter(Boolean).join(' ').toLowerCase();

  if (/diagnostic|laborator|patholog|scan|imaging|x-?ray/.test(text)) return 'Diagnostic centre';
  if (/nursing home/.test(text)) return 'Nursing home';
  if (/clinic|doctor|dentist|physiotherap|health (?:centre|center)|dispensary/.test(text)) return 'Clinic';
  if (/hospital/.test(text)) return 'Hospital';
  return 'Healthcare facility';
}

const COMMUNITY_HEALTHCARE_TYPES = new Set([
  'hospital',
  'clinic',
  'doctors',
  'doctor',
  'dentist',
  'physiotherapist',
  'laboratory',
  'blood_bank',
  'birthing_centre',
  'rehabilitation'
]);

const HUMAN_CARE_NAME_PATTERN =
  /\b(hospital|clinic|nursing\s*home|polyclinic|dispensary|diagnostic|patholog(?:y|ical)|laborator(?:y|ies)|imaging|scan(?:ning)?|maternity|medical\s+(?:centre|center|hospital|institute)|health\s+(?:centre|center|care)|eye\s+(?:care|hospital|clinic)|dental|dentist|physiotherap(?:y|ist)|rehabilitation|blood\s*bank|trauma|surgical|surgicare|aushadh(?:alaya|alay)|netralaya)\b/i;

const INVALID_COMMUNITY_FACILITY_PATTERN =
  /\b(veterinar(?:y|ian)|animal\s+(?:hospital|clinic|care)|pet\s+(?:hospital|clinic|care)|pharmacy|chemist|medical\s+store|medicine\s+store|drug\s*store|pharma(?:ceutical)?|supermarket|shopping\s+mall|hotel|restaurant|hostel|temple|church|mosque|road|street|lane|gali|marg)\b/i;

function communityFacilityName(row) {
  const tags = row.extratags || row.tags || {};
  return String(
    tags.name ||
    tags['name:en'] ||
    row.name ||
    String(row.display_name || '').split(',')[0] ||
    ''
  ).trim();
}

function normalizeCommunityType(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
}

function isValidCommunityHealthcareRow(row) {
  const tags = row.extratags || row.tags || {};
  const name = communityFacilityName(row);
  const amenity = normalizeCommunityType(tags.amenity);
  const healthcare = normalizeCommunityType(tags.healthcare);
  const rowClass = normalizeCommunityType(row.class);
  const rowType = normalizeCommunityType(row.type);
  const classificationText = [name, amenity, healthcare, rowClass, rowType]
    .filter(Boolean)
    .join(' ');

  if (!name || INVALID_COMMUNITY_FACILITY_PATTERN.test(classificationText)) {
    return false;
  }

  if (['hospital', 'clinic', 'doctors', 'dentist'].includes(amenity)) {
    return true;
  }
  if (COMMUNITY_HEALTHCARE_TYPES.has(healthcare)) {
    return true;
  }
  if (
    ['amenity', 'healthcare'].includes(rowClass) &&
    COMMUNITY_HEALTHCARE_TYPES.has(rowType)
  ) {
    return true;
  }

  return HUMAN_CARE_NAME_PATTERN.test(name);
}

function isValidFormattedCommunityFacility(facility) {
  const sourceDataset = facility.sourceDataset || facility.source_dataset;
  if (sourceDataset !== 'openstreetmap-community-healthcare') return true;

  const hospitalType = facility.hospitalType || facility.hospital_type || '';
  const text = [facility.name, hospitalType].filter(Boolean).join(' ');
  if (INVALID_COMMUNITY_FACILITY_PATTERN.test(text)) return false;
  return hospitalType !== 'Healthcare facility' ||
    HUMAN_CARE_NAME_PATTERN.test(facility.name);
}

function normalizeCommunityKey(row) {
  return [
    row.osm_type,
    row.osm_id,
    String(row.name || row.display_name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
  ].filter(Boolean).join(':');
}

function formatCommunityFacility(row, originLatitude, originLongitude) {
  const address = row.address || {};
  const latitude = Number.parseFloat(row.lat);
  const longitude = Number.parseFloat(row.lon);
  const name = row.name ||
    address.hospital ||
    address.clinic ||
    address.healthcare ||
    String(row.display_name || '').split(',')[0]?.trim() ||
    'Healthcare facility';

  return {
    id: `osm-${row.osm_type || 'place'}-${row.osm_id || normalizeCommunityKey(row)}`,
    name,
    address: row.display_name,
    city: address.city || address.town || address.village || address.suburb || null,
    district: address.county || address.state_district || address.city_district || null,
    state: address.state || null,
    pincode: address.postcode || null,
    phone: row.extratags?.phone || null,
    email: row.extratags?.email || null,
    mobile: row.extratags?.mobile || null,
    website: row.extratags?.website || row.extratags?.url || null,
    hospitalType: communityFacilityType(row),
    careType: 'Community mapped healthcare',
    systemOfMedicine: null,
    area: address.suburb || address.neighbourhood || address.quarter || null,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    departments: [],
    facilities: null,
    doctorCount: null,
    bedCount: null,
    doctors: [],
    sourceDataset: 'openstreetmap-community-healthcare',
    sourceUrl: row.osm_type && row.osm_id
      ? `https://www.openstreetmap.org/${row.osm_type}/${row.osm_id}`
      : 'https://www.openstreetmap.org/',
    sourceLastUpdated: null,
    verificationStatus: 'community-mapped',
    ...hospitalOperatingHoursSummary({ operating_hours: row.extratags?.opening_hours }),
    ratingAvg: 0,
    ratingCount: 0,
    distance: Number.isFinite(originLatitude) &&
      Number.isFinite(originLongitude) &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
      ? calculateDistance(originLatitude, originLongitude, latitude, longitude)
      : null
  };
}

function formatOverpassFacility(element, originLatitude, originLongitude) {
  const tags = element.tags || {};
  const latitude = Number.parseFloat(element.lat ?? element.center?.lat);
  const longitude = Number.parseFloat(element.lon ?? element.center?.lon);
  const name = tags.name ||
    tags['name:en'] ||
    tags.operator ||
    tags.healthcare ||
    tags.amenity ||
    'Healthcare facility';
  const addressParts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:suburb'],
    tags['addr:city'],
    tags['addr:district'],
    tags['addr:state'],
    tags['addr:postcode']
  ].filter(Boolean);
  const osmType = element.type === 'way' ? 'way' : element.type === 'relation' ? 'relation' : 'node';

  return {
    id: `osm-${osmType}-${element.id}`,
    name,
    address: addressParts.length ? addressParts.join(', ') : tags.address || tags.description || null,
    city: tags['addr:city'] || tags['is_in:city'] || null,
    district: tags['addr:district'] || tags['is_in:district'] || null,
    state: tags['addr:state'] || null,
    pincode: tags['addr:postcode'] || null,
    phone: tags.phone || tags['contact:phone'] || null,
    email: tags.email || tags['contact:email'] || null,
    mobile: tags.mobile || null,
    website: tags.website || tags['contact:website'] || null,
    hospitalType: communityFacilityType({
      tags,
      type: tags.healthcare || tags.amenity || tags.office,
      class: 'healthcare',
      display_name: `${name} ${tags.healthcare || ''} ${tags.amenity || ''}`
    }),
    careType: 'Community mapped healthcare',
    systemOfMedicine: tags.healthcare_speciality || tags['healthcare:speciality'] || null,
    area: tags['addr:suburb'] || tags['addr:neighbourhood'] || null,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    departments: tags.healthcare_speciality
      ? String(tags.healthcare_speciality).split(';').map(item => item.trim()).filter(Boolean)
      : [],
    facilities: null,
    doctorCount: null,
    bedCount: tags.beds || null,
    doctors: [],
    sourceDataset: 'openstreetmap-community-healthcare',
    sourceUrl: `https://www.openstreetmap.org/${osmType}/${element.id}`,
    sourceLastUpdated: null,
    verificationStatus: 'community-mapped',
    ...hospitalOperatingHoursSummary({ operating_hours: tags.opening_hours || tags['opening_hours:covid19'] }),
    ratingAvg: 0,
    ratingCount: 0,
    distance: Number.isFinite(originLatitude) &&
      Number.isFinite(originLongitude) &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
      ? calculateDistance(originLatitude, originLongitude, latitude, longitude)
      : null
  };
}

async function fetchOverpassHealthcareFacilities(latitude, longitude, limit) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

  const radiusMeters = 20000;
  const query = `
    [out:json][timeout:18];
    (
      nwr(around:${radiusMeters},${latitude},${longitude})["amenity"~"^(hospital|clinic|doctors|dentist)$"];
      nwr(around:${radiusMeters},${latitude},${longitude})["healthcare"];
    );
    out center tags ${Math.min(Math.max(limit * 3, 24), 120)};
  `;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response;
  try {
    response = await fetch(process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Swasthya Sarthi local healthcare directory contact=local'
      },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) return [];
  const data = await response.json();
  const elements = Array.isArray(data.elements) ? data.elements : [];
  return elements
    .filter(isValidCommunityHealthcareRow)
    .map(element => formatOverpassFacility(element, latitude, longitude));
}

async function fetchCommunityFacilities({ location, latitude, longitude, limit }) {
  const cleanLocation = String(location || '').trim();
  const hasLocation = cleanLocation.length >= 2;
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

  if (!hasLocation && !hasCoordinates) return [];

  const cacheKey = JSON.stringify({
    location: cleanLocation.toLowerCase(),
    latitude: hasCoordinates ? latitude.toFixed(3) : null,
    longitude: hasCoordinates ? longitude.toFixed(3) : null,
    limit
  });
  const cached = communityFacilityCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < COMMUNITY_FACILITY_CACHE_MS) {
    return cached.facilities;
  }

  const baseUrl = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
  const placeText = hasLocation ? `${cleanLocation}, India` : `${latitude}, ${longitude}`;
  const queries = [
    `hospital in ${placeText}`,
    `clinic in ${placeText}`,
    `nursing home in ${placeText}`,
    `diagnostic centre in ${placeText}`
  ];

  const results = await Promise.allSettled(queries.map(async query => {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      extratags: '1',
      namedetails: '1',
      limit: String(Math.min(Math.max(limit, 8), 30)),
      countrycodes: 'in'
    });

    if (hasCoordinates) {
      const latitudeSpan = 0.35;
      const longitudeSpan = 0.35;
      params.set('viewbox', [
        longitude - longitudeSpan,
        latitude + latitudeSpan,
        longitude + longitudeSpan,
        latitude - latitudeSpan
      ].join(','));
      params.set('bounded', '0');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    let response;
    try {
      response = await fetch(`${baseUrl}/search?${params}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Swasthya Sarthi local healthcare directory contact=local'
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }));

  const overpassFacilities = await fetchOverpassHealthcareFacilities(latitude, longitude, limit).catch(() => []);
  const byKey = new Map();
  for (const facility of overpassFacilities) {
    byKey.set(facility.id, facility);
  }
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const row of result.value) {
      if (!row?.display_name || !row?.osm_id || !isValidCommunityHealthcareRow(row)) continue;
      const key = normalizeCommunityKey(row);
      const osmKey = `osm-${row.osm_type || 'place'}-${row.osm_id}`;
      if (!byKey.has(osmKey) && !byKey.has(key)) {
        byKey.set(key, formatCommunityFacility(row, latitude, longitude));
      }
    }
  }

  const sortedFacilities = [...byKey.values()]
    .filter(isValidFormattedCommunityFacility)
    .filter(facility =>
      !hasCoordinates ||
      facility.distance === null ||
      facility.distance <= 75
    )
    .sort((a, b) => {
      if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
      if (a.distance !== null) return -1;
      if (b.distance !== null) return 1;
      return a.name.localeCompare(b.name);
    });
  const facilities = [];
  for (const facility of sortedFacilities) {
    const duplicate = facilities.some(existing =>
      normalizedWords(existing.name).join('') === normalizedWords(facility.name).join('') &&
      (
        existing.latitude === null ||
        existing.longitude === null ||
        facility.latitude === null ||
        facility.longitude === null ||
        calculateDistance(
          existing.latitude,
          existing.longitude,
          facility.latitude,
          facility.longitude
        ) <= 0.5
      )
    );
    if (!duplicate) facilities.push(facility);
    if (facilities.length >= limit) break;
  }

  communityFacilityCache.set(cacheKey, {
    createdAt: Date.now(),
    facilities
  });

  return facilities;
}

function isMissingDirectorySchema(error) {
  return error?.code === 'PGRST204' ||
    error?.code === 'PGRST205' ||
    error?.code === '42501';
}

function formatVerifiedDoctor(affiliation, ratingsByName = new Map()) {
  const doctor = affiliation.doctor;
  const rating = ratingsByName.get(normalizeDoctorName(doctor.full_name)) || {
    ratingAvg: 0,
    ratingCount: 0
  };
  return {
    associationId: affiliation.id,
    id: doctor.id,
    fullName: doctor.full_name,
    specialization: doctor.specialization?.name || affiliation.department_name || 'Specialization not listed',
    specializationId: doctor.specialization?.id || null,
    credentials: doctor.credentials,
    yearsExperience: doctor.years_experience,
    officialProfileUrl: doctor.official_profile_url,
    officialBookingUrl: affiliation.official_booking_url,
    sourceName: doctor.source_name,
    sourceUrl: affiliation.source_url,
    verifiedAt: affiliation.verified_at,
    ratingAvg: rating.ratingAvg,
    ratingCount: rating.ratingCount,
    publicAvailability: getPublicDoctorAvailability(
      doctor.full_name,
      affiliation.hospital?.name
    ),
    directoryOnly: true
  };
}

async function fetchVerifiedAffiliations(hospitalIds) {
  if (!hospitalIds.length) return { available: true, byHospital: new Map() };

  const affiliations = [];
  const batchSize = 100;
  for (let index = 0; index < hospitalIds.length; index += batchSize) {
    const hospitalIdBatch = hospitalIds.slice(index, index + batchSize);
    const { data, error } = await supabase
      .from('verified_doctor_hospital_affiliations')
      .select(`
        id,
        hospital_id,
        department_name,
        official_booking_url,
        source_url,
        verified_at,
        status,
        hospital:hospitals!hospital_id (
          name
        ),
        doctor:verified_doctors!doctor_id (
          id,
          full_name,
          credentials,
          years_experience,
          official_profile_url,
          source_name,
          is_active,
          specialization:specializations!specialization_id (
            id,
            name
          )
        )
      `)
      .in('hospital_id', hospitalIdBatch)
      .eq('status', 'verified');

    if (error) {
      if (isMissingDirectorySchema(error)) {
        return { available: false, byHospital: new Map() };
      }
      throw error;
    }
    affiliations.push(...(data || []));
  }

  const byHospital = new Map();
  const ratingsByName = await fetchBookableRatingsByName();
  for (const affiliation of affiliations) {
    if (!affiliation.doctor?.is_active) continue;
    const current = byHospital.get(affiliation.hospital_id) || [];
    current.push(formatVerifiedDoctor(affiliation, ratingsByName));
    byHospital.set(affiliation.hospital_id, current);
  }

  return { available: true, byHospital };
}

async function fetchBookableAffiliations(hospitalIds) {
  if (!hospitalIds.length) return new Map();

  const affiliations = [];
  const batchSize = 100;
  for (let index = 0; index < hospitalIds.length; index += batchSize) {
    const hospitalIdBatch = hospitalIds.slice(index, index + batchSize);
    const { data, error } = await supabase
      .from('doctor_hospital_affiliations')
      .select(`
        hospital_id,
        consultation_fee,
        status,
        doctor:users!doctor_id (
          id,
          full_name,
          doctor_profiles!user_id (
            status,
            years_experience,
            consultation_fee,
            rating_avg,
            rating_count,
            specialization:specializations!specialization_id (
              id,
              name
            )
          )
        )
      `)
      .in('hospital_id', hospitalIdBatch)
      .eq('status', 'accepted');

    if (error) {
      if (isMissingDirectorySchema(error)) return new Map();
      throw error;
    }
    affiliations.push(...(data || []));
  }

  const byHospital = new Map();
  for (const affiliation of affiliations) {
    const profile = affiliation.doctor?.doctor_profiles;
    if (!affiliation.doctor || profile?.status !== 'active' || hideDevelopmentDoctor(affiliation.doctor)) continue;
    const current = byHospital.get(affiliation.hospital_id) || [];
    current.push({
      id: affiliation.doctor.id,
      fullName: affiliation.doctor.full_name,
      specialization: profile.specialization?.name || 'General Physician',
      specializationId: profile.specialization?.id || null,
      yearsExperience: profile.years_experience || 0,
      consultationFee: affiliation.consultation_fee ?? profile.consultation_fee ?? 0,
      ratingAvg: profile.rating_avg || 0,
      ratingCount: profile.rating_count || 0,
      bookable: true
    });
    byHospital.set(affiliation.hospital_id, current);
  }

  return byHospital;
}

async function fetchDelhiHospitals(req, res, districtFilter = null) {
  try {
    const patientLat = Number.parseFloat(req.query.lat);
    const patientLng = Number.parseFloat(req.query.lng);
    const hasSearchLocation = Number.isFinite(patientLat) && Number.isFinite(patientLng);
    let query = supabase
      .from('hospitals')
      .select(`
        *,
        doctor_hospital_affiliations!hospital_id (
          id,
          status,
          consultation_fee,
          working_days,
          start_time,
          end_time,
          doctor:users!doctor_id (
            id,
            full_name,
            email,
            phone,
            doctor_profiles!user_id (
              status,
              rating_avg,
              rating_count,
              specialization:specializations!specialization_id (
                id,
                name
              )
            )
          )
        )
      `)
      .eq('city', 'Delhi')
      .order('name', { ascending: true });

    if (districtFilter) {
      query = query.eq('district', districtFilter);
    }

    const { data: hospitals, error } = await query;

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to load Delhi hospitals', code: 'DB_ERROR' }
      });
    }

    const hospitalRows = (hospitals || []).filter(isValidFormattedCommunityFacility);
    const hasVerificationSchema = hospitalRows.some(hospital =>
      Object.prototype.hasOwnProperty.call(hospital, 'verification_status')
    );
    const { available: directoryAvailable, byHospital } = await fetchVerifiedAffiliations(
      hospitalRows.map(hospital => hospital.id)
    );
    const bookableByHospital = await fetchBookableAffiliations(
      hospitalRows.map(hospital => hospital.id)
    );

    const formatted = hospitalRows
      .filter(hospital => hasVerificationSchema && directoryAvailable
        ? hospital.verification_status === 'verified'
        : !legacyDelhiHospitalNames.has(hospital.name))
      .map(hospital => ({
      id: hospital.id,
      name: hospital.name,
      address: hospital.address,
      district: hospital.district,
      state: hospital.state,
      pincode: hospital.pincode,
      phone: hospital.phone,
      email: hospital.email,
      hospitalType: hospital.hospital_type,
      area: hospital.area,
      latitude: hospital.latitude,
      longitude: hospital.longitude,
      distance: hasSearchLocation &&
        Number.isFinite(hospital.latitude) &&
        Number.isFinite(hospital.longitude)
        ? calculateDistance(patientLat, patientLng, hospital.latitude, hospital.longitude)
        : null,
      departments: hospital.departments || [],
      timings: hospital.timings,
      ...hospitalOperatingHoursSummary(hospital),
      verificationStatus: hospital.verification_status || 'unverified',
      verificationSourceUrl: hospital.verification_source_url || null,
      verifiedAt: hospital.verified_at || null,
      ...hospitalRatingSummary(hospital),
      doctors: directoryAvailable ? (byHospital.get(hospital.id) || []) : [],
      bookableDoctors: bookableByHospital.get(hospital.id) || []
      }))
      .sort((a, b) => {
        if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
        if (a.distance !== null) return -1;
        if (b.distance !== null) return 1;
        return a.name.localeCompare(b.name);
      });

    return res.status(200).json({
      region: 'Delhi',
      directoryReady: directoryAvailable && hasVerificationSchema,
      hospitals: formatted
    });
  } catch (error) {
    console.error('Delhi hospital directory failed:', error);
    return res.status(500).json({
      error: { message: 'Internal server error loading Delhi hospitals', code: 'INTERNAL_ERROR' }
    });
  }
}

// GET /api/hospitals/india?lat=&lng=&q=&state=&district=&limit=
// Returns every matching record available within Supabase's 1,000-row query bound.
router.get('/india', async (req, res) => {
  try {
    const latitude = Number.parseFloat(req.query.lat);
    const longitude = Number.parseFloat(req.query.lng);
    const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude);
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 1000)
      : 100;
    const search = String(req.query.q || '')
      .replace(/[%_,().]/g, ' ')
      .trim();
    const place = String(req.query.place || '')
      .replace(/[%_,().]/g, ' ')
      .trim();

    let query = supabase
      .from('hospitals')
      .select('*')
      .eq('is_public', true)
      .limit(1000);

    if (hasLocation && !req.query.district) {
      const latitudeWindow = 0.35;
      const longitudeWindow = 0.35;
      query = query
        .gte('latitude', latitude - latitudeWindow)
        .lte('latitude', latitude + latitudeWindow)
        .gte('longitude', longitude - longitudeWindow)
        .lte('longitude', longitude + longitudeWindow);
    }

    if (req.query.state) query = query.eq('state', String(req.query.state));
    if (req.query.district) query = query.eq('district', String(req.query.district));
    if (place && !hasLocation) {
      query = query.or(
        `city.ilike.%${place}%,district.ilike.%${place}%,address.ilike.%${place}%`
      );
    }
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,city.ilike.%${search}%,district.ilike.%${search}%,state.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to load India hospitals', code: 'DB_ERROR' }
      });
    }

    let hospitalData = data || [];
    if (
      hasLocation &&
      req.query.state &&
      hospitalData.length === 0
    ) {
      let fallbackQuery = supabase
        .from('hospitals')
        .select('*')
        .eq('is_public', true)
        .eq('state', String(req.query.state))
        .limit(1000);

      if (place) {
        fallbackQuery = fallbackQuery.or(
          `city.ilike.%${place}%,district.ilike.%${place}%,address.ilike.%${place}%`
        );
      }
      if (search) {
        fallbackQuery = fallbackQuery.or(
          `name.ilike.%${search}%,city.ilike.%${search}%,district.ilike.%${search}%`
        );
      }

      const fallbackResult = await fallbackQuery;
      if (fallbackResult.error) {
        return res.status(400).json({
          error: {
            message: fallbackResult.error.message || 'Failed to load state hospital fallback',
            code: 'DB_ERROR'
          }
        });
      }
      hospitalData = fallbackResult.data || [];
    }

    const mappedRows = hospitalData
      .filter(isValidFormattedCommunityFacility)
      .map(hospital => ({
        id: hospital.id,
        name: hospital.name,
        address: hospital.address,
        city: hospital.city,
        district: hospital.district,
        state: hospital.state,
        pincode: hospital.pincode,
        phone: hospital.phone,
        email: hospital.email,
        mobile: hospital.mobile,
        website: hospital.website,
        hospitalType: hospital.hospital_type,
        careType: hospital.care_type,
        systemOfMedicine: hospital.system_of_medicine,
        area: hospital.area,
        latitude: hospital.latitude,
        longitude: hospital.longitude,
        departments: hospital.departments || [],
        facilities: hospital.facilities,
        doctorCount: hospital.doctor_count,
        bedCount: hospital.bed_count,
        sourceDataset: hospital.source_dataset,
        sourceUrl: hospital.source_url || hospital.verification_source_url,
        sourceLastUpdated: hospital.source_last_updated,
        verificationStatus: hospital.verification_status || 'unverified',
        ...hospitalOperatingHoursSummary(hospital),
        ...hospitalRatingSummary(hospital),
        distance: hasLocation &&
          Number.isFinite(hospital.latitude) &&
          Number.isFinite(hospital.longitude)
          ? calculateDistance(latitude, longitude, hospital.latitude, hospital.longitude)
          : null
      }));

    const rows = mergeDirectoryRows(mappedRows)
      .filter(hospital =>
        !hasLocation ||
        (hospital.distance !== null && hospital.distance <= 75)
      )
      .sort((a, b) => {
        if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
        if (a.distance !== null) return -1;
        if (b.distance !== null) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, limit);

    const { available: directoryAvailable, byHospital } = await fetchVerifiedAffiliations(
      rows.map(hospital => hospital.id)
    );
    const bookableByHospital = await fetchBookableAffiliations(
      rows.map(hospital => hospital.id)
    );
    const hospitals = rows.map(hospital => ({
      ...hospital,
      doctors: directoryAvailable ? (byHospital.get(hospital.id) || []) : [],
      bookableDoctors: bookableByHospital.get(hospital.id) || []
    }));

    return res.status(200).json({
      region: 'India',
      resultLimit: limit,
      hospitals
    });
  } catch (error) {
    console.error('India hospital directory failed:', error);
    return res.status(500).json({
      error: { message: 'Internal server error loading India hospitals', code: 'INTERNAL_ERROR' }
    });
  }
});

// GET /api/hospitals/community?location=&lat=&lng=&limit=
// Adds public map healthcare facilities so smaller local clinics can appear near a selected place.
router.get('/community', async (req, res) => {
  try {
    const latitude = Number.parseFloat(req.query.lat);
    const longitude = Number.parseFloat(req.query.lng);
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 40)
      : 20;
    const location = String(req.query.location || req.query.place || '')
      .replace(/[%_]/g, ' ')
      .trim();

    const facilities = await fetchCommunityFacilities({
      location,
      latitude,
      longitude,
      limit
    });

    return res.status(200).json({
      region: 'India',
      resultLimit: limit,
      attribution: 'OpenStreetMap contributors',
      facilities,
      hospitals: facilities
    });
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error loading community healthcare facilities', code: 'INTERNAL_ERROR' }
    });
  }
});

// GET /api/hospitals/locations?q=
// Resolves searchable city, village, area, district, pincode, and state names from the directory.
router.get('/locations', async (req, res) => {
  try {
    const search = String(req.query.q || '')
      .replace(/[%_,().]/g, ' ')
      .trim();

    if (search.length < 2) {
      return res.status(400).json({
        error: { message: 'Enter at least two characters for location search', code: 'VALIDATION_ERROR' }
      });
    }

    const ignoredLocationWords = new Set([
      'area', 'block', 'city', 'colony', 'district', 'india', 'main', 'near',
      'nagar', 'road', 'sector', 'state', 'street'
    ]);
    const stateWords = new Set([
      'andhra', 'arunachal', 'assam', 'bihar', 'chandigarh', 'chhattisgarh',
      'delhi', 'goa', 'gujarat', 'haryana', 'himachal', 'jharkhand',
      'karnataka', 'kerala', 'ladakh', 'madhya', 'maharashtra', 'manipur',
      'meghalaya', 'mizoram', 'nagaland', 'odisha', 'punjab', 'rajasthan',
      'sikkim', 'tamil', 'telangana', 'tripura', 'uttar', 'uttarakhand',
      'west', 'bengal'
    ]);
    const rawSearchTerms = [...new Set(
      search
        .toLowerCase()
        .split(/\s+/)
        .map(term => term.replace(/[^a-z0-9-]/g, ''))
        .filter(term =>
          term.length >= 3 &&
          !/^\d+$/.test(term) &&
          !ignoredLocationWords.has(term)
        )
    )];
    const hasSpecificLocationTerm = rawSearchTerms.some(term => !stateWords.has(term));
    const searchTerms = rawSearchTerms
      .filter(term => !hasSpecificLocationTerm || !stateWords.has(term))
      .slice(0, 6);
    const normalizedSearch = search.toLowerCase();
    const catalogMatches = knownLocationCatalog
      .map(location => {
        const aliasText = [location.name, location.place, location.district, location.state, ...(location.aliases || [])]
          .join(' ')
          .toLowerCase();
        const aliasWords = new Set(normalizedWords(aliasText));
        const termMatches = searchTerms.filter(term =>
          aliasText.includes(term) || [...aliasWords].some(word => word.startsWith(term))
        ).length;
        const exactAlias = (location.aliases || []).some(alias =>
          normalizedSearch === alias.toLowerCase() ||
          alias.toLowerCase().includes(normalizedSearch)
        );
        const score = (exactAlias ? 200 : 0) + (termMatches * 40);
        return { ...location, type: 'catalog', hospitalCount: null, score };
      })
      .filter(location => location.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ score, aliases, ...location }) => location);
    const locationConditions = [
      `city.ilike.%${search}%`,
      `district.ilike.%${search}%`,
      `state.ilike.%${search}%`,
      `area.ilike.%${search}%`,
      `address.ilike.%${search}%`,
      `pincode.ilike.%${search}%`,
      ...searchTerms.flatMap(term => [
        `city.ilike.%${term}%`,
        `district.ilike.%${term}%`,
        `area.ilike.%${term}%`,
        `address.ilike.%${term}%`,
        `pincode.ilike.%${term}%`,
        ...(searchTerms.length === 1 ? [`state.ilike.%${term}%`] : [])
      ])
    ];

    const { data, error } = await supabase
      .from('hospitals')
      .select('name,address,city,district,state,pincode,area,latitude,longitude,hospital_type,source_dataset,verification_status,is_public')
      .eq('is_public', true)
      .or(locationConditions.join(','))
      .limit(1000);

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to search locations', code: 'DB_ERROR' }
      });
    }

    const grouped = new Map();
    const addLocation = (name, hospital, type) => {
      if (!name || !hospital.state) return;
      const cleanedName = String(name).trim();
      if (cleanedName.length < 2) return;
      if (
        type === 'locality' &&
        [hospital.state, hospital.district, 'India'].some(value =>
          value && cleanedName.toLowerCase() === String(value).toLowerCase()
        )
      ) {
        return;
      }
      const key = `${type}::${cleanedName.toLowerCase()}::${hospital.district || ''}::${hospital.state}`;
      const group = grouped.get(key) || {
        name: cleanedName,
        district: hospital.district || null,
        state: hospital.state,
        type,
        coordinates: [],
        hospitalCount: 0
      };
      group.hospitalCount += 1;
      if (Number.isFinite(hospital.latitude) && Number.isFinite(hospital.longitude)) {
        group.coordinates.push([hospital.latitude, hospital.longitude]);
      }
      grouped.set(key, group);
    };

    for (const hospital of (data || []).filter(isValidFormattedCommunityFacility)) {
      addLocation(hospital.area, hospital, 'area');
      addLocation(hospital.city, hospital, 'city');
      addLocation(hospital.district, hospital, 'district');
      addLocation(hospital.pincode, hospital, 'pincode');

      const addressParts = String(hospital.address || '')
        .split(',')
        .map(part => part.trim())
        .filter(part =>
          part.length >= 3 &&
          part.length <= 60 &&
          !/^\d+$/.test(part) &&
          !part.toLowerCase().includes('hospital') &&
          !part.toLowerCase().includes('clinic')
        )
        .slice(0, 3);
      for (const part of addressParts) {
        addLocation(part, hospital, 'locality');
      }
    }

    const median = values => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
    };
    const coordinateFallbacks = new Map();
    for (const group of grouped.values()) {
      if (!group.coordinates.length || !group.state) continue;
      const keys = [
        group.district ? `${group.district.toLowerCase()}::${group.state.toLowerCase()}` : null,
        `state::${group.state.toLowerCase()}`
      ].filter(Boolean);
      for (const key of keys) {
        const fallback = coordinateFallbacks.get(key) || [];
        fallback.push(...group.coordinates);
        coordinateFallbacks.set(key, fallback);
      }
    }

    const fallbackCoordinatesFor = group => {
      const districtKey = group.district && group.state
        ? `${group.district.toLowerCase()}::${group.state.toLowerCase()}`
        : null;
      const stateKey = group.state ? `state::${group.state.toLowerCase()}` : null;
      const coordinates = (districtKey && coordinateFallbacks.get(districtKey)) ||
        (stateKey && coordinateFallbacks.get(stateKey)) ||
        [];
      return {
        latitude: median(coordinates.map(coords => coords[0])),
        longitude: median(coordinates.map(coords => coords[1]))
      };
    };
    const scoreLocation = location => {
      const place = location.place.toLowerCase();
      const haystack = [
        location.place,
        location.district,
        location.state,
        location.name
      ].join(' ').toLowerCase();
      let score = location.type === 'catalog' ? 500 : 0;

      if (place === normalizedSearch) score += 100;
      if (place.startsWith(normalizedSearch)) score += 80;
      if (place.includes(normalizedSearch)) score += 60;
      if (normalizedSearch.includes(place)) score += 40;

      for (const term of searchTerms) {
        if (place === term) score += 35;
        else if (place.startsWith(term)) score += 28;
        else if (place.includes(term)) score += 22;
        else if (haystack.includes(term)) score += 12;
      }

      return score;
    };
    const typePriority = {
      catalog: -2,
      area: 0,
      locality: 1,
      city: 2,
      district: 3,
      pincode: 4
    };
    const seenLocationNames = new Set();
    const nearbyCountFor = location => {
      if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
        return null;
      }

      const count = (data || []).filter(hospital =>
        Number.isFinite(hospital.latitude) &&
        Number.isFinite(hospital.longitude) &&
        calculateDistance(location.latitude, location.longitude, hospital.latitude, hospital.longitude) <= 25
      ).length;

      return count || null;
    };
    const locations = [...catalogMatches, ...grouped.values()]
      .map(group => {
        if (group.type === 'catalog') {
          return {
            ...group,
            hospitalCount: group.hospitalCount ?? nearbyCountFor(group)
          };
        }
        const ownLatitude = median(group.coordinates.map(coords => coords[0]));
        const ownLongitude = median(group.coordinates.map(coords => coords[1]));
        const fallback = ownLatitude === null || ownLongitude === null
          ? fallbackCoordinatesFor(group)
          : { latitude: ownLatitude, longitude: ownLongitude };
        return {
          name: [
            group.name,
            group.type !== 'district' ? group.district : null,
            group.state
          ].filter(Boolean).join(', '),
          place: group.name,
          district: group.district,
          state: group.state,
          type: group.type,
          latitude: ownLatitude ?? fallback.latitude,
          longitude: ownLongitude ?? fallback.longitude,
          hospitalCount: group.hospitalCount
        };
      })
      .filter(location => {
        const key = location.name.toLowerCase();
        if (seenLocationNames.has(key)) return false;
        seenLocationNames.add(key);
        return true;
      })
      .sort((a, b) => {
        const scoreDelta = scoreLocation(b) - scoreLocation(a);
        if (scoreDelta !== 0) return scoreDelta;
        const aName = a.place.toLowerCase();
        const bName = b.place.toLowerCase();
        const aExact = aName === normalizedSearch;
        const bExact = bName === normalizedSearch;
        if (aExact !== bExact) return aExact ? -1 : 1;
        const aStarts = aName.startsWith(normalizedSearch);
        const bStarts = bName.startsWith(normalizedSearch);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        const priorityDelta = (typePriority[a.type] ?? 9) - (typePriority[b.type] ?? 9);
        if (priorityDelta !== 0) return priorityDelta;
        return b.hospitalCount - a.hospitalCount;
      })
      .slice(0, 20);

    return res.status(200).json({ locations });
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error searching locations', code: 'INTERNAL_ERROR' }
    });
  }
});

// GET /api/hospitals/nearby?lat=&lng=&radius=
// Fetch hospitals, optionally sorting/filtering by distance using Haversine
router.get('/nearby', async (req, res) => {
  const lat = req.query.lat ? parseFloat(req.query.lat) : null;
  const lng = req.query.lng ? parseFloat(req.query.lng) : null;
  const radius = req.query.radius ? parseFloat(req.query.radius) : 50; // default 50km

  try {
    const { data: hospitals, error } = await supabase
      .from('hospitals')
      .select('*')
      .eq('is_public', true);

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to retrieve hospitals', code: 'DB_ERROR' }
      });
    }

    const validHospitals = (hospitals || [])
      .filter(isValidFormattedCommunityFacility);

    // If coordinates are not provided, return all hospitals unsorted by distance
    if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
      return res.status(200).json({
        hospitals: validHospitals.map(h => ({ ...h, distance: null }))
      });
    }

    // Compute Haversine distance, filter by radius, and sort
    const processedHospitals = validHospitals
      .map(h => {
        const distance = (h.latitude !== null && h.longitude !== null)
          ? calculateDistance(lat, lng, h.latitude, h.longitude)
          : null;
        return { ...h, distance };
      })
      .filter(h => h.distance !== null && h.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    return res.status(200).json({
      hospitals: processedHospitals
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error fetching nearby hospitals', code: 'INTERNAL_ERROR' }
    });
  }
});

// POST /api/hospitals/google-ratings
// Live Google Places enrichment for visible hospital cards. Google content is not persisted.
router.post('/google-ratings', async (req, res) => {
  const hospitalIds = [...new Set(
    (Array.isArray(req.body.hospitalIds) ? req.body.hospitalIds : [])
      .map(id => String(id))
      .filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
  )].slice(0, 24);

  if (!hospitalIds.length) {
    return res.status(200).json({ ratings: {}, source: 'Google Maps' });
  }

  try {
    const { data: hospitals, error: hospitalError } = await supabase
      .from('hospitals')
      .select('id, name, address, city, district, state, latitude, longitude')
      .in('id', hospitalIds);

    if (hospitalError) {
      return res.status(400).json({
        error: { message: 'Could not load hospitals for Google rating lookup', code: 'DB_ERROR' }
      });
    }

    if (!hospitals?.length) {
      return res.status(200).json({ ratings: {}, source: 'Google Maps' });
    }

    const results = await Promise.allSettled(
      hospitals.map(hospital => fetchGoogleHospitalRating(hospital))
    );
    const ratings = {};
    let unavailableCode = null;
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        ratings[hospitals[index].id] = result.value;
      } else if (result.status === 'rejected') {
        unavailableCode ||= result.reason?.code || 'GOOGLE_PLACES_ERROR';
      }
    });

    return res.status(200).json({
      ratings,
      source: 'Google Maps',
      matchedCount: Object.keys(ratings).length,
      requestedCount: hospitals.length,
      warning: unavailableCode
        ? {
            message: unavailableCode === 'RESOURCE_EXHAUSTED'
              ? 'Google rating quota is currently exhausted. Increase Google Places API quota or enable billing to show live Google ratings.'
              : 'Some Google ratings are temporarily unavailable.',
            code: unavailableCode
          }
        : null
    });
  } catch (error) {
    const unavailable = error.status === 403 ||
      error.code === 'GOOGLE_PLACES_NOT_CONFIGURED' ||
      /disabled|not configured|billing/i.test(error.message || '');

    return res.status(unavailable ? 503 : 502).json({
      error: {
        message: unavailable
          ? 'Google Places API (New) must be enabled with billing for live Google ratings.'
          : 'Google ratings are temporarily unavailable.',
        code: unavailable ? 'GOOGLE_PLACES_NOT_CONFIGURED' : 'GOOGLE_PLACES_UNAVAILABLE'
      }
    });
  }
});

// GET /api/hospitals/delhi
// Delhi-only hospitals with active doctor lists.
router.get('/delhi', async (req, res) => {
  return fetchDelhiHospitals(req, res, req.query.district || null);
});

// GET /api/hospitals/delhi/:district
router.get('/delhi/:district', async (req, res) => {
  return fetchDelhiHospitals(req, res, req.params.district);
});

// GET /api/hospitals/:id/ratings
router.get('/:id/ratings', async (req, res) => {
  const { id: hospitalId } = req.params;
  const authHeader = req.headers.authorization;
  let patientId = null;

  try {
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length);
      const { data: { user } } = await supabase.auth.getUser(token);
      patientId = user?.id || null;
    }

    const { data: hospital, error: hospitalError } = await supabase
      .from('hospitals')
      .select('id, rating_avg, rating_count')
      .eq('id', hospitalId)
      .single();

    if (hospitalRatingSchemaMissing(hospitalError)) {
      if (process.env.NODE_ENV !== 'production') {
        const { data: existingHospital, error: existenceError } = await supabase
          .from('hospitals')
          .select('id')
          .eq('id', hospitalId)
          .single();

        if (existenceError || !existingHospital) {
          return res.status(404).json({
            error: { message: 'Hospital profile not found', code: 'NOT_FOUND' }
          });
        }

        return res.status(200).json(
          await getLocalHospitalRatingSummary(hospitalId, patientId)
        );
      }

      return res.status(200).json(
        await getStorageHospitalRatingSummary(hospitalId, patientId)
      );
    }

    if (hospitalError || !hospital) {
      return res.status(404).json({
        error: { message: 'Hospital profile not found', code: 'NOT_FOUND' }
      });
    }

    let userRating = null;
    if (patientId) {
      const { data: existingRating } = await supabase
        .from('hospital_ratings')
        .select('rating')
        .eq('hospital_id', hospitalId)
        .eq('patient_id', patientId)
        .maybeSingle();
      userRating = existingRating?.rating || null;
    }

    return res.status(200).json({
      ...hospitalRatingSummary(hospital),
      userRating
    });
  } catch {
    return res.status(500).json({
      error: { message: 'Internal server error loading hospital ratings', code: 'INTERNAL_ERROR' }
    });
  }
});

// PUT /api/hospitals/:id/ratings
router.put('/:id/ratings', authenticateUser, requireRole('patient'), async (req, res) => {
  const { id: hospitalId } = req.params;
  const rating = Number(req.body.rating);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({
      error: { message: 'Rating must be an integer between 1 and 5', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    const { data: hospital, error: hospitalError } = await supabase
      .from('hospitals')
      .select('id')
      .eq('id', hospitalId)
      .single();

    if (hospitalError || !hospital) {
      return res.status(404).json({
        error: { message: 'Hospital profile not found', code: 'NOT_FOUND' }
      });
    }

    const { error: ratingError } = await supabase
      .from('hospital_ratings')
      .upsert(
        {
          hospital_id: hospitalId,
          patient_id: req.user.id,
          rating,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'hospital_id,patient_id' }
      );

    if (ratingError) {
      if (hospitalRatingSchemaMissing(ratingError)) {
        if (process.env.NODE_ENV !== 'production') {
          const summary = await saveLocalHospitalRating(
            hospitalId,
            req.user.id,
            rating
          );
          return res.status(200).json({
            message: 'Hospital rating saved',
            ...summary
          });
        }

        const summary = await saveStorageHospitalRating(
          hospitalId,
          req.user.id,
          rating
        );
        return res.status(200).json({
          message: 'Hospital rating saved',
          ...summary
        });
      }
      return res.status(400).json({
        error: { message: ratingError.message || 'Failed to save hospital rating', code: 'DB_ERROR' }
      });
    }

    const summary = await refreshHospitalRatingSummary(hospitalId);
    return res.status(200).json({
      message: 'Hospital rating saved',
      ...summary,
      userRating: rating
    });
  } catch {
    return res.status(500).json({
      error: { message: 'Internal server error saving hospital rating', code: 'INTERNAL_ERROR' }
    });
  }
});

// GET /api/hospitals/:id
// Get hospital profile detail and list affiliated active doctors
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Fetch hospital details
    const { data: hospital, error: hospError } = await supabase
      .from('hospitals')
      .select('*')
      .eq('id', id)
      .eq('is_public', true)
      .single();

    if (
      hospError ||
      !hospital ||
      !isValidFormattedCommunityFacility(hospital) ||
      hideDevelopmentHospital(hospital)
    ) {
      return res.status(404).json({
        error: { message: 'Hospital profile not found', code: 'NOT_FOUND' }
      });
    }

    const { available: directoryAvailable, byHospital } = await fetchVerifiedAffiliations([id]);
    const bookableByHospital = await fetchBookableAffiliations([id]);
    const doctors = directoryAvailable ? (byHospital.get(id) || []) : [];

    return res.status(200).json({
      hospital: {
        ...hospital,
        verificationStatus: hospital.verification_status || 'unverified',
        verificationSourceUrl: hospital.verification_source_url || null,
        verifiedAt: hospital.verified_at || null,
        ...hospitalOperatingHoursSummary(hospital),
        ...hospitalRatingSummary(hospital)
      },
      doctors,
      bookableDoctors: bookableByHospital.get(id) || [],
      directoryReady: directoryAvailable &&
        Object.prototype.hasOwnProperty.call(hospital, 'verification_status')
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error fetching hospital profile', code: 'INTERNAL_ERROR' }
    });
  }
});

export default router;
