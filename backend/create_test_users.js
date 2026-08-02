import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, key);

async function run() {
  console.log('Querying existing users in public tables...');

  const patientEmail = process.env.TEST_PATIENT_EMAIL;
  const doctorEmail = process.env.TEST_DOCTOR_EMAIL;

  if (!patientEmail || !doctorEmail) {
    throw new Error('Set TEST_PATIENT_EMAIL and TEST_DOCTOR_EMAIL before running this helper.');
  }

  // 1. Patient
  const { data: patientUser, error: pUserErr } = await supabase.from('users').select('*').eq('email', patientEmail);
  console.log('Patient users row:', patientUser, 'error:', pUserErr?.message);

  const { data: patientProfile, error: pProfErr } = await supabase.from('patient_profiles').select('*');
  console.log('All patient profiles:', patientProfile, 'error:', pProfErr?.message);

  // 2. Doctor
  const { data: doctorUser, error: dUserErr } = await supabase.from('users').select('*').eq('email', doctorEmail);
  console.log('Doctor users row:', doctorUser, 'error:', dUserErr?.message);

  const { data: doctorProfile, error: dProfErr } = await supabase.from('doctor_profiles').select('*');
  console.log('All doctor profiles:', doctorProfile, 'error:', dProfErr?.message);
}

run();
