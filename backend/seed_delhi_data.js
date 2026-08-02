import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to seed Delhi data.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const password = process.env.DELHI_SEED_PASSWORD || 'TestPass123!';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getAreaFromAddress(address = '') {
  return address.split(',')[0]?.trim() || 'Delhi';
}

function findDatasetPath() {
  const candidates = [
    process.env.DELHI_HOSPITALS_DATASET_PATH,
    path.resolve(__dirname, '..', 'database', 'seed', 'delhi_hospitals_dataset.json'),
    path.resolve(__dirname, '..', '..', 'files', 'delhi_hospitals_dataset.json'),
    'C:\\Users\\pooki\\Desktop\\files\\delhi_hospitals_dataset.json'
  ].filter(Boolean);

  const datasetPath = candidates.find(candidate => fs.existsSync(candidate));
  if (!datasetPath) {
    throw new Error('Could not find delhi_hospitals_dataset.json. Set DELHI_HOSPITALS_DATASET_PATH and rerun the seed script.');
  }
  return datasetPath;
}

function loadDelhiHospitalsDataset() {
  const datasetPath = findDatasetPath();
  const raw = fs.readFileSync(datasetPath, 'utf8');
  const parsed = JSON.parse(raw);
  const datasetHospitals = Array.isArray(parsed) ? parsed : parsed.hospitals;

  if (!Array.isArray(datasetHospitals) || datasetHospitals.length === 0) {
    throw new Error('delhi_hospitals_dataset.json did not contain a hospitals array.');
  }

  console.log(`Using hospital dataset: ${datasetPath}`);

  return datasetHospitals
    .filter(hospital => hospital.isActive !== false)
    .map(hospital => ({
      name: hospital.name,
      address: hospital.address,
      latitude: hospital.latitude,
      longitude: hospital.longitude,
      departments: hospital.specializations || [],
      timings: { mon: '09:00-17:00', tue: '09:00-17:00', wed: '09:00-17:00', thu: '09:00-17:00', fri: '09:00-17:00', sat: '09:00-14:00' },
      city: 'Delhi',
      district: hospital.district,
      state: hospital.state || 'Delhi',
      pincode: hospital.pincode,
      phone: hospital.phone,
      email: hospital.email,
      hospital_type: hospital.type || 'Hospital',
      area: getAreaFromAddress(hospital.address),
      beds: hospital.beds || null,
      is_active: hospital.isActive !== false
    }));
}

async function assertDelhiMigrationApplied() {
  const { error } = await supabase
    .from('hospitals')
    .select('city,district,state,pincode,phone,email,hospital_type,area')
    .limit(1);

  if (error?.code === 'PGRST204') {
    throw new Error(
      'Delhi metadata migration is not fully applied yet. Run database/migrations/06_delhi_doctor_hospital_metadata.sql in Supabase SQL Editor, then rerun this seed script.'
    );
  }

  if (error) {
    throw error;
  }
}

async function getOptionalHospitalColumns() {
  const { error } = await supabase
    .from('hospitals')
    .select('beds,is_active')
    .limit(1);

  return {
    hasBedsAndActiveColumns: !error
  };
}

async function hasIndiaSourceColumns() {
  const { error } = await supabase
    .from('hospitals')
    .select('source_dataset,source_record_id')
    .limit(1);

  return !error;
}

const hospitals = [
  {
    name: 'Indraprastha Apollo Hospital',
    address: 'Delhi Mathura Road, Sarita Vihar, New Delhi',
    district: 'South Delhi',
    state: 'India',
    pincode: '110076',
    phone: '+911126922222',
    email: 'delhi.apollo@example.com',
    latitude: 28.5383,
    longitude: 77.2830,
    hospital_type: 'Hospital',
    area: 'Sarita Vihar',
    departments: ['Cardiology', 'Neurology', 'Orthopedic', 'Dermatology', 'Pediatrics'],
    timings: { mon: '09:00-18:00', tue: '09:00-18:00', wed: '09:00-18:00', thu: '09:00-18:00', fri: '09:00-18:00', sat: '09:00-14:00' }
  },
  {
    name: 'Max Super Speciality Hospital Saket',
    address: '1, 2, Press Enclave Road, Saket, New Delhi',
    district: 'South Delhi',
    state: 'India',
    pincode: '110017',
    phone: '+911126515050',
    email: 'saket.max@example.com',
    latitude: 28.5276,
    longitude: 77.2146,
    hospital_type: 'Hospital',
    area: 'Saket',
    departments: ['Cardiology', 'Gastroenterology', 'ENT', 'Ophthalmology'],
    timings: { mon: '08:30-18:00', tue: '08:30-18:00', wed: '08:30-18:00', thu: '08:30-18:00', fri: '08:30-18:00', sat: '09:00-15:00' }
  },
  {
    name: 'Sir Ganga Ram Hospital',
    address: 'Rajinder Nagar, New Delhi',
    district: 'Central Delhi',
    state: 'India',
    pincode: '110060',
    phone: '+911142257000',
    email: 'gangaram@example.com',
    latitude: 28.6409,
    longitude: 77.1894,
    hospital_type: 'Hospital',
    area: 'Rajinder Nagar',
    departments: ['General Medicine', 'Pulmonology', 'Endocrinology', 'Urology'],
    timings: { mon: '09:00-17:00', tue: '09:00-17:00', wed: '09:00-17:00', thu: '09:00-17:00', fri: '09:00-17:00', sat: '09:00-13:00' }
  },
  {
    name: 'BLK-Max Super Speciality Hospital',
    address: 'Pusa Road, Rajinder Nagar, New Delhi',
    district: 'Central Delhi',
    state: 'India',
    pincode: '110005',
    phone: '+911130405405',
    email: 'blkmax@example.com',
    latitude: 28.6448,
    longitude: 77.1819,
    hospital_type: 'Hospital',
    area: 'Pusa Road',
    departments: ['Orthopedic', 'Neurology', 'Dental', 'Psychiatry'],
    timings: { mon: '09:00-18:00', tue: '09:00-18:00', wed: '09:00-18:00', thu: '09:00-18:00', fri: '09:00-18:00', sat: '09:00-14:00' }
  },
  {
    name: 'Fortis Escorts Heart Institute',
    address: 'Okhla Road, New Friends Colony, New Delhi',
    district: 'South Delhi',
    state: 'India',
    pincode: '110025',
    phone: '+911147135000',
    email: 'fortis.escorts@example.com',
    latitude: 28.5614,
    longitude: 77.2744,
    hospital_type: 'Hospital',
    area: 'Okhla',
    departments: ['Cardiology', 'Pulmonology', 'General Medicine'],
    timings: { mon: '09:00-18:00', tue: '09:00-18:00', wed: '09:00-18:00', thu: '09:00-18:00', fri: '09:00-18:00', sat: '09:00-14:00' }
  },
  {
    name: 'Aakash Healthcare Super Speciality Hospital',
    address: 'Hospital Plot, Road No. 201, Dwarka Sector 3, New Delhi',
    district: 'West Delhi',
    state: 'India',
    pincode: '110075',
    phone: '+911146760000',
    email: 'aakash.dwarka@example.com',
    latitude: 28.6084,
    longitude: 77.0447,
    hospital_type: 'Hospital',
    area: 'Dwarka',
    departments: ['Pediatrics', 'Gynecology', 'Orthopedic', 'ENT'],
    timings: { mon: '09:00-18:00', tue: '09:00-18:00', wed: '09:00-18:00', thu: '09:00-18:00', fri: '09:00-18:00', sat: '09:00-15:00' }
  },
  {
    name: 'Lajpat Nagar Family Clinic',
    address: 'E-24, Lajpat Nagar II, New Delhi',
    district: 'South Delhi',
    state: 'India',
    pincode: '110024',
    phone: '+911141000111',
    email: 'lajpat.familyclinic@example.com',
    latitude: 28.5689,
    longitude: 77.2430,
    hospital_type: 'Clinic',
    area: 'Lajpat Nagar',
    departments: ['General Medicine', 'Dermatology', 'Dental'],
    timings: { mon: '10:00-20:00', tue: '10:00-20:00', wed: '10:00-20:00', thu: '10:00-20:00', fri: '10:00-20:00', sat: '10:00-16:00' }
  },
  {
    name: 'Connaught Place Diagnostic & Care',
    address: 'Barakhamba Road, Connaught Place, New Delhi',
    district: 'New Delhi',
    state: 'India',
    pincode: '110001',
    phone: '+911143000222',
    email: 'cp.care@example.com',
    latitude: 28.6315,
    longitude: 77.2222,
    hospital_type: 'Diagnostic Center',
    area: 'Connaught Place',
    departments: ['General Medicine', 'Endocrinology', 'Ophthalmology'],
    timings: { mon: '08:00-19:00', tue: '08:00-19:00', wed: '08:00-19:00', thu: '08:00-19:00', fri: '08:00-19:00', sat: '08:00-14:00' }
  }
];

const doctors = [
  { fullName: 'Dr. Aarav Mehta', email: 'delhi.cardio.aarav@test.com', phone: '+919810000101', specialization: 'Cardiologist', licenseNo: 'DMC-DEL-1001', credentials: 'DM Cardiology', yearsExperience: 14, fee: 1400, hospitals: ['Acharya Shree Bhikshu Hospital', 'Deen Dayal Upadhyay Hospital', 'Delhi Heart & Lung Institute'] },
  { fullName: 'Dr. Kavya Sharma', email: 'delhi.cardio.kavya@test.com', phone: '+919810000102', specialization: 'Cardiologist', licenseNo: 'DMC-DEL-1002', credentials: 'DM Cardiology', yearsExperience: 12, fee: 1350, hospitals: ['Lok Nayak Hospital', 'Rajiv Gandhi Super Speciality Hospital', 'Bharat Hospital & Institute of Cardiology'] },
  { fullName: 'Dr. Ishaan Kapoor', email: 'delhi.cardio.ishaan@test.com', phone: '+919810000103', specialization: 'Cardiologist', licenseNo: 'DMC-DEL-1003', credentials: 'DM Cardiology', yearsExperience: 16, fee: 1600, hospitals: ['Apollo Hospital Delhi', 'Sir Ganga Ram Hospital', 'Holy Family Hospital'] },
  { fullName: 'Dr. Zoya Khan', email: 'delhi.cardio.zoya@test.com', phone: '+919810000104', specialization: 'Cardiologist', licenseNo: 'DMC-DEL-1004', credentials: 'DM Cardiology', yearsExperience: 11, fee: 1300, hospitals: ['Max Super Specialty Hospital - Saket', 'Fortis Healthcare - Vasant Kunj', 'Manipal Hospital - Delhi'] },
  { fullName: 'Dr. Meera Iyer', email: 'delhi.ortho.meera@test.com', phone: '+919810000105', specialization: 'Orthopedic', licenseNo: 'DMC-DEL-1005', credentials: 'MS Orthopedics', yearsExperience: 16, fee: 1200, hospitals: ['Bhagwan Mahavir Hospital', 'Batra Hospital & Medical Research Centre', 'Sanjay Gandhi Memorial Hospital'] },
  { fullName: 'Dr. Rohan Bansal', email: 'delhi.ortho.rohan@test.com', phone: '+919810000106', specialization: 'Orthopedic', licenseNo: 'DMC-DEL-1006', credentials: 'MS Orthopedics', yearsExperience: 10, fee: 1100, hospitals: ['Apollo Hospital Delhi', 'Max Super Specialty Hospital - Saket', 'Janakpuri Super Speciality Hospital'] },
  { fullName: 'Dr. Nandini Rao', email: 'delhi.ortho.nandini@test.com', phone: '+919810000107', specialization: 'Orthopedic', licenseNo: 'DMC-DEL-1007', credentials: 'DNB Orthopedics', yearsExperience: 13, fee: 1250, hospitals: ['Fortis Healthcare - Vasant Kunj', 'Sir Ganga Ram Hospital', 'Indraprastha Apollo Hospital'] },
  { fullName: 'Dr. Sameer Anand', email: 'delhi.gp.sameer@test.com', phone: '+919810000108', specialization: 'General Physician', licenseNo: 'DMC-DEL-1008', credentials: 'MD Medicine', yearsExperience: 10, fee: 650, hospitals: ['Aruna Asaf Ali Govt. Hospital', 'Babu Jagjivan Ram Hospital', 'Dr. Bhubaneswar Borooah Institute of Acute Care'] },
  { fullName: 'Dr. Neha Verma', email: 'delhi.gp.neha@test.com', phone: '+919810000109', specialization: 'General Physician', licenseNo: 'DMC-DEL-1009', credentials: 'MD General Medicine', yearsExperience: 9, fee: 600, hospitals: ['Baba Saheb Ambedkar Hospital', 'Govind Ballabh Pant Hospital', 'Sardar Vallabh Bhai Patel Hospital'] },
  { fullName: 'Dr. Aditya Suri', email: 'delhi.gp.aditya@test.com', phone: '+919810000110', specialization: 'General Physician', licenseNo: 'DMC-DEL-1010', credentials: 'MD General Medicine', yearsExperience: 12, fee: 700, hospitals: ['Deen Dayal Upadhyay Hospital', 'Holy Family Hospital', 'Sanjay Gandhi Memorial Hospital'] },
  { fullName: 'Dr. Kabir Sethi', email: 'delhi.peds.kabir@test.com', phone: '+919810000111', specialization: 'Pediatrician', licenseNo: 'DMC-DEL-1011', credentials: 'MD Pediatrics', yearsExperience: 11, fee: 850, hospitals: ['Baba Saheb Ambedkar Hospital', 'Guru Teg Bahadur Hospital', 'Chacha Nehru Bal Chikitsalaya'] },
  { fullName: 'Dr. Tanya Arora', email: 'delhi.peds.tanya@test.com', phone: '+919810000112', specialization: 'Pediatrician', licenseNo: 'DMC-DEL-1012', credentials: 'MD Pediatrics', yearsExperience: 8, fee: 750, hospitals: ['Babu Jagjivan Ram Hospital', 'Holy Family Hospital', 'Sardar Vallabh Bhai Patel Hospital'] },
  { fullName: 'Dr. Dev Malhotra', email: 'delhi.neuro.dev@test.com', phone: '+919810000113', specialization: 'Neurologist', licenseNo: 'DMC-DEL-1013', credentials: 'DM Neurology', yearsExperience: 18, fee: 1750, hospitals: ['Rajiv Gandhi Super Speciality Hospital', 'Apollo Hospital Delhi', 'Fortis Healthcare - Noida'] },
  { fullName: 'Dr. Aisha Mirza', email: 'delhi.neuro.aisha@test.com', phone: '+919810000114', specialization: 'Neurologist', licenseNo: 'DMC-DEL-1014', credentials: 'DM Neurology', yearsExperience: 14, fee: 1650, hospitals: ['Max Super Specialty Hospital - Saket', 'Fortis Healthcare - Vasant Kunj', 'Indraprastha Apollo Hospital'] },
  { fullName: 'Dr. Arjun Grover', email: 'delhi.gastro.arjun@test.com', phone: '+919810000115', specialization: 'Gastroenterologist', licenseNo: 'DMC-DEL-1015', credentials: 'DM Gastroenterology', yearsExperience: 17, fee: 1500, hospitals: ['Rajiv Gandhi Super Speciality Hospital', 'Institute of Liver & Biliary Sciences', 'Batra Hospital & Medical Research Centre'] },
  { fullName: 'Dr. Leela Narang', email: 'delhi.gastro.leela@test.com', phone: '+919810000116', specialization: 'Gastroenterologist', licenseNo: 'DMC-DEL-1016', credentials: 'DM Gastroenterology', yearsExperience: 12, fee: 1400, hospitals: ['Apollo Hospital Delhi', 'Sir Ganga Ram Hospital', 'Manipal Hospital - Delhi'] },
  { fullName: 'Dr. Ananya Rao', email: 'delhi.psych.ananya@test.com', phone: '+919810000117', specialization: 'Psychiatrist', licenseNo: 'DMC-DEL-1017', credentials: 'MD Psychiatry', yearsExperience: 10, fee: 1300, hospitals: ['Institute of Human Behaviour and Allied Sciences'] },
  { fullName: 'Dr. Priya Menon', email: 'delhi.eye.priya@test.com', phone: '+919810000118', specialization: 'Ophthalmologist', licenseNo: 'DMC-DEL-1018', credentials: 'MS Ophthalmology', yearsExperience: 15, fee: 950, hospitals: ['Attar Sain Jain Hospital'] },
  { fullName: 'Dr. Manav Jain', email: 'delhi.uro.manav@test.com', phone: '+919810000119', specialization: 'Urologist', licenseNo: 'DMC-DEL-1019', credentials: 'MCh Urology', yearsExperience: 14, fee: 1450, hospitals: ['Bhagwan Mahavir Hospital', 'Govind Ballabh Pant Hospital', 'Fortis Healthcare - Vasant Kunj'] },
  { fullName: 'Dr. Farah Qureshi', email: 'delhi.onco.farah@test.com', phone: '+919810000120', specialization: 'Oncologist', licenseNo: 'DMC-DEL-1020', credentials: 'DM Medical Oncology', yearsExperience: 13, fee: 1800, hospitals: ['Lok Nayak Hospital', 'Delhi State Cancer Institute', 'Fortis Healthcare - Noida'] }
];

const scheduleByIndex = [
  { working_days: [1, 3, 5], start_time: '09:00:00', end_time: '13:00:00' },
  { working_days: [2, 4, 6], start_time: '15:00:00', end_time: '19:00:00' }
];

async function getOrCreateSpecialization(name) {
  const { data, error } = await supabase
    .from('specializations')
    .select('id')
    .eq('name', name)
    .single();

  if (data) return data.id;
  if (error && error.code !== 'PGRST116') throw error;

  const { data: inserted, error: insertError } = await supabase
    .from('specializations')
    .insert({ name })
    .select('id')
    .single();

  if (insertError) throw insertError;
  return inserted.id;
}

async function getOrCreateAuthUser(doctor) {
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', doctor.email)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data, error } = await supabase.auth.admin.createUser({
    email: doctor.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: doctor.fullName }
  });

  if (error) throw error;
  return data.user.id;
}

async function deactivateStaleSeedDoctors() {
  const desiredEmails = new Set(doctors.map(doctor => doctor.email));
  const { data: seedUsers, error: seedUsersError } = await supabase
    .from('users')
    .select('id,email')
    .eq('role', 'doctor')
    .like('email', 'delhi.%@test.com');

  if (seedUsersError) throw seedUsersError;

  const staleUserIds = (seedUsers || [])
    .filter(user => !desiredEmails.has(user.email))
    .map(user => user.id);

  if (staleUserIds.length === 0) return;

  const { error: profileError } = await supabase
    .from('doctor_profiles')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .in('user_id', staleUserIds);

  if (profileError) throw profileError;

  const { error: affiliationError } = await supabase
    .from('doctor_hospital_affiliations')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .in('doctor_id', staleUserIds);

  if (affiliationError) throw affiliationError;
}

async function main() {
  await assertDelhiMigrationApplied();

  const hospitalSeedRows = loadDelhiHospitalsDataset();
  const optionalColumns = await getOptionalHospitalColumns();
  const supportsIndiaSource = await hasIndiaSourceColumns();
  const hospitalIds = new Map();

  for (const hospital of hospitalSeedRows) {
    const hospitalPayload = {
      ...hospital,
      city: 'Delhi',
      updated_at: new Date().toISOString()
    };

    if (!optionalColumns.hasBedsAndActiveColumns) {
      delete hospitalPayload.beds;
      delete hospitalPayload.is_active;
    }

    let data;
    let error;

    if (supportsIndiaSource) {
      hospitalPayload.source_dataset = 'delhi-curated-dataset';
      hospitalPayload.source_record_id = hospital.name;

      const existingResult = await supabase
        .from('hospitals')
        .select('id')
        .eq('name', hospital.name)
        .limit(1)
        .maybeSingle();

      if (existingResult.error) throw existingResult.error;

      const saveResult = existingResult.data
        ? await supabase
          .from('hospitals')
          .update(hospitalPayload)
          .eq('id', existingResult.data.id)
          .select('id, name')
          .single()
        : await supabase
          .from('hospitals')
          .insert(hospitalPayload)
          .select('id, name')
          .single();

      data = saveResult.data;
      error = saveResult.error;
    } else {
      const saveResult = await supabase
        .from('hospitals')
        .upsert(hospitalPayload, { onConflict: 'name' })
        .select('id, name')
        .single();

      data = saveResult.data;
      error = saveResult.error;
    }

    if (error) throw error;
    hospitalIds.set(data.name, data.id);
  }

  if (optionalColumns.hasBedsAndActiveColumns) {
    const legacyHospitalNames = hospitals
      .map(hospital => hospital.name)
      .filter(hospitalName => !hospitalIds.has(hospitalName));

    if (legacyHospitalNames.length > 0) {
      const { error: legacyHospitalError } = await supabase
        .from('hospitals')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('name', legacyHospitalNames);

      if (legacyHospitalError) throw legacyHospitalError;
    }
  }

  for (const doctor of doctors) {
    const userId = await getOrCreateAuthUser(doctor);
    const specializationId = await getOrCreateSpecialization(doctor.specialization);

    const { error: userError } = await supabase
      .from('users')
      .upsert({
        id: userId,
        role: 'doctor',
        full_name: doctor.fullName,
        phone: doctor.phone,
        email: doctor.email
      });

    if (userError) throw userError;

    const { error: profileError } = await supabase
      .from('doctor_profiles')
      .upsert({
        user_id: userId,
        specialization_id: specializationId,
        license_no: doctor.licenseNo,
        years_experience: doctor.yearsExperience,
        consultation_fee: doctor.fee,
        bio: `${doctor.credentials}. Delhi-based ${doctor.specialization}.`,
        status: 'active',
        credentials: doctor.credentials,
        updated_at: new Date().toISOString()
      });

    if (profileError) throw profileError;

    const desiredHospitalIds = doctor.hospitals.map(hospitalName => hospitalIds.get(hospitalName));
    if (desiredHospitalIds.some(hospitalId => !hospitalId)) {
      const missingHospital = doctor.hospitals.find(hospitalName => !hospitalIds.get(hospitalName));
      throw new Error(`No dataset hospital found for doctor ${doctor.email}: ${missingHospital}`);
    }

    const { data: currentAffiliations, error: currentAffiliationsError } = await supabase
      .from('doctor_hospital_affiliations')
      .select('hospital_id')
      .eq('doctor_id', userId)
      .eq('status', 'accepted');

    if (currentAffiliationsError) throw currentAffiliationsError;

    const obsoleteHospitalIds = (currentAffiliations || [])
      .map(affiliation => affiliation.hospital_id)
      .filter(hospitalId => !desiredHospitalIds.includes(hospitalId));

    if (obsoleteHospitalIds.length > 0) {
      const { error: revokeError } = await supabase
        .from('doctor_hospital_affiliations')
        .update({ status: 'revoked', updated_at: new Date().toISOString() })
        .eq('doctor_id', userId)
        .in('hospital_id', obsoleteHospitalIds);

      if (revokeError) throw revokeError;
    }

    const affiliationRows = doctor.hospitals.map((hospitalName, index) => {
      const schedule = scheduleByIndex[index % scheduleByIndex.length];
      return {
        doctor_id: userId,
        hospital_id: hospitalIds.get(hospitalName),
        status: 'accepted',
        specialization_id: specializationId,
        consultation_fee: doctor.fee + index * 100,
        working_days: schedule.working_days,
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        updated_at: new Date().toISOString()
      };
    });

    const { error: affiliationError } = await supabase
      .from('doctor_hospital_affiliations')
      .upsert(affiliationRows, { onConflict: 'doctor_id,hospital_id' });

    if (affiliationError) throw affiliationError;

    const desiredAvailabilityRows = affiliationRows.flatMap(affiliation =>
      affiliation.working_days.map(dayOfWeek => ({
        doctor_id: userId,
        hospital_id: affiliation.hospital_id,
        day_of_week: dayOfWeek,
        start_time: affiliation.start_time,
        end_time: affiliation.end_time,
        slot_duration_minutes: 30
      }))
    );
    const { data: existingAvailability, error: existingAvailabilityError } = await supabase
      .from('doctor_availability')
      .select('hospital_id,day_of_week,start_time')
      .eq('doctor_id', userId);

    if (existingAvailabilityError) throw existingAvailabilityError;

    const existingAvailabilityKeys = new Set(
      (existingAvailability || []).map(row =>
        `${row.hospital_id}:${row.day_of_week}:${row.start_time}`
      )
    );
    const missingAvailabilityRows = desiredAvailabilityRows.filter(row =>
      !existingAvailabilityKeys.has(`${row.hospital_id}:${row.day_of_week}:${row.start_time}`)
    );

    if (missingAvailabilityRows.length > 0) {
      const { error: availabilityError } = await supabase
        .from('doctor_availability')
        .insert(missingAvailabilityRows);

      if (availabilityError) throw availabilityError;
    }
  }

  console.log(`Saved ${doctors.length} active doctor profiles and their hospital schedules.`);
  await deactivateStaleSeedDoctors();
  console.log('Deactivated obsolete Delhi test-doctor affiliations.');

  const datasetHospitalIds = [...hospitalIds.values()];
  const { data: acceptedAffiliations, error: coverageError } = await supabase
    .from('doctor_hospital_affiliations')
    .select('hospital_id, doctor_id')
    .in('hospital_id', datasetHospitalIds)
    .eq('status', 'accepted');

  if (coverageError) throw coverageError;

  const affiliatedDoctorIds = [...new Set((acceptedAffiliations || []).map(affiliation => affiliation.doctor_id))];
  const { data: activeProfiles, error: profilesError } = await supabase
    .from('doctor_profiles')
    .select('user_id')
    .in('user_id', affiliatedDoctorIds)
    .eq('status', 'active');

  if (profilesError) throw profilesError;

  const activeDoctorIds = new Set((activeProfiles || []).map(profile => profile.user_id));
  const coveredHospitalIds = new Set(
    (acceptedAffiliations || [])
      .filter(affiliation => activeDoctorIds.has(affiliation.doctor_id))
      .map(affiliation => affiliation.hospital_id)
  );
  const uncoveredHospitals = [...hospitalIds.entries()]
    .filter(([, hospitalId]) => !coveredHospitalIds.has(hospitalId))
    .map(([hospitalName]) => hospitalName);

  if (uncoveredHospitals.length > 0) {
    throw new Error(`Delhi seed coverage failed. Hospitals without active doctors: ${uncoveredHospitals.join(', ')}`);
  }

  console.log(`Seeded ${hospitalSeedRows.length} Delhi hospitals and ${doctors.length} Delhi doctors.`);
  console.log(`Verified active doctor coverage for all ${coveredHospitalIds.size} dataset hospitals.`);
  console.log(`Seed doctor password: ${password}`);
}

try {
  await main();
} catch (error) {
  console.error('Delhi seed failed:', error);
  process.exitCode = 1;
}
