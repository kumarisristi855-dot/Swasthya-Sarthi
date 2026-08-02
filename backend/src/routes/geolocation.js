import { Router } from 'express';

const router = Router();
const reverseCache = new Map();
const suggestionCache = new Map();
let approximateCache = null;
const CACHE_MS = 24 * 60 * 60 * 1000;
const APPROXIMATE_CACHE_MS = 60 * 60 * 1000;
const SUGGESTION_CACHE_MS = 10 * 60 * 1000;
const indianStatesByIso = {
  'IN-AN': 'Andaman and Nicobar Islands',
  'IN-AP': 'Andhra Pradesh',
  'IN-AR': 'Arunachal Pradesh',
  'IN-AS': 'Assam',
  'IN-BR': 'Bihar',
  'IN-CH': 'Chandigarh',
  'IN-CT': 'Chhattisgarh',
  'IN-DH': 'Dadra and Nagar Haveli and Daman and Diu',
  'IN-DL': 'Delhi',
  'IN-GA': 'Goa',
  'IN-GJ': 'Gujarat',
  'IN-HP': 'Himachal Pradesh',
  'IN-HR': 'Haryana',
  'IN-JH': 'Jharkhand',
  'IN-JK': 'Jammu and Kashmir',
  'IN-KA': 'Karnataka',
  'IN-KL': 'Kerala',
  'IN-LA': 'Ladakh',
  'IN-LD': 'Lakshadweep',
  'IN-MH': 'Maharashtra',
  'IN-ML': 'Meghalaya',
  'IN-MN': 'Manipur',
  'IN-MP': 'Madhya Pradesh',
  'IN-MZ': 'Mizoram',
  'IN-NL': 'Nagaland',
  'IN-OD': 'Odisha',
  'IN-PB': 'Punjab',
  'IN-PY': 'Puducherry',
  'IN-RJ': 'Rajasthan',
  'IN-SK': 'Sikkim',
  'IN-TG': 'Telangana',
  'IN-TN': 'Tamil Nadu',
  'IN-TR': 'Tripura',
  'IN-UP': 'Uttar Pradesh',
  'IN-UT': 'Uttarakhand',
  'IN-WB': 'West Bengal'
};

function stateFromAddress(address) {
  return address.state ||
    indianStatesByIso[address['ISO3166-2-lvl4']] ||
    indianStatesByIso[address['ISO3166-2-lvl6']] ||
    null;
}

function coordinateKey(latitude, longitude) {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

function localityFromAddress(address, fallback = null) {
  return address.neighbourhood ||
    address.suburb ||
    address.quarter ||
    address.village ||
    address.hamlet ||
    address.town ||
    address.city ||
    address.municipality ||
    address.city_district ||
    fallback ||
    null;
}

function districtFromAddress(address) {
  return address.state_district || address.county || address.city_district || null;
}

function formatLocationResult(result, query) {
  const address = result.address || {};
  const state = stateFromAddress(address);
  const district = districtFromAddress(address);
  const locality = localityFromAddress(address, result.name);
  const preciseParts = [...new Set([
    result.name || null,
    address.amenity || address.building || null,
    address.road || address.pedestrian || null,
    address.neighbourhood || address.quarter || null,
    address.suburb || address.village || address.hamlet || address.town || null,
    address.city_district || address.city || address.municipality || null,
    district,
    state,
    address.postcode || null
  ].filter(Boolean))];

  return {
    label: preciseParts.join(', ') || result.display_name || query,
    displayName: result.display_name || null,
    latitude: Number(result.lat),
    longitude: Number(result.lon),
    locality,
    district,
    state,
    pincode: address.postcode || null,
    country: address.country || null
  };
}

function scoreLocationResult(result, query) {
  const address = result.address || {};
  const normalizedQuery = query.toLowerCase();
  const name = String(result.name || '').toLowerCase();
  const displayName = String(result.display_name || '').toLowerCase();
  const classType = `${result.class || ''}:${result.type || ''}`;
  let score = 0;

  if (address.country_code === 'in') score += 40;
  if (name === normalizedQuery) score += 35;
  if (displayName.includes(normalizedQuery)) score += 20;
  if (localityFromAddress(address, result.name)) score += 15;
  if (districtFromAddress(address)) score += 8;
  if (stateFromAddress(address)) score += 8;
  if (['place:city', 'place:town', 'place:village', 'place:suburb', 'place:neighbourhood', 'boundary:administrative'].includes(classType)) {
    score += 18;
  }
  if (Number.isFinite(Number(result.importance))) score += Number(result.importance) * 10;

  return score;
}

function googleAddressComponent(components, type) {
  return components.find(component => component.types?.includes(type))?.long_name || null;
}

function formatGoogleGeocodeResult(result, query) {
  const components = result.address_components || [];
  const geometry = result.geometry?.location || {};
  const structuredLocality = googleAddressComponent(components, 'sublocality_level_1') ||
    googleAddressComponent(components, 'sublocality') ||
    googleAddressComponent(components, 'neighborhood') ||
    googleAddressComponent(components, 'locality') ||
    googleAddressComponent(components, 'administrative_area_level_3') ||
    googleAddressComponent(components, 'administrative_area_level_2') ||
    query;
  const formattedPrimary = String(result.formatted_address || '')
    .split(',')[0]
    .trim();
  const queryWords = String(query || '')
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(word => word.length >= 3);
  const primaryMatchesQuery = formattedPrimary && queryWords.some(word =>
    formattedPrimary.toLowerCase().includes(word)
  );
  // Google can return the requested neighbourhood only in formatted_address
  // while its structured locality points at a broader adjacent area.
  const locality = primaryMatchesQuery ? formattedPrimary : structuredLocality;
  const district = googleAddressComponent(components, 'administrative_area_level_3') ||
    googleAddressComponent(components, 'administrative_area_level_2') ||
    null;
  const state = googleAddressComponent(components, 'administrative_area_level_1');
  const pincode = googleAddressComponent(components, 'postal_code');
  const labelParts = [...new Set([
    locality,
    structuredLocality !== locality ? structuredLocality : null,
    district,
    state,
    pincode
  ].filter(Boolean))];

  return {
    label: labelParts.join(', ') || result.formatted_address || query,
    displayName: result.formatted_address || null,
    latitude: Number(geometry.lat),
    longitude: Number(geometry.lng),
    locality,
    district,
    state,
    pincode,
    country: googleAddressComponent(components, 'country'),
    provider: 'google'
  };
}

async function fetchGoogleGeocode(query) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', `${query}, India`);
  url.searchParams.set('components', 'country:IN');
  url.searchParams.set('region', 'in');
  url.searchParams.set('key', process.env.GOOGLE_MAPS_API_KEY);

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Google geocoder returned ${response.status}`);

  const data = await response.json();
  if (data.status !== 'OK' || !Array.isArray(data.results) || !data.results.length) {
    return null;
  }

  const result = data.results.find(row =>
    row.address_components?.some(component =>
      component.types?.includes('country') && component.short_name === 'IN'
    )
  ) || data.results[0];

  return formatGoogleGeocodeResult(result, query);
}

function formatGooglePlaceResult(place, query) {
  const components = (place.addressComponents || []).map(component => ({
    long_name: component.longText,
    short_name: component.shortText,
    types: component.types
  }));
  const location = place.location || {};
  return formatGoogleGeocodeResult({
    formatted_address: place.formattedAddress,
    address_components: components,
    geometry: {
      location: {
        lat: location.latitude,
        lng: location.longitude
      }
    }
  }, query);
}

async function fetchGoogleAutocompleteNew(query) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return [];

  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': [
        'suggestions.placePrediction.placeId',
        'suggestions.placePrediction.text.text',
        'suggestions.placePrediction.structuredFormat.mainText.text'
      ].join(',')
    },
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ['in'],
      languageCode: 'en'
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Google Places New returned ${response.status}`);

  const data = await response.json();
  return (data.suggestions || [])
    .map(suggestion => suggestion.placePrediction)
    .filter(Boolean)
    .slice(0, 8)
    .map(prediction => ({
      name: prediction.text?.text,
      place: prediction.structuredFormat?.mainText?.text || prediction.text?.text?.split(',')[0],
      placeId: prediction.placeId,
      provider: 'google'
    }))
    .filter(suggestion => suggestion.name && suggestion.placeId);
}

async function fetchGoogleAutocompleteLegacy(query) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return [];

  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', query);
  url.searchParams.set('components', 'country:in');
  url.searchParams.set('types', 'geocode');
  url.searchParams.set('language', 'en');
  url.searchParams.set('key', process.env.GOOGLE_MAPS_API_KEY);

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Google Places returned ${response.status}`);

  const data = await response.json();
  if (!['OK', 'ZERO_RESULTS'].includes(data.status)) {
    throw new Error(data.error_message || `Google Places returned ${data.status}`);
  }

  return (data.predictions || []).slice(0, 8).map(prediction => ({
    name: prediction.description,
    place: prediction.structured_formatting?.main_text || prediction.description.split(',')[0],
    placeId: prediction.place_id,
    provider: 'google'
  }));
}

async function fetchGooglePlaceDetailsNew(placeId, query) {
  if (!process.env.GOOGLE_MAPS_API_KEY || !placeId) return null;

  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      Accept: 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'formattedAddress,location,addressComponents'
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Google Place Details New returned ${response.status}`);

  const place = await response.json();
  if (!place.location) return null;
  return formatGooglePlaceResult(place, query);
}

async function fetchGoogleLocation(query, placeId = null) {
  const placeResult = await fetchGooglePlaceDetailsNew(placeId, query);
  if (placeResult) return placeResult;

  const suggestions = await fetchGoogleAutocompleteNew(query);
  if (suggestions[0]?.placeId) {
    const suggestionResult = await fetchGooglePlaceDetailsNew(suggestions[0].placeId, query);
    if (suggestionResult) return suggestionResult;
  }

  return fetchGoogleGeocode(query);
}

async function fetchOpenStreetMapSuggestions(query) {
  const baseUrl = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
  const compactQuery = query.replace(/,/g, ' ');
  const queryParts = query
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length >= 2);
  const tailQuery = queryParts.slice(1).join(', ');
  const candidateQueries = [...new Set([
    query,
    compactQuery,
    `${query}, India`,
    `${compactQuery}, India`,
    queryParts[0] ? `${queryParts[0]}, India` : null,
    queryParts[0] && queryParts.at(-1) ? `${queryParts[0]}, ${queryParts.at(-1)}, India` : null,
    tailQuery ? `${tailQuery}, India` : null,
    queryParts[0] && tailQuery ? `${queryParts[0]}, ${tailQuery}, Delhi, India` : null
  ].filter(Boolean))];
  const rows = [];

  for (const candidateQuery of candidateQueries) {
    try {
      const url = new URL('/search', baseUrl);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('q', candidateQuery);
      url.searchParams.set('countrycodes', 'in');
      url.searchParams.set('limit', '5');
      url.searchParams.set('addressdetails', '1');

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': process.env.NOMINATIM_USER_AGENT || 'CareSyncHealthcarePlatform/1.0'
        },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) continue;

      const resultRows = await response.json();
      rows.push(...(Array.isArray(resultRows) ? resultRows : []));
    } catch {
      // Keep trying broader candidates.
    }
    if (rows.length >= 8) break;
  }

  const seen = new Set();
  return rows
    .filter(row => row?.address?.country_code === 'in' || row?.display_name?.includes('India'))
    .sort((a, b) => scoreLocationResult(b, query) - scoreLocationResult(a, query))
    .map(row => formatLocationResult(row, query))
    .filter(location =>
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude) &&
      !seen.has(location.label.toLowerCase()) &&
      seen.add(location.label.toLowerCase())
    )
    .slice(0, 8)
    .map(location => ({
      name: location.label,
      place: location.locality || location.label.split(',')[0],
      latitude: location.latitude,
      longitude: location.longitude,
      district: location.district,
      state: location.state,
      provider: 'openstreetmap'
    }));
}

router.get('/suggest', async (req, res) => {
  const query = String(req.query.q || '')
    .replace(/[<>{}[\]]/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

  if (query.length < 2) {
    return res.status(400).json({
      error: { message: 'Enter at least two characters for location suggestions', code: 'VALIDATION_ERROR' }
    });
  }

  const cacheKey = query.toLowerCase();
  const cached = suggestionCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < SUGGESTION_CACHE_MS) {
    return res.status(200).json({ suggestions: cached.suggestions, provider: cached.provider, cached: true });
  }

  try {
    let suggestions = [];
    try {
      suggestions = await fetchGoogleAutocompleteNew(query);
    } catch {
      suggestions = await fetchGoogleAutocompleteLegacy(query);
    }

    suggestionCache.set(cacheKey, { createdAt: Date.now(), provider: 'google', suggestions });
    return res.status(200).json({ suggestions, provider: 'google', cached: false });
  } catch {
    try {
      const suggestions = await fetchOpenStreetMapSuggestions(query);
      suggestionCache.set(cacheKey, { createdAt: Date.now(), provider: 'openstreetmap', suggestions });
      return res.status(200).json({ suggestions, provider: 'openstreetmap', cached: false });
    } catch {
      return res.status(502).json({
        error: { message: 'Location suggestions are temporarily unavailable', code: 'PLACES_UNAVAILABLE' }
      });
    }
  }
});

router.get('/search', async (req, res) => {
  const query = String(req.query.q || '')
    .replace(/[<>{}[\]]/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  const placeId = String(req.query.placeId || '')
    .replace(/[<>{}[\]]/g, ' ')
    .trim()
    .slice(0, 180);

  if (query.length < 2) {
    return res.status(400).json({
      error: { message: 'An area, neighbourhood, landmark, or address is required', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    const googleResult = await fetchGoogleLocation(query, placeId || null);
    if (
      googleResult &&
      Number.isFinite(googleResult.latitude) &&
      Number.isFinite(googleResult.longitude)
    ) {
      return res.status(200).json(googleResult);
    }
  } catch {
    // Fall back to OpenStreetMap so location search still works if Google is unavailable.
  }

  try {
    const baseUrl = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
    const queryParts = query
      .split(',')
      .map(part => part.trim())
      .filter(part => part.length >= 2);
    const compactQuery = query.replace(/,/g, ' ');
    const tailQuery = queryParts.slice(1).join(', ');
    const candidateQueries = [...new Set([
      query,
      compactQuery,
      `${query}, India`,
      `${compactQuery}, India`,
      tailQuery ? `${tailQuery}, India` : null,
      queryParts[0] && tailQuery ? `${queryParts[0]}, ${tailQuery}, Delhi, India` : null,
      `${query} village, India`,
      `${query} locality, India`
    ].filter(Boolean))];
    const rows = [];

    for (const candidateQuery of candidateQueries) {
      const url = new URL('/search', baseUrl);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('q', candidateQuery);
      url.searchParams.set('countrycodes', 'in');
      url.searchParams.set('limit', '5');
      url.searchParams.set('addressdetails', '1');

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': process.env.NOMINATIM_USER_AGENT || 'CareSyncHealthcarePlatform/1.0'
        },
        signal: AbortSignal.timeout(12000)
      });

      if (!response.ok) throw new Error(`Location search returned ${response.status}`);

      const resultRows = await response.json();
      rows.push(...(Array.isArray(resultRows) ? resultRows : []));
      if (rows.length >= 5) break;
    }

    const result = rows
      .filter(row => row?.address?.country_code === 'in' || row?.display_name?.includes('India'))
      .sort((a, b) => scoreLocationResult(b, query) - scoreLocationResult(a, query))[0];

    if (!result) {
      return res.status(404).json({
        error: { message: 'No matching location was found', code: 'LOCATION_NOT_FOUND' }
      });
    }

    return res.status(200).json(formatLocationResult(result, query));
  } catch {
    return res.status(502).json({
      error: { message: 'Location search is temporarily unavailable', code: 'GEOCODER_UNAVAILABLE' }
    });
  }
});

router.get('/reverse', async (req, res) => {
  const latitude = Number.parseFloat(req.query.lat);
  const longitude = Number.parseFloat(req.query.lng);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return res.status(400).json({
      error: { message: 'Valid latitude and longitude are required', code: 'VALIDATION_ERROR' }
    });
  }

  const key = coordinateKey(latitude, longitude);
  const cached = reverseCache.get(key);
  if (cached && Date.now() - cached.createdAt < CACHE_MS) {
    return res.status(200).json({ ...cached.value, cached: true });
  }

  try {
    const baseUrl = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
    const url = new URL('/reverse', baseUrl);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': process.env.NOMINATIM_USER_AGENT || 'CareSyncHealthcarePlatform/1.0'
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
      throw new Error(`Reverse geocoder returned ${response.status}`);
    }

    const result = await response.json();
    const address = result.address || {};
    const locality = localityFromAddress(address);
    const district = districtFromAddress(address);
    const state = stateFromAddress(address);
    const labelParts = [...new Set([locality, district, state].filter(Boolean))];
    const preciseParts = [...new Set([
      result.name || null,
      address.amenity || address.building || address.office || null,
      address.road || address.pedestrian || null,
      address.neighbourhood || address.quarter || null,
      address.suburb || address.village || address.town || null,
      address.city_district || address.city || address.municipality || null,
      district,
      state,
      address.postcode || null
    ].filter(Boolean))];
    const value = {
      label: labelParts.join(', ') || result.display_name || 'Current location',
      preciseLabel: preciseParts.join(', ') || result.display_name || 'Current location',
      displayName: result.display_name || null,
      locality,
      district,
      state,
      pincode: address.postcode || null,
      country: address.country || null
    };

    reverseCache.set(key, { createdAt: Date.now(), value });
    return res.status(200).json({ ...value, cached: false });
  } catch {
    return res.status(502).json({
      error: { message: 'Could not resolve this coordinate to a locality', code: 'GEOCODER_UNAVAILABLE' }
    });
  }
});

router.get('/approximate', async (req, res) => {
  if (approximateCache && Date.now() - approximateCache.createdAt < APPROXIMATE_CACHE_MS) {
    return res.status(200).json({ ...approximateCache.value, cached: true });
  }

  try {
    const response = await fetch('https://ipwho.is/', {
      headers: {
        Accept: 'application/json',
        'User-Agent': process.env.NOMINATIM_USER_AGENT || 'CareSyncHealthcarePlatform/1.0'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) throw new Error(`IP location service returned ${response.status}`);

    const result = await response.json();
    if (!result.success || !result.city || !result.country) {
      throw new Error('IP location service did not return a usable locality');
    }

    const label = [...new Set([result.city, result.region].filter(Boolean))].join(', ');
    const value = {
      label,
      city: result.city,
      state: result.region || null,
      country: result.country,
      latitude: Number.isFinite(Number(result.latitude)) ? Number(result.latitude) : null,
      longitude: Number.isFinite(Number(result.longitude)) ? Number(result.longitude) : null,
      accuracy: 'approximate-network-location'
    };

    approximateCache = { createdAt: Date.now(), value };
    return res.status(200).json({ ...value, cached: false });
  } catch {
    return res.status(502).json({
      error: { message: 'Could not determine an approximate city', code: 'APPROXIMATE_LOCATION_UNAVAILABLE' }
    });
  }
});

export default router;
