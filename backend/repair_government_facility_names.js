import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { ensureGovernmentFacilityTypeName } from './src/services/geolocation/hospitalDirectoryNormalization.js';

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
const applyChanges = process.argv.includes('--apply');
const pageSize = 1000;
const updateBatchSize = 500;

async function applyBatch(batch) {
  const { error } = await supabase
    .from('hospitals')
    .upsert(batch, { onConflict: 'id' });
  if (error) throw error;
}

async function main() {
  let scanned = 0;
  let changed = 0;
  let skippedVerified = 0;
  const byType = {};
  const samples = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('hospitals')
      .select('id,name,address,hospital_type,verification_status')
      .eq('source_dataset', sourceDataset)
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;

    scanned += data.length;
    const updates = [];
    for (const hospital of data) {
      if (hospital.verification_status === 'verified') {
        skippedVerified += 1;
        continue;
      }
      const normalizedName = ensureGovernmentFacilityTypeName(
        hospital.name,
        hospital.hospital_type
      );
      if (normalizedName === hospital.name) continue;

      changed += 1;
      byType[hospital.hospital_type] = (byType[hospital.hospital_type] || 0) + 1;
      if (samples.length < 20) {
        samples.push({ before: hospital.name, after: normalizedName, type: hospital.hospital_type });
      }
      updates.push({
        id: hospital.id,
        name: normalizedName,
        address: hospital.address,
        updated_at: new Date().toISOString()
      });
    }

    if (applyChanges) {
      for (let start = 0; start < updates.length; start += updateBatchSize) {
        await applyBatch(updates.slice(start, start + updateBatchSize));
      }
    }
    if (scanned % 10000 === 0 || data.length < pageSize) {
      console.log(`Scanned ${scanned}; ${applyChanges ? 'applied' : 'found'} ${changed} name repairs.`);
    }
    if (data.length < pageSize) break;
  }

  console.log(JSON.stringify({
    mode: applyChanges ? 'apply' : 'dry-run',
    scanned,
    changed,
    skippedVerified,
    byType,
    samples
  }, null, 2));
}

try {
  await main();
} catch (error) {
  console.error('Government facility-name repair failed:', error.message || error);
  process.exitCode = 1;
}

