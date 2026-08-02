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

const verifiedAt = '2026-07-29T00:00:00.000Z';
const nbeSource = 'https://accr.natboard.edu.in/online_user/faculty_in_department.php?token=bzfGHojMAcPQO5DmV9Wiut2rLC6Rle11%28J02Eh2dq01wBI1%24yn47sYvZhymA8IT0cW4QtpFiC9zZ';
const mjmRoster = 'https://www.mjmhospitalbokaro.com/our-doctors';
const mjmBooking = 'https://www.mjmhospitalbokaro.com/book-an-appointment';
const kmmRoster = 'https://kmm-hospital.com/doctors/';
const kmmBooking = 'https://kmm-hospital.com/opd-appointment/';

const hospitals = [
  {
    name: 'Bokaro General Hospital',
    address: 'Sector 4, Bokaro Steel City, Bokaro, Jharkhand 827004',
    city: 'Bokaro Steel City',
    district: 'Bokaro',
    state: 'Jharkhand',
    pincode: '827004',
    hospitalType: 'Multispeciality Hospital',
    sourceDataset: 'natboard-accredited-faculty-directory',
    sourceRecordId: 'nbe-bokaro-general-hospital-general-medicine',
    sourceUrl: nbeSource
  },
  {
    name: 'MJM Multispeciality Hospital',
    address: 'Ushardih, Bijulia, Talgaria Road, Chas, Bokaro, Jharkhand 827013',
    city: 'Chas',
    district: 'Bokaro',
    state: 'Jharkhand',
    pincode: '827013',
    hospitalType: 'Multispeciality Hospital',
    sourceDataset: 'hospital-official-directory',
    sourceRecordId: 'mjm-multispeciality-hospital-bokaro',
    sourceUrl: mjmRoster,
    website: 'https://www.mjmhospitalbokaro.com',
    phone: '+91 9654647976'
  },
  {
    name: 'KMM Hospital',
    address: 'Bypass Road, Chas, Bokaro, Jharkhand 827013',
    city: 'Chas',
    district: 'Bokaro',
    state: 'Jharkhand',
    pincode: '827013',
    hospitalType: 'Multispeciality Hospital',
    sourceDataset: 'hospital-official-directory',
    sourceRecordId: 'kmm-hospital-chas-bokaro',
    sourceUrl: kmmRoster,
    website: 'https://kmm-hospital.com',
    phone: '06542 236 188'
  }
];

const doctors = [
  { name: 'Dr. Simal Mardi', specialization: 'General Physician', credentials: 'MD General Medicine', hospital: 'Bokaro General Hospital', sourceName: 'National Board of Examinations', profile: nbeSource, booking: nbeSource },
  { name: 'Dr. Vijay Chandra Jha', specialization: 'General Physician', credentials: 'MD General Medicine', hospital: 'Bokaro General Hospital', sourceName: 'National Board of Examinations', profile: nbeSource, booking: nbeSource },
  { name: 'Dr. Bibhuti Bhushan Karunamay', specialization: 'General Physician', credentials: 'MD General Medicine', hospital: 'Bokaro General Hospital', sourceName: 'National Board of Examinations', profile: nbeSource, booking: nbeSource },
  { name: 'Dr. Vijay Kumar', specialization: 'General Physician', credentials: 'DNB General Medicine', hospital: 'Bokaro General Hospital', sourceName: 'National Board of Examinations', profile: nbeSource, booking: nbeSource },
  { name: 'Dr. Pradip Kumar', specialization: 'General Physician', credentials: 'MD General Medicine', hospital: 'Bokaro General Hospital', sourceName: 'National Board of Examinations', profile: nbeSource, booking: nbeSource },
  { name: 'Dr. Santosh Kumar Chaubey', specialization: 'General Physician', credentials: 'DNB General Medicine', hospital: 'Bokaro General Hospital', sourceName: 'National Board of Examinations', profile: nbeSource, booking: nbeSource },

  { name: 'Dr. Nivedita Dutta', specialization: 'Gynecologist', hospital: 'MJM Multispeciality Hospital', sourceName: 'MJM Multispeciality Hospital', profile: mjmRoster, booking: mjmBooking },
  { name: 'Dr. Shubhra Verma', specialization: 'Gynecologist', hospital: 'MJM Multispeciality Hospital', sourceName: 'MJM Multispeciality Hospital', profile: mjmRoster, booking: mjmBooking },
  { name: 'Dr. Mohini Singh', specialization: 'Ophthalmologist', hospital: 'MJM Multispeciality Hospital', sourceName: 'MJM Multispeciality Hospital', profile: mjmRoster, booking: mjmBooking },
  { name: 'Dr. Sunil Kumar', specialization: 'ENT Specialist', hospital: 'MJM Multispeciality Hospital', sourceName: 'MJM Multispeciality Hospital', profile: mjmRoster, booking: mjmBooking },
  { name: 'Dr. Rakesh Singh', specialization: 'Orthopedic', hospital: 'MJM Multispeciality Hospital', sourceName: 'MJM Multispeciality Hospital', profile: mjmRoster, booking: mjmBooking },
  { name: 'Dr. K. P. Chattarjee', specialization: 'Dermatologist', hospital: 'MJM Multispeciality Hospital', sourceName: 'MJM Multispeciality Hospital', profile: mjmRoster, booking: mjmBooking },
  { name: 'Dr. M. G. Rasul', specialization: 'General Physician', hospital: 'MJM Multispeciality Hospital', sourceName: 'MJM Multispeciality Hospital', profile: mjmRoster, booking: mjmBooking },
  { name: 'Dr. Pushpanjali Karwa', specialization: 'Gynecologist', hospital: 'MJM Multispeciality Hospital', sourceName: 'MJM Multispeciality Hospital', profile: mjmRoster, booking: mjmBooking },
  { name: 'Dr. Rahul Sinha', specialization: 'Orthopedic', hospital: 'MJM Multispeciality Hospital', sourceName: 'MJM Multispeciality Hospital', profile: mjmRoster, booking: mjmBooking },
  { name: 'Dr. Anand Kumar Manjhi', specialization: 'Pediatrician', hospital: 'MJM Multispeciality Hospital', sourceName: 'MJM Multispeciality Hospital', profile: mjmRoster, booking: mjmBooking },

  { name: 'Dr. Nirupama Singh', specialization: 'Gynecologist', credentials: 'MBBS, DGO', hospital: 'KMM Hospital', sourceName: 'KMM Hospital', profile: kmmRoster, booking: kmmBooking },
  { name: 'Dr. Jyoti Gupta', specialization: 'Gynecologist', credentials: 'MBBS, MD, FRM', hospital: 'KMM Hospital', sourceName: 'KMM Hospital', profile: kmmRoster, booking: kmmBooking },
  { name: 'Dr. Deeba Farhat', specialization: 'Gynecologist', credentials: 'MBBS, DNB', hospital: 'KMM Hospital', sourceName: 'KMM Hospital', profile: kmmRoster, booking: kmmBooking },
  { name: 'Dr. Anupama Verma', specialization: 'Gynecologist', credentials: 'MBBS, DGO', hospital: 'KMM Hospital', sourceName: 'KMM Hospital', profile: kmmRoster, booking: kmmBooking },
  { name: 'Dr. Nivedita Dutta', specialization: 'Gynecologist', credentials: 'MBBS, MD', hospital: 'KMM Hospital', sourceName: 'KMM Hospital', profile: kmmRoster, booking: kmmBooking },
  { name: 'Dr. Imran Ashgar', specialization: 'Pediatrician', credentials: 'MBBS, MD', hospital: 'KMM Hospital', sourceName: 'KMM Hospital', profile: kmmRoster, booking: kmmBooking },
  { name: 'Dr. Vishal Kumar Mishra', specialization: 'Orthopedic', credentials: 'MBBS, DNB (Ortho)', hospital: 'KMM Hospital', sourceName: 'KMM Hospital', profile: kmmRoster, booking: kmmBooking },
  { name: 'Dr. Vishakha Sharma', specialization: 'Dentist', credentials: 'BDS', hospital: 'KMM Hospital', sourceName: 'KMM Hospital', profile: kmmRoster, booking: kmmBooking },
  { name: 'Dr. Amrish Ranjan', specialization: 'General Physician', credentials: 'MBBS, MD', hospital: 'KMM Hospital', sourceName: 'KMM Hospital', profile: kmmRoster, booking: kmmBooking },
  { name: 'Dr. Rahul Kumar', specialization: 'Cardiologist', credentials: 'MBBS, MD, DM', hospital: 'KMM Hospital', sourceName: 'KMM Hospital', profile: kmmRoster, booking: kmmBooking },
  { name: 'Dr. Harender Kumar Singh', specialization: 'General Physician', credentials: 'MBBS', hospital: 'KMM Hospital', sourceName: 'KMM Hospital', profile: kmmRoster, booking: kmmBooking },
  { name: 'Dr. Alok Kumar', specialization: 'Ophthalmologist', credentials: 'MBBS, MS', hospital: 'KMM Hospital', sourceName: 'KMM Hospital', profile: kmmRoster, booking: kmmBooking },
  { name: 'Dr. Biswarup Guha', specialization: 'Urologist', credentials: 'MBBS, MS, MCH', hospital: 'KMM Hospital', sourceName: 'KMM Hospital', profile: kmmRoster, booking: kmmBooking },
  { name: 'Dr. Shashi Ranjan Kumar', specialization: 'Psychiatrist', credentials: 'MBBS, MD', hospital: 'KMM Hospital', sourceName: 'KMM Hospital', profile: kmmRoster, booking: kmmBooking },
  { name: 'Dr. Mukteshwar Rajak', specialization: 'Nephrologist', credentials: 'MBBS, MD, DM', hospital: 'KMM Hospital', sourceName: 'KMM Hospital', profile: kmmRoster, booking: kmmBooking }
];

async function main() {
  const requiredSpecializations = [...new Set(doctors.map(doctor => doctor.specialization))];
  const { data: specializationRows, error: specializationError } = await supabase
    .from('specializations')
    .select('id,name')
    .in('name', requiredSpecializations);

  if (specializationError) throw specializationError;

  const specializationIds = new Map(
    (specializationRows || []).map(specialization => [specialization.name, specialization.id])
  );
  const missing = requiredSpecializations.filter(name => !specializationIds.has(name));
  if (missing.length) throw new Error(`Missing fixed specializations: ${missing.join(', ')}`);

  const hospitalIds = new Map();
  for (const hospital of hospitals) {
    const { data, error } = await supabase
      .from('hospitals')
      .upsert({
        name: hospital.name,
        address: hospital.address,
        city: hospital.city,
        district: hospital.district,
        state: hospital.state,
        pincode: hospital.pincode,
        phone: hospital.phone || null,
        website: hospital.website || null,
        hospital_type: hospital.hospitalType,
        departments: [],
        source_dataset: hospital.sourceDataset,
        source_record_id: hospital.sourceRecordId,
        source_url: hospital.sourceUrl,
        source_last_updated: '2026-07-29',
        verification_status: 'verified',
        verification_source_url: hospital.sourceUrl,
        verified_at: verifiedAt,
        updated_at: new Date().toISOString()
      }, { onConflict: 'source_dataset,source_record_id' })
      .select('id,name')
      .single();

    if (error) throw error;
    hospitalIds.set(data.name, data.id);
  }

  for (const doctor of doctors) {
    const { data: savedDoctor, error: doctorError } = await supabase
      .from('verified_doctors')
      .upsert({
        full_name: doctor.name,
        specialization_id: specializationIds.get(doctor.specialization),
        credentials: doctor.credentials || null,
        years_experience: null,
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
        official_booking_url: doctor.booking,
        source_url: doctor.profile,
        verified_at: verifiedAt,
        status: 'verified',
        updated_at: new Date().toISOString()
      }, { onConflict: 'doctor_id,hospital_id' });

    if (affiliationError) throw affiliationError;
  }

  console.log(`Imported ${doctors.length} source-labelled Bokaro doctors across ${hospitals.length} hospitals.`);
  console.log('These records are public directory profiles; no live Swasthya Sarthi slots were claimed.');
}

try {
  await main();
} catch (error) {
  console.error('Bokaro directory seed failed:', error.message || error);
  process.exitCode = 1;
}
