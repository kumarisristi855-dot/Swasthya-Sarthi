import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { normalizeDelhiDirectoryRecord } from './src/services/geolocation/hospitalDirectoryNormalization.js';

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
const sourceDataset = 'data.gov.in-all-india-health-centres';

function changedFields(before, after) {
  return Object.keys(after).filter(key => (before[key] ?? null) !== (after[key] ?? null));
}

async function main() {
  const { data, error } = await supabase
    .from('hospitals')
    .select('id,name,address,city,district,state,pincode,area,hospital_type,facilities,verification_status,source_record_id')
    .eq('source_dataset', sourceDataset)
    .eq('state', 'Delhi')
    .limit(1000);
  if (error) throw error;

  const repairs = [];
  const skippedVerified = [];
  for (const hospital of data || []) {
    if (hospital.verification_status === 'verified') {
      skippedVerified.push(hospital);
      continue;
    }
    const normalized = normalizeDelhiDirectoryRecord(hospital);
    const fields = changedFields(hospital, normalized);
    if (fields.length) {
      repairs.push({ ...normalized, id: hospital.id, updated_at: new Date().toISOString(), fields });
    }
  }

  const fieldCounts = repairs.reduce((counts, repair) => {
    for (const field of repair.fields) counts[field] = (counts[field] || 0) + 1;
    return counts;
  }, {});
  console.log(JSON.stringify({
    mode: applyChanges ? 'apply' : 'dry-run',
    scanned: data?.length || 0,
    repairCount: repairs.length,
    skippedVerified: skippedVerified.length,
    fieldCounts,
    samples: repairs.slice(0, 12).map(({ fields, ...repair }) => ({ fields, ...repair }))
  }, null, 2));

  if (!applyChanges || repairs.length === 0) return;

  const batchSize = 100;
  for (let start = 0; start < repairs.length; start += batchSize) {
    const batch = repairs.slice(start, start + batchSize).map(({ fields, ...repair }) => repair);
    const { error: updateError } = await supabase
      .from('hospitals')
      .upsert(batch, { onConflict: 'id' });
    if (updateError) throw updateError;
    console.log(`Applied ${Math.min(start + batch.length, repairs.length)}/${repairs.length} repairs.`);
  }
}

try {
  await main();
} catch (error) {
  console.error('Hospital directory repair failed:', error.message || error);
  process.exitCode = 1;
}

