import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

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
const stateArg = process.argv.find(arg => arg.startsWith('--state='));
const stateFilter = stateArg ? stateArg.split('=').slice(1).join('=').trim() : null;
const allStates = process.argv.includes('--all-states');
const publicLevels = new Set(['source-linked', 'hospital-confirmed', 'directory-confirmed']);
const chunkSize = 100;
const indianStateLabels = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal'
];

function duplicateKey(hospital) {
  return [
    String(hospital.name || '').trim().toLowerCase(),
    String(hospital.city || hospital.district || '').trim().toLowerCase(),
    String(hospital.state || '').trim().toLowerCase()
  ].join('|');
}

function canonicalScore(hospital) {
  let score = 0;
  if (hospital.is_public) score += 1000;
  if (publicLevels.has(hospital.verification_level)) score += 500;
  if (hospital.verification_status === 'verified') score += 200;
  if (hospital.source_url || hospital.verification_source_url || hospital.secondary_source_url) score += 80;
  if (hospital.latitude !== null && hospital.longitude !== null) score += 50;
  if (hospital.source_record_id) score += 10;
  return score;
}

async function fetchAllHospitals(activeStateFilter = stateFilter) {
  const pageSize = 1000;
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const baseQuery = supabase
      .from('hospitals')
      .select('id,name,city,district,state,is_public,verification_status,verification_level,source_url,verification_source_url,secondary_source_url,source_record_id,latitude,longitude,created_at')
      .range(start, start + pageSize - 1);
    const query = activeStateFilter ? baseQuery.eq('state', activeStateFilter) : baseQuery;
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows.filter(row => row.verification_status !== 'excluded');
}

function findDuplicateRepairs(hospitals) {
  const buckets = new Map();
  for (const hospital of hospitals) {
    if (!hospital.name || !hospital.state) continue;
    const key = duplicateKey(hospital);
    const bucket = buckets.get(key) || [];
    bucket.push(hospital);
    buckets.set(key, bucket);
  }

  const repairs = [];
  for (const [key, bucket] of buckets) {
    const uniqueSources = new Set(bucket.map(hospital => hospital.source_record_id || hospital.id));
    if (bucket.length < 2 || uniqueSources.size < 2) continue;

    const [canonical, ...duplicates] = [...bucket].sort((a, b) => {
      const scoreDelta = canonicalScore(b) - canonicalScore(a);
      if (scoreDelta !== 0) return scoreDelta;
      return String(a.created_at || a.id).localeCompare(String(b.created_at || b.id));
    });

    for (const duplicate of duplicates) {
      repairs.push({
        id: duplicate.id,
        canonicalId: canonical.id,
        key,
        name: duplicate.name,
        city: duplicate.city,
        state: duplicate.state
      });
    }
  }
  return repairs;
}

async function applyRepairs(repairs) {
  for (let index = 0; index < repairs.length; index += chunkSize) {
    const chunk = repairs.slice(index, index + chunkSize);
    const ids = chunk.map(repair => repair.id);
    const { error } = await supabase
      .from('hospitals')
      .update({
        is_public: false,
        verification_status: 'excluded',
        verification_level: 'conflict',
        verification_conflict_notes: 'Excluded by duplicate hospital audit; canonical row retained separately.',
        updated_at: new Date().toISOString()
      })
      .in('id', ids);
    if (error) throw error;
    console.log(`Marked duplicates ${Math.min(index + chunk.length, repairs.length)}/${repairs.length}`);
  }
}

async function repairState(activeStateFilter = stateFilter, printDetails = true) {
  const hospitals = await fetchAllHospitals(activeStateFilter);
  const repairs = findDuplicateRepairs(hospitals);
  const summary = {
    mode: applyChanges ? 'apply' : 'dry-run',
    stateFilter: activeStateFilter,
    scanned: hospitals.length,
    duplicateRowsToExclude: repairs.length
  };

  if (printDetails) {
    console.log(JSON.stringify({
      ...summary,
      sample: repairs.slice(0, 20)
    }, null, 2));
  }

  if (applyChanges && repairs.length > 0) {
    await applyRepairs(repairs);
  }

  return summary;
}

async function main() {
  if (allStates) {
    const summaries = [];
    for (const state of indianStateLabels) {
      const summary = await repairState(state, false);
      summaries.push({ state, ...summary });
      console.log(`${state}: scanned ${summary.scanned}, duplicate rows ${summary.duplicateRowsToExclude}`);
    }
    console.log(JSON.stringify({
      mode: applyChanges ? 'apply' : 'dry-run',
      allStates: true,
      summaries,
      totals: summaries.reduce((totals, summary) => ({
        scanned: totals.scanned + summary.scanned,
        duplicateRowsToExclude: totals.duplicateRowsToExclude + summary.duplicateRowsToExclude
      }), { scanned: 0, duplicateRowsToExclude: 0 })
    }, null, 2));
    return;
  }

  await repairState(stateFilter);
}

try {
  await main();
} catch (error) {
  console.error('Duplicate hospital repair failed:', error.message || error);
  process.exitCode = 1;
}
