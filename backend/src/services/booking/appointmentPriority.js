export const EMERGENCY_SYMPTOM_PREFIX = '[SWASTHYA SARTHI_EMERGENCY] ';

export function isMissingAppointmentTypeColumn(error) {
  return error?.code === '42703' || (
    error?.code === 'PGRST204' && error?.message?.includes('appointment_type')
  );
}

export function appointmentTypeFor(row) {
  if (row?.appointment_type === 'emergency') return 'emergency';
  return row?.symptom_query?.startsWith(EMERGENCY_SYMPTOM_PREFIX) ? 'emergency' : 'routine';
}

export function cleanSymptomQuery(value) {
  return value?.startsWith(EMERGENCY_SYMPTOM_PREFIX)
    ? value.slice(EMERGENCY_SYMPTOM_PREFIX.length)
    : value;
}
