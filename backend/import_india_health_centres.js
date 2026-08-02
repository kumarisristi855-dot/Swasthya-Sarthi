import crypto from 'crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ensureGovernmentFacilityTypeName,
  extractIndianPincode,
  isDelhiAgencyLabel,
  normalizeDelhiDirectoryRecord
} from './src/services/geolocation/hospitalDirectoryNormalization.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const sourceDataset = 'data.gov.in-all-india-health-centres';
const sourcePage =
  'https://www.data.gov.in/resource/all-india-health-centres-directory-7th-october-2016';
const csvUrls = [
  'http://data.gov.in/sites/default/files/dataurl14092017/geocode_health_centre.csv',
  'https://www.data.gov.in/files/ogdpv2dms/s3fs-public/dataurl14092017/geocode_health_centre.csv'
];
const sourceLastUpdated = '2019-08-20';
const cachePath = path.join(os.tmpdir(), 'careSync_health_centres.csv');
const batchSize = 500;
const dryRun = process.argv.includes('--dry-run');

const facilityTypes = {
  chc: 'Community Health Centre',
  dis_h: 'District Hospital',
  phc: 'Primary Health Centre',
  s_t_h: 'State Hospital',
  sub_cen: 'Health Sub-Centre'
};

function clean(value) {
  const text = String(value ?? '').trim();
  if (!text || /^n\/?a$/i.test(text) || /^not available$/i.test(text)) return null;
  return text;
}

function coordinate(value, min, max) {
  const number = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function sourceRecordId(row) {
  const officialId = clean(row.Nin_N);
  if (officialId) return `nin:${officialId}`;

  const identity = [
    clean(row['State Name']),
    clean(row['District Name']),
    clean(row['Subdistrict Name']),
    clean(row['Facility Type']),
    clean(row['Facility Name']),
    clean(row['Facility Address']),
    clean(row.Latitude),
    clean(row.Longitude)
  ].map(value => value?.toLowerCase() || '').join('|');

  return `row:${crypto.createHash('sha256').update(identity).digest('hex')}`;
}

function toHospital(row) {
  const name = clean(row['Facility Name']);
  const state = clean(row['State Name']);
  const district = clean(row['District Name']);
  if (!name || !state || !district) return null;
  if (String(row.ActiveFlag_C || '').trim().toUpperCase() === 'N') return null;

  const subdistrict = clean(row['Subdistrict Name']);
  const facilityTypeCode = String(row['Facility Type'] || '').trim().toLowerCase();
  const hospitalType = facilityTypes[facilityTypeCode] || 'Health Facility';
  const addressParts = [
    clean(row['Facility Address']),
    subdistrict,
    district,
    state
  ].filter(Boolean);

  const hospital = {
    name: ensureGovernmentFacilityTypeName(name, hospitalType),
    address: [...new Set(addressParts)].join(', '),
    latitude: coordinate(row.Latitude, 6, 38),
    longitude: coordinate(row.Longitude, 68, 98),
    departments: [],
    city: subdistrict || district,
    district,
    state,
    hospital_type: hospitalType,
    area: subdistrict,
    pincode: extractIndianPincode(row['Facility Address']),
    source_dataset: sourceDataset,
    source_record_id: sourceRecordId(row),
    source_url: sourcePage,
    source_last_updated: sourceLastUpdated,
    care_type: clean(row.NOTIONAL_PHYSICAL) || hospitalType,
    facilities: [
      clean(row['Location Type']),
      clean(row['Type Of Facility'])
    ].filter(Boolean).join(', ') || null,
    verification_status: 'unverified',
    verification_source_url: sourcePage,
    updated_at: new Date().toISOString()
  };

  if (state.toLowerCase() === 'delhi' && isDelhiAgencyLabel(subdistrict)) {
    return {
      ...hospital,
      ...normalizeDelhiDirectoryRecord(hospital)
    };
  }
  return hospital;
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function assertMigration() {
  const { error } = await supabase
    .from('hospitals')
    .select('source_dataset,source_record_id,source_url,care_type')
    .limit(1);

  if (error) {
    throw new Error(
      'Run database/migrations/08_india_hospital_directory.sql in Supabase SQL Editor before importing.'
    );
  }
}

async function loadCsv() {
  const candidates = [
    process.env.INDIA_HEALTH_CENTRES_CSV_PATH,
    cachePath
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).size > 10_000_000) {
      console.log(`Using cached health-centre directory: ${candidate}`);
      return fs.readFileSync(candidate, 'utf8');
    }
  }

  const failures = [];
  for (const url of csvUrls) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        console.log(`Downloading official health-centre directory (attempt ${attempt}/3)...`);
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'SwasthyaSarthiHealthcarePlatform/1.0',
            Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8',
            Referer: sourcePage
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(120_000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const csv = await response.text();
        if (csv.length < 10_000_000 || !csv.includes('Facility Name')) {
          throw new Error('downloaded response was not the health-centre CSV');
        }

        fs.writeFileSync(cachePath, csv, 'utf8');
        console.log(`Cached the directory at ${cachePath}`);
        return csv;
      } catch (error) {
        failures.push(`${url} attempt ${attempt}: ${error.cause?.message || error.message}`);
        if (attempt < 3) await sleep(attempt * 1500);
      }
    }
  }

  throw new Error(`All official download attempts failed. ${failures.join(' | ')}`);
}

async function upsertBatch(batch, batchNumber) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const { error } = await supabase
      .from('hospitals')
      .upsert(batch, { onConflict: 'source_dataset,source_record_id' });

    if (!error) return;
    lastError = error;
    console.warn(`Batch ${batchNumber} attempt ${attempt} failed: ${error.message}`);
    await sleep(attempt * 1000);
  }
  throw lastError;
}

async function main() {
  if (!dryRun) await assertMigration();
  console.log('Loading the Government of India All India Health Centres Directory...');
  const csv = await loadCsv();
  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true
  });

  const unique = new Map();
  for (const row of records) {
    const hospital = toHospital(row);
    if (hospital) unique.set(hospital.source_record_id, hospital);
  }
  const hospitals = [...unique.values()];
  const coordinateCount = hospitals.filter(row => row.latitude !== null).length;

  console.log(
    `Parsed ${hospitals.length} active facilities (${coordinateCount} with valid coordinates).`
  );

  if (dryRun) {
    const states = new Set(hospitals.map(row => row.state));
    const types = hospitals.reduce((counts, row) => {
      counts[row.hospital_type] = (counts[row.hospital_type] || 0) + 1;
      return counts;
    }, {});
    console.log(`Dry run complete: ${states.size} states/UT labels found. No rows changed.`);
    console.log(types);
    console.log(hospitals.slice(0, 3));
    return;
  }

  for (let start = 0; start < hospitals.length; start += batchSize) {
    const batch = hospitals.slice(start, start + batchSize);
    await upsertBatch(batch, Math.floor(start / batchSize) + 1);
    const completed = Math.min(start + batch.length, hospitals.length);
    console.log(`Imported ${completed}/${hospitals.length}`);
  }

  console.log(`Health-centre import complete: ${hospitals.length} official records.`);
}

try {
  await main();
} catch (error) {
  console.error('India health-centre import failed:', error.message || error);
  process.exitCode = 1;
}
