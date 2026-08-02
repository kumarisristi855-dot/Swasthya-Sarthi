import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { isDevelopmentFixtureHospital } from './src/lib/developmentFixtures.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const applyChanges = process.argv.includes('--apply');
const allowGeocode = process.argv.includes('--geocode');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number.parseInt(limitArg.split('=')[1], 10) || 100) : 100;

// Manually curated from public map/address references for rows that the national
// directory imported without geocoordinates. Keep this small and auditable.
const curatedCoordinates = new Map([
  ['9637a994-6482-417a-a466-3627b8e3368f', {
    latitude: 25.9023,
    longitude: 87.4358,
    source: 'manual-public-map-cross-check',
    note: 'Approximate public-map coordinate for Katerahat, Dagarua, Purnia, Bihar'
  }],
  ['dc965b33-ea46-4bea-ad9d-8168f2c87774', {
    latitude: 25.8089,
    longitude: 87.1292,
    source: 'manual-public-map-cross-check',
    note: 'Approximate public-map coordinate for Chapay/Chopra area, Krityanand Nagar, Purnia, Bihar'
  }],
  ['1bba2a45-3654-423c-a968-c085dfc60031', {
    latitude: 25.5321,
    longitude: 85.2437,
    source: 'manual-public-map-cross-check',
    note: 'Approximate public-map coordinate for Machariyawan, Daniyawan, Patna, Bihar'
  }],
  ['2216edf9-5549-4d83-bd24-bb210e053b66', {
    latitude: 21.4168,
    longitude: 73.5063,
    source: 'manual-public-map-cross-check',
    note: 'Approximate public-map coordinate for Sarda, Umarpada, Surat, Gujarat'
  }],
  ['29c49fb7-9626-4d84-a186-6e10df6c127b', {
    latitude: 23.6747114,
    longitude: 86.1458528,
    source: 'latlong.net',
    sourceUrl: 'https://www.latlong.net/poi/bokaro-general-hopital-361860',
    note: 'Bokaro General Hospital coordinates; address cross-checked with District Bokaro public utility page'
  }],
  ['78b22a11-45ec-4c05-9071-086459204f09', {
    latitude: 23.6435,
    longitude: 86.1726,
    source: 'manual-public-map-cross-check',
    sourceUrl: 'https://www.mjmhospitalbokaro.com/',
    note: 'Approximate coordinate for official address Ushardih, Bijulia, Talgaria Road, Chas, Bokaro'
  }],
  ['17975555-55fa-4556-a31d-9d78630d7d8d', {
    latitude: 23.6388,
    longitude: 86.1698,
    source: 'manual-public-map-cross-check',
    sourceUrl: 'https://kmm-hospital.com/departments/',
    note: 'Approximate coordinate for official address Bypass Road, Chas, Bokaro District'
  }]
]);

function hasCoordinates(hospital) {
  return hospital.latitude !== null &&
    hospital.longitude !== null &&
    hospital.latitude !== '' &&
    hospital.longitude !== '' &&
    Number.isFinite(Number(hospital.latitude)) &&
    Number.isFinite(Number(hospital.longitude));
}

function queryForHospital(hospital) {
  return [
    hospital.name,
    hospital.address,
    hospital.city,
    hospital.district,
    hospital.state,
    hospital.pincode,
    'India'
  ].filter(Boolean).join(', ');
}

async function geocode(hospital) {
  const baseUrl = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
  const url = new URL('/search', baseUrl);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', queryForHospital(hospital));
  url.searchParams.set('countrycodes', 'in');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': process.env.NOMINATIM_USER_AGENT || 'SwasthyaSarthiHealthcarePlatform/1.0'
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Nominatim returned HTTP ${response.status}`);

  const rows = await response.json();
  const match = Array.isArray(rows) ? rows[0] : null;
  if (!match) return null;

  const latitude = Number.parseFloat(match.lat);
  const longitude = Number.parseFloat(match.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    latitude,
    longitude,
    source: 'nominatim-openstreetmap',
    sourceUrl: `https://www.openstreetmap.org/${match.osm_type}/${match.osm_id}`,
    note: match.display_name
  };
}

function buildUpdate(hospital, coordinate) {
  const verificationSources = Array.isArray(hospital.verification_sources)
    ? hospital.verification_sources
    : [];
  const nextSources = [
    ...verificationSources,
    {
      type: 'secondary',
      name: coordinate.source,
      url: coordinate.sourceUrl || null,
      note: coordinate.note || null,
      checkedAt: new Date().toISOString()
    }
  ];

  return {
    id: hospital.id,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    secondary_source_url: coordinate.sourceUrl || hospital.secondary_source_url || null,
    verification_sources: nextSources,
    updated_at: new Date().toISOString()
  };
}

async function main() {
  const curatedIds = [...curatedCoordinates.keys()];
  const curatedResult = curatedIds.length
    ? await supabase
      .from('hospitals')
      .select('id,name,address,city,district,state,pincode,latitude,longitude,is_public,verification_level,verification_status,verification_sources,secondary_source_url,updated_at,source_dataset')
      .in('id', curatedIds)
    : { data: [], error: null };
  if (curatedResult.error) throw curatedResult.error;

  const broadResult = allowGeocode
    ? await supabase
      .from('hospitals')
      .select('id,name,address,city,district,state,pincode,latitude,longitude,is_public,verification_level,verification_status,verification_sources,secondary_source_url,updated_at,source_dataset')
      .or('latitude.is.null,longitude.is.null')
      .limit(limit)
    : { data: [], error: null };
  if (broadResult.error) throw broadResult.error;

  const rowsById = new Map([
    ...(curatedResult.data || []),
    ...(broadResult.data || [])
  ].map(row => [row.id, row]));

  const data = [...rowsById.values()];

  const candidates = (data || [])
    .filter(hospital => !isDevelopmentFixtureHospital(hospital))
    .filter(hospital =>
      !hasCoordinates(hospital) &&
      (allowGeocode || curatedCoordinates.has(hospital.id)) &&
      (
        hospital.is_public ||
        hospital.verification_level !== 'unverified' ||
        hospital.verification_status === 'verified'
      )
    );

  const updates = [];
  const unresolved = [];
  for (const hospital of candidates) {
    let coordinate = curatedCoordinates.get(hospital.id) || null;
    if (!coordinate && allowGeocode) {
      try {
        coordinate = await geocode(hospital);
      } catch (error) {
        unresolved.push({
          id: hospital.id,
          name: hospital.name,
          reason: error.message || 'Geocode failed'
        });
        continue;
      }
    }

    if (!coordinate) {
      unresolved.push({
        id: hospital.id,
        name: hospital.name,
        reason: allowGeocode ? 'No coordinate match found' : 'No curated coordinate available; rerun with --geocode to search Nominatim'
      });
      continue;
    }

    updates.push(buildUpdate(hospital, coordinate));
  }

  console.log(JSON.stringify({
    mode: applyChanges ? 'apply' : 'dry-run',
    scanned: data?.length || 0,
    candidates: candidates.length,
    repairCount: updates.length,
    unresolvedCount: unresolved.length,
    updates,
    unresolved
  }, null, 2));

  if (!applyChanges || updates.length === 0) return;
  for (const update of updates) {
    const { id, ...values } = update;
    const { error: updateError } = await supabase
      .from('hospitals')
      .update(values)
      .eq('id', id);
    if (updateError) throw updateError;
  }
}

try {
  await main();
} catch (error) {
  console.error('Missing coordinate repair failed:', error.message || error);
  process.exitCode = 1;
}
