import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import os from 'os';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const sourceDataset = 'data.gov.in-national-hospital-directory';
const sourcePage = 'https://www.data.gov.in/resource/national-hospital-directory-geo-code-and-additional-parameters-updated-till-last-month';
const csvUrls = [
  'https://data.gov.in/sites/default/files/datafile/hospital_directory.csv',
  'https://www.data.gov.in/files/ogdpv2dms/s3fs-public/datafile/hospital_directory.csv'
];
const sourceLastUpdated = '2025-06-02';
const batchSize = 250;
const dryRun = process.argv.includes('--dry-run');
const cachePath = path.join(os.tmpdir(), 'careSync_hospital_directory.csv');

function clean(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '0' || /^n\/?a$/i.test(text) || /^not available$/i.test(text)) return null;
  return text;
}

function integer(value) {
  const number = Number.parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(number) && number >= 0 && number <= 1_000_000 ? number : null;
}

function parseCoordinates(value) {
  const match = String(value ?? '').match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return { latitude: null, longitude: null };

  const latitude = Number.parseFloat(match[1]);
  const longitude = Number.parseFloat(match[2]);
  const withinIndia = latitude >= 6 && latitude <= 38 && longitude >= 68 && longitude <= 98;
  return withinIndia
    ? { latitude, longitude }
    : { latitude: null, longitude: null };
}

function splitSpecialties(value) {
  const text = clean(value);
  if (!text) return [];
  return [...new Set(
    text
      .split(/\s*(?:,|;|\||\/)\s*/)
      .map(item => item.trim())
      .filter(item => item && item.length <= 80)
  )].slice(0, 30);
}

function toHospital(row) {
  const name = clean(row.Hospital_Name);
  const sourceRecordId = clean(row.Sr_No);
  if (!name || !sourceRecordId) return null;

  const coordinates = parseCoordinates(row.Location_Coordinates);
  const city = clean(row.Town) || clean(row.Subtown) || clean(row.Location);
  const addressParts = [
    clean(row.Address_Original_First_Line),
    clean(row.Village),
    clean(row.Subdistrict),
    clean(row.District),
    clean(row.State),
    clean(row.Pincode)
  ].filter(Boolean);

  return {
    name,
    address: [...new Set(addressParts)].join(', ') || null,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    departments: splitSpecialties(row.Specialties),
    city,
    district: clean(row.District),
    state: clean(row.State),
    pincode: clean(row.Pincode),
    phone: clean(row.Telephone) || clean(row.Emergency_Num) || clean(row.Helpline),
    email: clean(row.Hospital_Primary_Email_Id),
    hospital_type: clean(row.Hospital_Category) || 'Hospital',
    area: clean(row.Location) || clean(row.Subdistrict),
    source_dataset: sourceDataset,
    source_record_id: sourceRecordId,
    source_url: sourcePage,
    source_last_updated: sourceLastUpdated,
    care_type: clean(row.Hospital_Care_Type),
    system_of_medicine: clean(row.Discipline_Systems_of_Medicine),
    facilities: clean(row.Facilities) || clean(row.Miscellaneous_Facilities),
    website: clean(row.Website),
    mobile: clean(row.Mobile_Number),
    doctor_count: integer(row.Number_Doctor),
    bed_count: integer(row.Total_Num_Beds),
    verification_status: 'unverified',
    verification_source_url: sourcePage,
    updated_at: new Date().toISOString()
  };
}

async function assertMigration() {
  const { error } = await supabase
    .from('hospitals')
    .select('source_dataset,source_record_id,source_url,care_type,doctor_count,bed_count')
    .limit(1);

  if (error) {
    throw new Error(
      'Run database/migrations/08_india_hospital_directory.sql in Supabase SQL Editor before importing.'
    );
  }
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function loadCsv() {
  const localCandidates = [
    process.env.INDIA_HOSPITAL_CSV_PATH,
    cachePath
  ].filter(Boolean);

  for (const candidate of localCandidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).size > 1_000_000) {
      console.log(`Using cached hospital directory: ${candidate}`);
      return fs.readFileSync(candidate, 'utf8');
    }
  }

  const failures = [];
  for (const url of csvUrls) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        console.log(`Downloading official directory (attempt ${attempt}/3)...`);
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'SwasthyaSarthiHealthcarePlatform/1.0',
            Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8',
            Referer: sourcePage
          },
          signal: AbortSignal.timeout(60_000)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const csv = await response.text();
        if (csv.length < 1_000_000 || !csv.includes('Hospital_Name')) {
          throw new Error('downloaded response was not the hospital CSV');
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

async function main() {
  if (!dryRun) await assertMigration();
  console.log('Loading the Government of India National Hospital Directory...');
  const csv = await loadCsv();
  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true
  });
  const hospitals = records.map(toHospital).filter(Boolean);
  const coordinateCount = hospitals.filter(row => row.latitude !== null).length;

  console.log(`Parsed ${hospitals.length} facilities (${coordinateCount} with valid coordinates).`);

  if (dryRun) {
    const states = new Set(hospitals.map(row => row.state).filter(Boolean));
    console.log(`Dry run complete: ${states.size} states/UT labels found. No database rows were changed.`);
    console.log(hospitals.slice(0, 3));
    return;
  }

  for (let start = 0; start < hospitals.length; start += batchSize) {
    const batch = hospitals.slice(start, start + batchSize);
    const { error } = await supabase
      .from('hospitals')
      .upsert(batch, { onConflict: 'source_dataset,source_record_id' });

    if (error) throw error;
    const completed = Math.min(start + batch.length, hospitals.length);
    console.log(`Imported ${completed}/${hospitals.length}`);
  }

  console.log(`India hospital import complete: ${hospitals.length} official directory records.`);
}

try {
  await main();
} catch (error) {
  console.error('India hospital import failed:', error.message || error);
  process.exitCode = 1;
}
