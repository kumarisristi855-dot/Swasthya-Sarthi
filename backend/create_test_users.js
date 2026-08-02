import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, key);

async function run() {
  console.log('Querying existing users in public tables...');

  // 1. Patient: patient@test.com
  const { data: patientUser, error: pUserErr } = await supabase.from('users').select('*').eq('email', 'patient@test.com');
  console.log('Patient users row:', patientUser, 'error:', pUserErr?.message);

  const { data: patientProfile, error: pProfErr } = await supabase.from('patient_profiles').select('*');
  console.log('All patient profiles:', patientProfile, 'error:', pProfErr?.message);

  // 2. Doctor: doctor@test.com
  const { data: doctorUser, error: dUserErr } = await supabase.from('users').select('*').eq('email', 'doctor@test.com');
  console.log('Doctor users row:', doctorUser, 'error:', dUserErr?.message);

  const { data: doctorProfile, error: dProfErr } = await supabase.from('doctor_profiles').select('*');
  console.log('All doctor profiles:', doctorProfile, 'error:', dProfErr?.message);
}

run();
