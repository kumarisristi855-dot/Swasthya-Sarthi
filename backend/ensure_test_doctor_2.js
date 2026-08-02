import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const email = process.env.TEST_DOCTOR_2_EMAIL;
const password = process.env.TEST_DOCTOR_2_PASSWORD;
const hospitalSourceDataset = 'swasthya-sarthi-development';
const hospitalSourceRecordId = 'test-admin-clinic';

async function findAuthUserByEmail(targetEmail) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find(user => user.email?.toLowerCase() === targetEmail.toLowerCase());
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function ensureTestDoctor2() {
  if (!email || !password) {
    throw new Error('Set TEST_DOCTOR_2_EMAIL and TEST_DOCTOR_2_PASSWORD before running this development seed.');
  }

  const [{ data: hospital, error: hospitalError }, { data: specialization, error: specializationError }] = await Promise.all([
    supabase
      .from('hospitals')
      .select('id,name,admin_id')
      .eq('source_dataset', hospitalSourceDataset)
      .eq('source_record_id', hospitalSourceRecordId)
      .maybeSingle(),
    supabase
      .from('specializations')
      .select('id,name')
      .ilike('name', '%general%physician%')
      .limit(1)
      .maybeSingle()
  ]);
  if (hospitalError) throw hospitalError;
  if (specializationError) throw specializationError;
  if (!hospital) throw new Error('Test hospital is missing. Run ensure_test_admin.js first.');
  if (!specialization) throw new Error('A General Physician specialization could not be found.');

  let authUser = await findAuthUserByEmail(email);
  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Test Doctor 2', role: 'doctor' }
    });
    if (error) throw error;
    authUser = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
      user_metadata: { ...authUser.user_metadata, full_name: 'Test Doctor 2', role: 'doctor' }
    });
    if (error) throw error;
    authUser = data.user;
  }

  const { error: userError } = await supabase.from('users').upsert({
    id: authUser.id,
    email,
    role: 'doctor',
    full_name: 'Test Doctor 2',
    phone: '+91 90000 00002'
  }, { onConflict: 'id' });
  if (userError) throw userError;

  const { error: profileError } = await supabase.from('doctor_profiles').upsert({
    user_id: authUser.id,
    specialization_id: specialization.id,
    license_no: 'TEST-DOC-002',
    years_experience: 8,
    consultation_fee: 600,
    bio: 'Development-only general physician profile for testing physical appointment booking.',
    status: 'active'
  }, { onConflict: 'user_id' });
  if (profileError) throw profileError;

  const workingDays = [1, 2, 3, 4, 5, 6];
  const { error: affiliationError } = await supabase.from('doctor_hospital_affiliations').upsert({
    doctor_id: authUser.id,
    hospital_id: hospital.id,
    invited_by: hospital.admin_id,
    status: 'accepted',
    specialization_id: specialization.id,
    consultation_fee: 600,
    working_days: workingDays,
    start_time: '10:00',
    end_time: '16:00',
    updated_at: new Date().toISOString()
  }, { onConflict: 'doctor_id,hospital_id' });
  if (affiliationError) throw affiliationError;

  const { error: deleteAvailabilityError } = await supabase
    .from('doctor_availability')
    .delete()
    .eq('doctor_id', authUser.id)
    .eq('hospital_id', hospital.id);
  if (deleteAvailabilityError) throw deleteAvailabilityError;

  const { error: availabilityError } = await supabase.from('doctor_availability').insert(
    workingDays.map(dayOfWeek => ({
      doctor_id: authUser.id,
      hospital_id: hospital.id,
      day_of_week: dayOfWeek,
      start_time: '10:00',
      end_time: '16:00',
      slot_duration_minutes: 30
    }))
  );
  if (availabilityError) throw availabilityError;

  console.log(JSON.stringify({
    email,
    fullName: 'Test Doctor 2',
    hospital: hospital.name,
    specialization: specialization.name,
    physicalClinicHours: 'Monday-Saturday, 10:00 AM-4:00 PM',
    appointmentDurationMinutes: 30,
    consultationFee: 600
  }, null, 2));
}

ensureTestDoctor2()
  .catch(error => {
    console.error('Failed to prepare Test Doctor 2:', error.message || error);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode || 0), 100));
