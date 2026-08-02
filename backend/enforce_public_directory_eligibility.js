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
const stateArg = process.argv.find(arg => arg.startsWith('--state='));
const stateFilter = stateArg ? stateArg.split('=').slice(1).join('=').trim() : null;
const allStates = process.argv.includes('--all-states');
const publicLevels = new Set(['source-linked', 'hospital-confirmed', 'directory-confirmed']);
const updateChunkSize = 100;
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

function hasCoordinates(hospital) {
  return hospital.latitude !== null &&
    hospital.longitude !== null &&
    hospital.latitude !== '' &&
    hospital.longitude !== '' &&
    Number.isFinite(Number(hospital.latitude)) &&
    Number.isFinite(Number(hospital.longitude));
}

function hasSource(hospital) {
  return Boolean(
    hospital.source_url ||
    hospital.verification_source_url ||
    hospital.secondary_source_url
  );
}

function shouldBePublic(hospital) {
  if (isDevelopmentFixtureHospital(hospital)) return false;
  if (hospital.verification_status === 'excluded') return false;
  if (hospital.verification_level === 'conflict' || hospital.verification_level === 'unverified') return false;
  return publicLevels.has(hospital.verification_level) && hasCoordinates(hospital) && hasSource(hospital);
}

async function fetchAllHospitals(activeStateFilter = stateFilter) {
  const pageSize = 1000;
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const baseQuery = supabase
      .from('hospitals')
      .select('id,name,state,city,latitude,longitude,is_public,verification_level,verification_status,source_url,verification_source_url,secondary_source_url,updated_at,source_dataset')
      .range(start, start + pageSize - 1);
    const query = activeStateFilter ? baseQuery.eq('state', activeStateFilter) : baseQuery;
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function enforceForState(activeStateFilter = stateFilter, options = {}) {
  const { printDetails = true, printProgress = true } = options;
  const hospitals = await fetchAllHospitals(activeStateFilter);
  const updates = hospitals
    .map(hospital => {
      const nextPublic = shouldBePublic(hospital);
      return hospital.is_public === nextPublic
        ? null
        : { id: hospital.id, is_public: nextPublic, updated_at: new Date().toISOString() };
    })
    .filter(Boolean);

  const toPublic = updates.filter(update => update.is_public).length;
  const toInternal = updates.length - toPublic;
  const summary = {
    mode: applyChanges ? 'apply' : 'dry-run',
    stateFilter: activeStateFilter,
    scanned: hospitals.length,
    updateCount: updates.length,
    toPublic,
    toInternal
  };

  if (printDetails) {
    console.log(JSON.stringify({
      ...summary,
      sample: updates.slice(0, 20)
    }, null, 2));
  }

  if (!applyChanges || updates.length === 0) return summary;

  let appliedCount = 0;
  for (const nextPublic of [false, true]) {
    const groupedUpdates = updates.filter(update => update.is_public === nextPublic);
    for (let index = 0; index < groupedUpdates.length; index += updateChunkSize) {
      const chunk = groupedUpdates.slice(index, index + updateChunkSize);
      const ids = chunk.map(update => update.id);
      const updatedAt = new Date().toISOString();
      const { error } = await supabase
        .from('hospitals')
        .update({ is_public: nextPublic, updated_at: updatedAt })
        .in('id', ids);
      if (error) throw error;
      appliedCount += chunk.length;
      if (printProgress) {
        console.log(`Applied ${appliedCount}/${updates.length}`);
      }
    }
  }

  return summary;
}

async function main() {
  if (allStates) {
    const summaries = [];
    for (const state of indianStateLabels) {
      const summary = await enforceForState(state, { printDetails: false, printProgress: false });
      summaries.push({ state, ...summary });
      console.log(`${state}: scanned ${summary.scanned}, updates ${summary.updateCount} (${summary.toInternal} hidden, ${summary.toPublic} public)`);
    }
    console.log(JSON.stringify({
      mode: applyChanges ? 'apply' : 'dry-run',
      allStates: true,
      summaries,
      totals: summaries.reduce((totals, summary) => ({
        scanned: totals.scanned + summary.scanned,
        updateCount: totals.updateCount + summary.updateCount,
        toPublic: totals.toPublic + summary.toPublic,
        toInternal: totals.toInternal + summary.toInternal
      }), { scanned: 0, updateCount: 0, toPublic: 0, toInternal: 0 })
    }, null, 2));
    return;
  }

  await enforceForState(stateFilter);
}

try {
  await main();
} catch (error) {
  console.error('Public directory eligibility enforcement failed:', error.message || error);
  process.exitCode = 1;
}
