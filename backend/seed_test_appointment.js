import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { isMissingAppointmentTypeColumn } from './src/services/booking/appointmentPriority.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const PATIENT_EMAIL = process.env.TEST_PATIENT_EMAIL;
const DOCTOR_EMAIL = process.env.TEST_DOCTOR_EMAIL;
const FIXTURE_NOTE = 'Swasthya Sarthi timed test appointment';
const INDIA_OFFSET = '+05:30';

function indiaDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { key: `${values.year}-${values.month}-${values.day}` };
}

async function findFirstOpenSlot(doctorId) {
  const now = new Date();
  const minimumStart = now.getTime() + 15 * 60 * 1000;

  for (let offset = 0; offset < 14; offset += 1) {
    const target = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const { key } = indiaDateParts(target);
    const dayOfWeek = new Date(`${key}T12:00:00Z`).getUTCDay();
    const dayStart = new Date(`${key}T00:00:00${INDIA_OFFSET}`);
    const dayEnd = new Date(`${key}T23:59:59.999${INDIA_OFFSET}`);

    const [{ data: schedules, error: scheduleError }, { data: appointments, error: appointmentError }, { data: leave, error: leaveError }] = await Promise.all([
      supabase.from('doctor_availability').select('*').eq('doctor_id', doctorId).eq('day_of_week', dayOfWeek).order('start_time'),
      supabase.from('appointments').select('appointment_time').eq('doctor_id', doctorId).gte('appointment_time', dayStart.toISOString()).lte('appointment_time', dayEnd.toISOString()),
      supabase.from('doctor_time_off').select('start_datetime,end_datetime').eq('doctor_id', doctorId).lte('start_datetime', dayEnd.toISOString()).gte('end_datetime', dayStart.toISOString())
    ]);

    if (scheduleError) throw scheduleError;
    if (appointmentError) throw appointmentError;
    if (leaveError) throw leaveError;

    const occupied = new Set((appointments || []).map(item => new Date(item.appointment_time).getTime()));
    for (const schedule of schedules || []) {
      const durationMs = schedule.slot_duration_minutes * 60 * 1000;
      let slot = new Date(`${key}T${schedule.start_time.slice(0, 8)}${INDIA_OFFSET}`).getTime();
      const end = new Date(`${key}T${schedule.end_time.slice(0, 8)}${INDIA_OFFSET}`).getTime();

      while (slot + durationMs <= end) {
        const blocked = (leave || []).some(period =>
          slot < new Date(period.end_datetime).getTime() && slot + durationMs > new Date(period.start_datetime).getTime()
        );
        if (slot > minimumStart && !occupied.has(slot) && !blocked) {
          return { appointmentTime: new Date(slot).toISOString(), hospitalId: schedule.hospital_id };
        }
        slot += durationMs;
      }
    }
  }

  throw new Error('No open test-doctor slot was found in the next 14 days.');
}

async function seedTestAppointment() {
  if (!PATIENT_EMAIL || !DOCTOR_EMAIL) {
    throw new Error('Set TEST_PATIENT_EMAIL and TEST_DOCTOR_EMAIL before seeding a test appointment.');
  }

  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id,email,full_name,role')
    .in('email', [PATIENT_EMAIL, DOCTOR_EMAIL]);
  if (userError) throw userError;

  const patient = users?.find(user => user.email?.toLowerCase() === PATIENT_EMAIL.toLowerCase() && user.role === 'patient');
  const doctor = users?.find(user => user.email?.toLowerCase() === DOCTOR_EMAIL.toLowerCase() && user.role === 'doctor');
  if (!patient || !doctor) throw new Error('Run create_test_users.js before seeding the test appointment.');

  const { data: existing, error: existingError } = await supabase
    .from('appointments')
    .select('id,appointment_time,status,hospital_id')
    .eq('patient_id', patient.id)
    .eq('doctor_id', doctor.id)
    .eq('symptom_query', FIXTURE_NOTE)
    .eq('status', 'booked')
    .gt('appointment_time', new Date().toISOString())
    .order('appointment_time')
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  let appointment = existing;
  if (!appointment) {
    const slot = await findFirstOpenSlot(doctor.id);
    const payload = {
      patient_id: patient.id,
      doctor_id: doctor.id,
      hospital_id: slot.hospitalId,
      appointment_time: slot.appointmentTime,
      symptom_query: FIXTURE_NOTE,
      status: 'booked'
    };

    let result = await supabase.from('appointments').insert({ ...payload, appointment_type: 'routine' }).select('id,appointment_time,status,hospital_id').single();
    if (isMissingAppointmentTypeColumn(result.error)) {
      result = await supabase.from('appointments').insert(payload).select('id,appointment_time,status,hospital_id').single();
    }
    if (result.error) throw result.error;
    appointment = result.data;
  }

  const { data: hospital } = await supabase.from('hospitals').select('name,address').eq('id', appointment.hospital_id).single();
  console.log(JSON.stringify({
    appointmentId: appointment.id,
    doctor: doctor.full_name,
    patient: patient.full_name,
    appointmentTime: appointment.appointment_time,
    appointmentTimeIndia: new Date(appointment.appointment_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' }),
    hospital: hospital?.name,
    address: hospital?.address,
    status: appointment.status
  }, null, 2));
}

seedTestAppointment()
  .catch(error => {
    console.error('Test appointment seed failed:', error.message || error);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode || 0), 100));
