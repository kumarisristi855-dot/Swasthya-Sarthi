const PATIENT_LOCATION_PREFIX = 'caresync-patient-location:';
export const LEGACY_LOCATION_KEY = 'caresync-public-location';

export function patientLocationStorageKey(userId) {
  return `${PATIENT_LOCATION_PREFIX}${userId || 'current'}`;
}

export function clearPatientSessionStorage(userId) {
  if (userId) window.localStorage.removeItem(patientLocationStorageKey(userId));
  window.sessionStorage.removeItem(LEGACY_LOCATION_KEY);
}
