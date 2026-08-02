import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticateUser } from '../middleware/auth.js';
import { calculateDistance } from '../services/geolocation/haversine.js';
import { getPublicDoctorAvailability } from '../data/publicDoctorAvailability.js';

const router = Router();
const providerCache = new Map();
const PROVIDER_CACHE_MS = 30 * 60 * 1000;

function isMissingDirectorySchema(error) {
  return error?.code === 'PGRST204' ||
    error?.code === 'PGRST205' ||
    error?.code === '42501';
}

function normalizeLocationValue(value) {
  return String(value || '')
    .replace(/[%_,().]/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

function hospitalMatchesLocationText(hospital, locationParts) {
  const searchableText = [
    hospital.name,
    hospital.address,
    hospital.city,
    hospital.district,
    hospital.state,
    hospital.pincode
  ].map(value => normalizeLocationValue(value)).filter(Boolean).join(' ');

  return locationParts.some(part => part && searchableText.includes(part));
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
    console.warn('Unable to load bookable doctor ratings for directory:', error.message || error);
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

router.get('/doctors', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('verified_doctors')
      .select(`
        id,
        full_name,
        credentials,
        years_experience,
        official_profile_url,
        source_name,
        verified_at,
        specialization:specializations!specialization_id (
          id,
          name
        ),
        affiliations:verified_doctor_hospital_affiliations!doctor_id (
          id,
          department_name,
          official_booking_url,
          source_url,
          verified_at,
          status,
          hospital:hospitals!hospital_id (
            id,
            name,
            address,
            city,
            district,
            state,
            pincode,
            latitude,
            longitude,
            verification_status,
            verification_level,
            is_public
          )
        )
      `)
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (error) {
      if (isMissingDirectorySchema(error)) {
        return res.status(503).json({
          error: {
            message: 'The verified directory tables or database grants are not ready yet.',
            code: 'DIRECTORY_NOT_READY'
          }
        });
      }
      return res.status(400).json({
        error: { message: error.message || 'Failed to load verified doctors', code: 'DB_ERROR' }
      });
    }

    const query = String(req.query.q || '').trim().toLowerCase();
    const hospitalName = String(req.query.hospitalName || '').trim().toLowerCase();
    const district = String(req.query.district || '').trim().toLowerCase();
    const place = normalizeLocationValue(req.query.place);
    const state = normalizeLocationValue(req.query.state);
    const availableDay = String(req.query.availableDay || '').trim();
    const validDays = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    const specializationId = req.query.specializationId
      ? Number(req.query.specializationId)
      : null;
    const latitude = Number.parseFloat(req.query.lat);
    const longitude = Number.parseFloat(req.query.lng);
    const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude);
    const requestedRadius = Number.parseFloat(req.query.radius);
    const radius = Number.isFinite(requestedRadius)
      ? Math.min(Math.max(requestedRadius, 1), 500)
      : 150;

    const ratingsByName = await fetchBookableRatingsByName();

    const doctors = (data || [])
      .map(doctor => {
        const rating = ratingsByName.get(normalizeDoctorName(doctor.full_name)) || {
          ratingAvg: 0,
          ratingCount: 0
        };
        const hospitals = (doctor.affiliations || [])
          .filter(affiliation =>
            affiliation.status === 'verified' &&
            affiliation.hospital?.is_public === true
          )
          .map(affiliation => {
            const hospitalLatitude = affiliation.hospital.latitude;
            const hospitalLongitude = affiliation.hospital.longitude;
            const hasHospitalCoordinates =
              hospitalLatitude !== null &&
              hospitalLatitude !== '' &&
              hospitalLongitude !== null &&
              hospitalLongitude !== '' &&
              Number.isFinite(Number(hospitalLatitude)) &&
              Number.isFinite(Number(hospitalLongitude));

            return {
              associationId: affiliation.id,
              id: affiliation.hospital.id,
              name: affiliation.hospital.name,
              address: affiliation.hospital.address,
              city: affiliation.hospital.city,
              district: affiliation.hospital.district,
              state: affiliation.hospital.state,
              pincode: affiliation.hospital.pincode,
              latitude: affiliation.hospital.latitude,
              longitude: affiliation.hospital.longitude,
              distance: hasLocation && hasHospitalCoordinates
                ? calculateDistance(
                  latitude,
                  longitude,
                  Number(hospitalLatitude),
                  Number(hospitalLongitude)
                )
                : null,
              departmentName: affiliation.department_name,
              officialBookingUrl: affiliation.official_booking_url,
              sourceUrl: affiliation.source_url,
              verifiedAt: affiliation.verified_at,
              publicAvailability: getPublicDoctorAvailability(
                doctor.full_name,
                affiliation.hospital.name
              )
            };
          });

        return {
          id: doctor.id,
          fullName: doctor.full_name,
          specializationId: doctor.specialization?.id || null,
          specialization: doctor.specialization?.name || 'Specialization not listed',
          credentials: doctor.credentials,
          yearsExperience: doctor.years_experience,
          officialProfileUrl: doctor.official_profile_url,
          sourceName: doctor.source_name,
          verifiedAt: doctor.verified_at,
          directoryOnly: true,
          ratingAvg: rating.ratingAvg,
          ratingCount: rating.ratingCount,
          hospitals
        };
      })
      .filter(doctor => doctor.hospitals.length > 0)
      .filter(doctor => !query || doctor.fullName.toLowerCase().includes(query))
      .filter(doctor => !specializationId || doctor.specializationId === specializationId)
      .filter(doctor => !hospitalName || doctor.hospitals.some(hospital =>
        hospital.name.toLowerCase().includes(hospitalName)
      ))
      .filter(doctor =>
        hasLocation ||
        !place ||
        doctor.hospitals.some(hospital => hospitalMatchesLocationText(hospital, [place]))
      )
      .map(doctor => {
        let hospitals = district
          ? doctor.hospitals.filter(hospital => hospital.district?.toLowerCase() === district)
          : doctor.hospitals;

        if (hasLocation) {
          const fallbackLocationParts = [place, state, district].filter(Boolean);
          hospitals = hospitals.filter(hospital =>
            (hospital.distance !== null && hospital.distance <= radius) ||
            (
              hospital.distance === null &&
              fallbackLocationParts.length > 0 &&
              hospitalMatchesLocationText(hospital, fallbackLocationParts)
            )
          );
        }
        if (validDays.has(availableDay)) {
          hospitals = hospitals.filter(hospital =>
            hospital.publicAvailability?.schedules?.some(schedule =>
              schedule.days.includes(availableDay)
            )
          );
        }

        hospitals.sort((a, b) =>
          (a.distance ?? Number.POSITIVE_INFINITY) -
          (b.distance ?? Number.POSITIVE_INFINITY)
        );

        return {
          ...doctor,
          hospitals,
          hospital: hospitals[0] || null,
          distance: hospitals[0]?.distance ?? null
        };
      })
      .filter(doctor => doctor.hospitals.length > 0)
      .sort((a, b) =>
        (a.distance ?? Number.POSITIVE_INFINITY) -
        (b.distance ?? Number.POSITIVE_INFINITY) ||
        a.fullName.localeCompare(b.fullName)
      );

    return res.status(200).json({
      region: hasLocation ? `${radius} km from selected location` : 'India',
      directoryType: 'source-verified-public-directory',
      doctors
    });
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error loading verified doctors', code: 'INTERNAL_ERROR' }
    });
  }
});

// Named doctor practices and clinics mapped by OpenStreetMap contributors.
// These are discovery leads, not source-verified hospital affiliations.
router.get('/community-providers', authenticateUser, async (req, res) => {
  const location = String(req.query.location || '').replace(/[<>{}[\]]/g, ' ').trim().slice(0, 120);
  const latitude = Number.parseFloat(req.query.lat);
  const longitude = Number.parseFloat(req.query.lng);
  const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude);

  if (location.length < 2) {
    return res.status(400).json({
      error: { message: 'A city, district, or state is required', code: 'VALIDATION_ERROR' }
    });
  }

  const cacheKey = location.toLowerCase();
  const cached = providerCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < PROVIDER_CACHE_MS) {
    const providers = cached.providers
      .map(provider => ({
        ...provider,
        distance: hasLocation
          ? calculateDistance(latitude, longitude, provider.latitude, provider.longitude)
          : null
      }))
      .filter(provider => provider.distance === null || provider.distance <= 150)
      .sort((a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY));
    return res.status(200).json({
      directoryType: 'openstreetmap-community-provider-directory',
      cached: true,
      providers
    });
  }

  try {
    const baseUrl = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
    const url = new URL('/search', baseUrl);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('q', `doctor in ${location}, India`);
    url.searchParams.set('countrycodes', 'in');
    url.searchParams.set('limit', '40');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('extratags', '1');
    url.searchParams.set('namedetails', '1');

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': process.env.NOMINATIM_USER_AGENT || 'CareSyncHealthcarePlatform/1.0'
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      throw new Error(`Provider directory returned HTTP ${response.status}`);
    }

    const rows = await response.json();
    const seen = new Set();
    const providers = (Array.isArray(rows) ? rows : [])
      .map(row => {
        const providerLatitude = Number.parseFloat(row.lat);
        const providerLongitude = Number.parseFloat(row.lon);
        const sourceId = `${row.osm_type || 'node'}/${row.osm_id}`;
        const name = row.namedetails?.name ||
          row.namedetails?.['name:en'] ||
          String(row.display_name || '').split(',')[0].trim();
        const specialtyText = row.extratags?.['healthcare:speciality'] ||
          row.extratags?.speciality ||
          null;

        return {
          id: `osm-${String(row.osm_type || 'node').charAt(0)}-${row.osm_id}`,
          name,
          address: row.display_name,
          latitude: providerLatitude,
          longitude: providerLongitude,
          providerType: row.type === 'doctors' ? 'Doctor or medical practice' : 'Healthcare provider',
          specialties: specialtyText
            ? specialtyText.split(/[;,]/).map(value => value.trim()).filter(Boolean)
            : [],
          phone: row.extratags?.phone || row.extratags?.['contact:phone'] || null,
          website: row.extratags?.website || row.extratags?.['contact:website'] || null,
          sourceUrl: `https://www.openstreetmap.org/${sourceId}`,
          verificationLevel: 'community-mapped',
          distance: hasLocation && Number.isFinite(providerLatitude) && Number.isFinite(providerLongitude)
            ? calculateDistance(latitude, longitude, providerLatitude, providerLongitude)
            : null
        };
      })
      .filter(provider =>
        provider.name &&
        Number.isFinite(provider.latitude) &&
        Number.isFinite(provider.longitude) &&
        (provider.distance === null || provider.distance <= 150) &&
        !seen.has(provider.id) &&
        seen.add(provider.id)
      )
      .sort((a, b) =>
        (a.distance ?? Number.POSITIVE_INFINITY) -
        (b.distance ?? Number.POSITIVE_INFINITY)
      )
      .slice(0, 30);

    providerCache.set(cacheKey, {
      createdAt: Date.now(),
      providers: providers.map(({ distance, ...provider }) => provider)
    });

    return res.status(200).json({
      directoryType: 'openstreetmap-community-provider-directory',
      cached: false,
      attribution: 'OpenStreetMap contributors',
      providers
    });
  } catch (error) {
    return res.status(502).json({
      error: {
        message: 'The community provider directory is temporarily unavailable',
        code: 'PROVIDER_DIRECTORY_UNAVAILABLE'
      }
    });
  }
});

export default router;
