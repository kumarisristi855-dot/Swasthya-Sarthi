import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const email = process.env.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD;

async function ensureAdmin() {
  if (!email || !password) {
    throw new Error('Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD before running this development seed.');
  }
  const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });
  if (listError) throw listError;

  let authUser = listed.users.find(user => user.email?.toLowerCase() === email.toLowerCase());
  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Test Hospital Admin', role: 'hospital_admin' }
    });
    if (error) throw error;
    authUser = data.user;
  } else {
    const { error } = await supabase.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true
    });
    if (error) throw error;
  }

  const { error: userError } = await supabase
    .from('users')
    .upsert({
      id: authUser.id,
      email,
      role: 'hospital_admin',
      full_name: 'Test Hospital Admin'
    }, { onConflict: 'id' });
  if (userError) throw userError;

  const sourceDataset = 'swasthya-sarthi-development';
  const sourceRecordId = 'test-admin-clinic';
  const { data: existingHospital, error: lookupError } = await supabase
    .from('hospitals')
    .select('id')
    .eq('source_dataset', sourceDataset)
    .eq('source_record_id', sourceRecordId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const hospitalPayload = {
    name: 'Swasthya Sarthi Test Clinic (Development)',
    address: 'Development-only clinic record, New Delhi',
    city: 'Delhi',
    district: 'Central Delhi',
    state: 'Delhi',
    hospital_type: 'Single-doctor Clinic',
    departments: ['General Medicine'],
    latitude: 28.6139,
    longitude: 77.209,
    admin_id: authUser.id,
    source_dataset: sourceDataset,
    source_record_id: sourceRecordId,
    verification_status: 'excluded',
    exclusion_reason: 'Development-only hospital admin workflow'
  };

  let hospital;
  if (existingHospital) {
    const { data, error } = await supabase
      .from('hospitals')
      .update(hospitalPayload)
      .eq('id', existingHospital.id)
      .select('id, name')
      .single();
    if (error) throw error;
    hospital = data;
  } else {
    const { data, error } = await supabase
      .from('hospitals')
      .insert(hospitalPayload)
      .select('id, name')
      .single();
    if (error) throw error;
    hospital = data;
  }

  console.log(`Hospital admin ready: ${email}`);
  console.log(`Admin hospital: ${hospital.name} (${hospital.id})`);

  const testDoctorEmail = process.env.TEST_DOCTOR_EMAIL;
  if (!testDoctorEmail) {
    console.log('TEST_DOCTOR_EMAIL is not set; booking fixture was skipped.');
    return;
  }
  const { data: testDoctor, error: doctorLookupError } = await supabase
    .from('users')
    .select('id, full_name')
    .eq('email', testDoctorEmail)
    .eq('role', 'doctor')
    .maybeSingle();
  if (doctorLookupError) throw doctorLookupError;

  if (testDoctor) {
    const { error: profileError } = await supabase
      .from('doctor_profiles')
      .update({ status: 'active', consultation_fee: 500 })
      .eq('user_id', testDoctor.id);
    if (profileError) throw profileError;

    const { error: affiliationError } = await supabase
      .from('doctor_hospital_affiliations')
      .upsert({
        doctor_id: testDoctor.id,
        hospital_id: hospital.id,
        invited_by: authUser.id,
        status: 'accepted'
      }, { onConflict: 'doctor_id,hospital_id' });
    if (affiliationError) throw affiliationError;

    const { data: existingAvailability, error: availabilityLookupError } = await supabase
      .from('doctor_availability')
      .select('id')
      .eq('doctor_id', testDoctor.id)
      .eq('hospital_id', hospital.id)
      .limit(1);
    if (availabilityLookupError) throw availabilityLookupError;

    if (!existingAvailability?.length) {
      const schedules = Array.from({ length: 7 }, (_, dayOfWeek) => ({
        doctor_id: testDoctor.id,
        hospital_id: hospital.id,
        day_of_week: dayOfWeek,
        start_time: '09:00',
        end_time: '17:00',
        slot_duration_minutes: 30
      }));
      const { error: availabilityError } = await supabase
        .from('doctor_availability')
        .insert(schedules);
      if (availabilityError) throw availabilityError;
    }

    console.log(`Bookable test doctor ready: ${testDoctor.full_name} (${testDoctorEmail})`);
  } else {
    console.log(`Test doctor ${testDoctorEmail} was not found; booking fixture was skipped.`);
  }
}

ensureAdmin()
  .catch(error => {
    console.error('Failed to prepare test hospital admin:', error.message || error);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode || 0), 100));
