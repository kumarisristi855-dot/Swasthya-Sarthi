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

const verifiedAt = '2026-07-28T00:00:00.000Z';
const delhiGovernmentSource = 'https://health.delhi.gov.in/health/delhi-govt-hospital-0';
const delhiSocietySource = 'https://health.delhi.gov.in/health/society-hospitals';

const hospitalAudit = [
  ['Aruna Asaf Ali Govt. Hospital', 'verified', delhiGovernmentSource, null],
  ['Acharya Shree Bhikshu Hospital', 'verified', delhiGovernmentSource, null],
  ['Attar Sain Jain Hospital', 'verified', delhiGovernmentSource, null],
  ['Baba Saheb Ambedkar Hospital', 'verified', delhiGovernmentSource, null],
  ['Bhagwan Mahavir Hospital', 'verified', delhiGovernmentSource, null],
  ['Babu Jagjivan Ram Hospital', 'verified', delhiGovernmentSource, null],
  ['Deen Dayal Upadhyay Hospital', 'verified', delhiGovernmentSource, null],
  ['Guru Teg Bahadur Hospital', 'verified', delhiGovernmentSource, null],
  ['Lok Nayak Hospital', 'verified', delhiGovernmentSource, null],
  ['Govind Ballabh Pant Hospital', 'verified', delhiGovernmentSource, null],
  ['Rajiv Gandhi Super Speciality Hospital', 'verified', delhiGovernmentSource, null],
  ['Institute of Liver & Biliary Sciences', 'verified', delhiSocietySource, null],
  ['Chacha Nehru Bal Chikitsalaya', 'verified', delhiSocietySource, null],
  ['Delhi State Cancer Institute', 'verified', delhiSocietySource, null],
  ['Institute of Human Behaviour and Allied Sciences', 'verified', delhiSocietySource, null],
  ['Janakpuri Super Speciality Hospital', 'verified', delhiSocietySource, null],
  ['Sardar Vallabh Bhai Patel Hospital', 'verified', delhiGovernmentSource, null],
  ['Sanjay Gandhi Memorial Hospital', 'verified', delhiGovernmentSource, null],
  ['Indraprastha Apollo Hospital', 'verified', 'https://www.apollohospitals.com/region/delhi/', null],
  ['Max Super Specialty Hospital - Saket', 'verified', 'https://www.maxhealthcare.in/hospital-network/max-super-speciality-hospital-saket', null],
  ['Fortis Healthcare - Vasant Kunj', 'verified', 'https://www.fortishealthcare.com/location/fortis-flt-lt-rajan-dhall-hospital-vasant-kunj', null],
  ['Sir Ganga Ram Hospital', 'verified', 'https://sgrh.com/', null],
  ['Apollo Hospital Delhi', 'excluded', 'https://www.apollohospitals.com/region/delhi/', 'Duplicate of Indraprastha Apollo Hospital'],
  ['Fortis Healthcare - Noida', 'excluded', 'https://www.fortishealthcare.com/location/fortis-hospital-noida', 'Located in Noida, Uttar Pradesh, not Delhi'],
  ['Manipal Hospital - Delhi', 'excluded', 'https://www.manipalhospitals.com/delhi/about-us/', 'Dataset address is Punjabi Bagh; official Delhi hospital is in Dwarka'],
  ['Dr. Bhubaneswar Borooah Institute of Acute Care', 'excluded', null, 'No authoritative Delhi facility match found'],
  ['Bharat Hospital & Institute of Cardiology', 'unverified', null, 'No authoritative official source found'],
  ['Batra Hospital & Medical Research Centre', 'unverified', null, 'Awaiting official directory review'],
  ['Delhi Heart & Lung Institute', 'unverified', null, 'Awaiting address and roster verification'],
  ['Holy Family Hospital', 'unverified', null, 'Awaiting official directory review']
];

const doctors = [
  {
    name: 'Dr. Rajeeve Kumar Rajput', specialization: 'Cardiologist',
    hospital: 'Indraprastha Apollo Hospital', sourceName: 'Apollo Hospitals',
    profile: 'https://www.apollohospitals.com/region/delhi/doctor/dr-rajeeve-kumar-rajput/',
    credentials: 'MBBS, MD, DM', yearsExperience: 30
  },
  {
    name: 'Dr. Vinit Suri', specialization: 'Neurologist',
    hospital: 'Indraprastha Apollo Hospital', sourceName: 'Apollo Hospitals',
    profile: 'https://www.apollohospitals.com/doctors/neurologist/delhi/dr-vinit-suri',
    credentials: 'MBBS, MD, DM', yearsExperience: 27
  },
  {
    name: 'Dr. Yatinder Kharbanda', specialization: 'Orthopedic',
    hospital: 'Indraprastha Apollo Hospital', sourceName: 'Apollo Hospitals',
    profile: 'https://www.apollohospitals.com/doctors/orthopedician/delhi/dr-yatinder-kharbanda',
    credentials: 'MBBS, MS, D.Orth, DNB', yearsExperience: 30
  },
  {
    name: 'Dr. Ajay K Sinha', specialization: 'General Physician',
    hospital: 'Indraprastha Apollo Hospital', sourceName: 'Apollo Hospitals',
    profile: 'https://www.apollohospitals.com/doctors/internal-medicine-physician/delhi/dr-ajay-k-sinha',
    credentials: 'MD (Internal Medicine)', yearsExperience: 30
  },
  {
    name: 'Dr. Sanjiv Jasuja', specialization: 'Nephrologist',
    hospital: 'Indraprastha Apollo Hospital', sourceName: 'Apollo Hospitals',
    profile: 'https://www.apollohospitals.com/region/delhi/doctors-team/',
    credentials: null, yearsExperience: null
  },
  {
    name: 'Dr. Ambrish Mithal', specialization: 'Endocrinologist',
    hospital: 'Max Super Specialty Hospital - Saket', sourceName: 'Max Healthcare',
    profile: 'https://www.maxhealthcare.in/doctor/dr-ambrish-mithal',
    credentials: null, yearsExperience: null
  },
  {
    name: 'Prof. (Dr.) Atul Sharma', specialization: 'Oncologist',
    hospital: 'Max Super Specialty Hospital - Saket', sourceName: 'Max Healthcare',
    profile: 'https://www.maxhealthcare.in/doctor/dr-atul-sharma',
    credentials: null, yearsExperience: null
  },
  {
    name: 'Dr. Puneet Agarwal', specialization: 'Neurologist',
    hospital: 'Max Super Specialty Hospital - Saket', sourceName: 'Max Healthcare',
    profile: 'https://www.maxhealthcare.in/doctor/dr-puneet-agarwal',
    credentials: null, yearsExperience: null
  },
  {
    name: 'Dr. Vivek Nangia', specialization: 'Pulmonologist',
    hospital: 'Max Super Specialty Hospital - Saket', sourceName: 'Max Healthcare',
    profile: 'https://www.maxhealthcare.in/doctor/dr-vivek-nangia',
    credentials: null, yearsExperience: null
  },
  {
    name: 'Dr. Rajashekar Reddi', specialization: 'Neurologist',
    hospital: 'Max Super Specialty Hospital - Saket', sourceName: 'Max Healthcare',
    profile: 'https://www.maxhealthcare.in/doctor/dr-rajashekar-reddi',
    credentials: null, yearsExperience: null
  },
  {
    name: 'Dr. Gurinder Bedi', specialization: 'Orthopedic',
    hospital: 'Fortis Healthcare - Vasant Kunj', sourceName: 'Fortis Healthcare',
    profile: 'https://www.fortishealthcare.com/location/fortis-flt-lt-rajan-dhall-hospital-vasant-kunj',
    credentials: null, yearsExperience: null
  },
  {
    name: 'Dr. Kameshwar Prasad', specialization: 'Neurologist',
    hospital: 'Fortis Healthcare - Vasant Kunj', sourceName: 'Fortis Healthcare',
    profile: 'https://www.fortishealthcare.com/location/fortis-flt-lt-rajan-dhall-hospital-vasant-kunj',
    credentials: null, yearsExperience: null
  },
  {
    name: 'Dr. Prashant Saxena', specialization: 'Pulmonologist',
    hospital: 'Fortis Healthcare - Vasant Kunj', sourceName: 'Fortis Healthcare',
    profile: 'https://www.fortishealthcare.com/location/fortis-flt-lt-rajan-dhall-hospital-vasant-kunj',
    credentials: null, yearsExperience: null
  },
  {
    name: 'Dr. Rahul Nagpal', specialization: 'Pediatrician',
    hospital: 'Fortis Healthcare - Vasant Kunj', sourceName: 'Fortis Healthcare',
    profile: 'https://www.fortishealthcare.com/location/fortis-flt-lt-rajan-dhall-hospital-vasant-kunj',
    credentials: null, yearsExperience: null
  },
  {
    name: 'Dr. Sanjeev Gulati', specialization: 'Nephrologist',
    hospital: 'Fortis Healthcare - Vasant Kunj', sourceName: 'Fortis Healthcare',
    profile: 'https://www.fortishealthcare.com/location/fortis-flt-lt-rajan-dhall-hospital-vasant-kunj',
    credentials: null, yearsExperience: null
  },
  {
    name: 'Dr. Kavita Tyagi', specialization: 'Cardiologist',
    hospital: 'Sir Ganga Ram Hospital', sourceName: 'Sir Ganga Ram Hospital',
    profile: 'https://sgrh.com/departments/cardiology/kavita-tyagi',
    credentials: null, yearsExperience: null
  },
  {
    name: 'Dr. J.P.S. Sawhney', specialization: 'Cardiologist',
    hospital: 'Sir Ganga Ram Hospital', sourceName: 'Sir Ganga Ram Hospital',
    profile: 'https://sgrh.com/departments/cardiology/jps-sawhney',
    credentials: null, yearsExperience: null
  },
  {
    name: 'Dr. Prateek Kumar Gupta', specialization: 'Orthopedic',
    hospital: 'Sir Ganga Ram Hospital', sourceName: 'Sir Ganga Ram Hospital',
    profile: 'https://sgrh.com/departments/orthopaedics/prateek-kumar-gupta',
    credentials: null, yearsExperience: null
  },
  {
    name: 'Dr. Shoaib Ahmed', specialization: 'Cardiologist',
    hospital: 'Sir Ganga Ram Hospital', sourceName: 'Sir Ganga Ram Hospital',
    profile: 'https://sgrh.com/departments/cardiology/shoaib-ahmed',
    credentials: null, yearsExperience: null
  },
  {
    name: 'Dr. Sangeeta Sachdeva', specialization: 'Cardiologist',
    hospital: 'Sir Ganga Ram Hospital', sourceName: 'Sir Ganga Ram Hospital',
    profile: 'https://sgrh.com/departments/cardiology/sangeeta-sachdeva',
    credentials: null, yearsExperience: null
  }
];

async function getSpecializationIds() {
  const required = [...new Set(doctors.map(doctor => doctor.specialization))];
  const { error: nephrologyError } = await supabase
    .from('specializations')
    .upsert({
      name: 'Nephrologist',
      description: 'Specialist in kidney disease, renal function, dialysis, and related conditions.'
    }, { onConflict: 'name' });

  if (nephrologyError) throw nephrologyError;

  const { data, error } = await supabase
    .from('specializations')
    .select('id,name')
    .in('name', required);

  if (error) throw error;
  const ids = new Map((data || []).map(row => [row.name, row.id]));
  const missing = required.filter(name => !ids.has(name));
  if (missing.length) throw new Error(`Missing specializations: ${missing.join(', ')}`);
  return ids;
}

async function updateHospitalAudit() {
  const hospitalIds = new Map();

  for (const [name, status, source, reason] of hospitalAudit) {
    const { data, error } = await supabase
      .from('hospitals')
      .update({
        verification_status: status,
        verification_source_url: source,
        verified_at: status === 'verified' ? verifiedAt : null,
        exclusion_reason: reason,
        updated_at: new Date().toISOString()
      })
      .eq('name', name)
      .select('id,name')
      .maybeSingle();

    if (error) throw error;
    if (data) hospitalIds.set(data.name, data.id);
  }

  return hospitalIds;
}

async function deactivateSampleDoctors() {
  const { data: users, error } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'doctor')
    .like('email', 'delhi.%@test.com');

  if (error) throw error;
  const ids = (users || []).map(user => user.id);
  if (!ids.length) return 0;

  const { error: profileError } = await supabase
    .from('doctor_profiles')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .in('user_id', ids);
  if (profileError) throw profileError;

  const { error: affiliationError } = await supabase
    .from('doctor_hospital_affiliations')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .in('doctor_id', ids);
  if (affiliationError) throw affiliationError;

  return ids.length;
}

async function main() {
  const { error: schemaError } = await supabase
    .from('verified_doctors')
    .select('id')
    .limit(1);

  if (schemaError?.code === '42501') {
    throw new Error(
      'The directory tables exist but service_role grants are missing. Rerun database/migrations/07_verified_public_directory.sql in Supabase SQL Editor.'
    );
  }

  if (schemaError) {
    throw new Error('Run database/migrations/07_verified_public_directory.sql in Supabase SQL Editor first.');
  }

  const specializationIds = await getSpecializationIds();
  const hospitalIds = await updateHospitalAudit();
  const missingHospitals = [...new Set(doctors.map(doctor => doctor.hospital))]
    .filter(name => !hospitalIds.has(name));

  if (missingHospitals.length) {
    throw new Error(`Hospital records not found: ${missingHospitals.join(', ')}`);
  }

  const { error: deactivateError } = await supabase
    .from('verified_doctors')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .neq('source_name', '');
  if (deactivateError) throw deactivateError;

  for (const doctor of doctors) {
    const { data: savedDoctor, error: doctorError } = await supabase
      .from('verified_doctors')
      .upsert({
        full_name: doctor.name,
        specialization_id: specializationIds.get(doctor.specialization),
        credentials: doctor.credentials,
        years_experience: doctor.yearsExperience,
        official_profile_url: doctor.profile,
        source_name: doctor.sourceName,
        verified_at: verifiedAt,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'full_name,source_name' })
      .select('id')
      .single();

    if (doctorError) throw doctorError;

    const { error: affiliationError } = await supabase
      .from('verified_doctor_hospital_affiliations')
      .upsert({
        doctor_id: savedDoctor.id,
        hospital_id: hospitalIds.get(doctor.hospital),
        department_name: doctor.specialization,
        official_booking_url: doctor.profile,
        source_url: doctor.profile,
        verified_at: verifiedAt,
        status: 'verified',
        updated_at: new Date().toISOString()
      }, { onConflict: 'doctor_id,hospital_id' });

    if (affiliationError) throw affiliationError;
  }

  const sampleCount = await deactivateSampleDoctors();
  console.log(`Imported ${doctors.length} source-verified doctors across 4 Delhi hospitals.`);
  console.log(`Marked ${sampleCount} Delhi test doctor accounts inactive without deleting auth records.`);
  console.log('No fees, appointment slots, or patient-booking claims were imported.');
}

try {
  await main();
} catch (error) {
  console.error('Verified directory seed failed:', error.message || error);
  process.exitCode = 1;
}
