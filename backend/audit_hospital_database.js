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
const agencyLabels = [
  'Army Defence', 'Autonomous', 'CGHS', 'Delhi Govt', 'ESI', 'IPP VIII-MCD',
  'MCD', 'MCW Centres MCD', 'NDMC', 'NDMC MCW', 'Others', 'Railways'
];

async function count(apply) {
  let query = supabase.from('hospitals').select('id', { count: 'exact', head: true });
  if (apply) query = apply(query);
  const result = await query;
  if (result.error) throw result.error;
  return result.count;
}

async function main() {
  const [
    total,
    governmentHealthCentres,
    nationalHospitalDirectory,
    recordsWithoutSource,
    verified,
    unverified,
    excluded,
    missingAddress,
    missingPincode,
    missingLatitude,
    missingLongitude,
    agencyStoredAsCity,
    agencyStoredAsArea,
    knownNameTypos
  ] = await Promise.all([
    count(),
    count(query => query.eq('source_dataset', 'data.gov.in-all-india-health-centres')),
    count(query => query.eq('source_dataset', 'data.gov.in-national-hospital-directory')),
    count(query => query.is('source_dataset', null)),
    count(query => query.eq('verification_status', 'verified')),
    count(query => query.eq('verification_status', 'unverified')),
    count(query => query.eq('verification_status', 'excluded')),
    count(query => query.is('address', null)),
    count(query => query.is('pincode', null)),
    count(query => query.is('latitude', null)),
    count(query => query.is('longitude', null)),
    count(query => query.in('city', agencyLabels)),
    count(query => query.in('area', agencyLabels)),
    count(query => query.or('name.ilike.%dispencry%,name.ilike.%sectreteriat%,name.ilike.%secreteriat%'))
  ]);

  console.log(JSON.stringify({
    auditedAt: new Date().toISOString(),
    total,
    sourceCoverage: {
      governmentHealthCentres,
      nationalHospitalDirectory,
      recordsWithoutSource,
      otherSourceRecords: total - governmentHealthCentres - nationalHospitalDirectory - recordsWithoutSource
    },
    verification: { verified, unverified, excluded },
    completeness: { missingAddress, missingPincode, missingLatitude, missingLongitude },
    knownImportDefects: { agencyStoredAsCity, agencyStoredAsArea, knownNameTypos }
  }, null, 2));
}

try {
  await main();
} catch (error) {
  console.error('Hospital database audit failed:', error.message || error);
  process.exitCode = 1;
}

