import { supabase } from '../../lib/supabase.js';
import { sendSMS } from './sendSMS.js';

const DEFAULT_INTERVAL_MS = 60 * 1000;
const DEFAULT_LOOKAHEAD_MINUTES = 60;

async function sendDueAppointmentReminders() {
  const now = new Date();
  const lookahead = new Date(now.getTime() + DEFAULT_LOOKAHEAD_MINUTES * 60 * 1000);

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(`
      id,
      patient_id,
      appointment_time,
      status,
      patient:users!patient_id (
        phone
      ),
      doctor:users!doctor_id (
        full_name
      ),
      hospital:hospitals!hospital_id (
        name,
        address
      )
    `)
    .eq('status', 'booked')
    .gte('appointment_time', now.toISOString())
    .lte('appointment_time', lookahead.toISOString());

  if (error) {
    console.error('[REMINDER SCHEDULER] Failed to query appointments:', error);
    return;
  }

  if (!appointments || appointments.length === 0) {
    return;
  }

  const { data: existingReminders, error: reminderError } = await supabase
    .from('notifications')
    .select('payload')
    .eq('channel', 'sms')
    .eq('type', 'appointment_reminder');

  if (reminderError) {
    console.error('[REMINDER SCHEDULER] Failed to query sent reminders:', reminderError);
    return;
  }

  const alreadySentIds = new Set(
    (existingReminders || [])
      .map(notification => notification.payload?.appointmentId)
      .filter(Boolean)
  );

  for (const appointment of appointments) {
    if (alreadySentIds.has(appointment.id)) {
      continue;
    }

    const appointmentTimeFormatted = new Date(appointment.appointment_time).toLocaleString();
    const locationText = appointment.hospital?.address
      ? `${appointment.hospital.name}, ${appointment.hospital.address}`
      : (appointment.hospital?.name || 'clinic');
    const body = `Reminder: Your appointment with ${appointment.doctor?.full_name || 'your practitioner'} is at ${appointmentTimeFormatted} at ${locationText}.`;

    await sendSMS(
      appointment.patient_id,
      appointment.patient?.phone,
      body,
      'appointment_reminder',
      { appointmentId: appointment.id }
    );
  }
}

export function startAppointmentReminderScheduler(intervalMs = DEFAULT_INTERVAL_MS) {
  if (process.env.DISABLE_REMINDER_SCHEDULER === 'true') {
    console.log('[REMINDER SCHEDULER] Disabled by environment variable.');
    return null;
  }

  sendDueAppointmentReminders().catch(error => {
    console.error('[REMINDER SCHEDULER] Initial run failed:', error);
  });

  const timer = setInterval(() => {
    sendDueAppointmentReminders().catch(error => {
      console.error('[REMINDER SCHEDULER] Scheduled run failed:', error);
    });
  }, intervalMs);

  console.log('[REMINDER SCHEDULER] Appointment SMS reminders scheduled.');
  return timer;
}
