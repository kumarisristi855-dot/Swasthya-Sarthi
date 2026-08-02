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

// Source-backed corrections for important facilities whose directory rows are incomplete.
const corrections = [
  {
    id: '9db99914-e6a5-420d-acb7-f5326e3e7b7c',
    values: {
      name: 'Kalinga Institute of Medical Sciences (KIMS), KIIT',
      address: 'KIMS, KIIT University, Campus 5, Patia, Bhubaneswar, Khordha, Odisha, 751024',
      area: 'Patia',
      city: 'Bhubaneswar',
      district: 'Khordha',
      state: 'Odisha',
      pincode: '751024',
      latitude: 20.3519291,
      longitude: 85.8133651,
      website: 'https://kims.kiit.ac.in/',
      verification_source_url: 'https://kims.kiit.ac.in/contact-us/',
      verification_status: 'verified',
      exclusion_reason: null
    }
  },
  {
    id: '6d374df1-98b2-4c27-9c3d-58e152dd59a9',
    values: {
      verification_status: 'excluded',
      exclusion_reason: 'Duplicate legacy listing for Kalinga Institute of Medical Sciences (KIMS), KIIT'
    }
  }
];

function changedValues(row, values) {
  return Object.fromEntries(
    Object.entries(values).filter(([key, value]) => (row[key] ?? null) !== (value ?? null))
  );
}

async function main() {
  const ids = corrections.map(correction => correction.id);
  const { data, error } = await supabase
    .from('hospitals')
    .select('*')
    .in('id', ids);
  if (error) throw error;

  const byId = new Map((data || []).map(row => [row.id, row]));
  const updates = corrections.flatMap(correction => {
    const row = byId.get(correction.id);
    if (!row) throw new Error(`Hospital ${correction.id} was not found.`);
    const values = changedValues(row, correction.values);
    return Object.keys(values).length
      ? [{ id: correction.id, ...values, updated_at: new Date().toISOString() }]
      : [];
  });

  console.log(JSON.stringify({
    mode: applyChanges ? 'apply' : 'dry-run',
    repairCount: updates.length,
    updates
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
  console.error('Curated facility repair failed:', error.message || error);
  process.exitCode = 1;
}
