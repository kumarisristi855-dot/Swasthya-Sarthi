const fixtureTextPattern = /(?:^|\b)(test doctor|caresync test clinic|development-only)(?:\b|$)/i;

export const isProduction = process.env.NODE_ENV === 'production';

export function isDevelopmentFixtureHospital(hospital) {
  if (!hospital) return false;
  return hospital.source_dataset === 'caresync-development' ||
    hospital.verification_status === 'excluded' ||
    fixtureTextPattern.test(`${hospital.name || ''} ${hospital.address || ''}`);
}

export function isDevelopmentFixtureDoctor(doctor) {
  if (!doctor) return false;
  const user = doctor.users || doctor.user || doctor.doctor || doctor;
  const profile = doctor.doctor_profiles || doctor.profile || doctor;
  return /@test\.com$/i.test(user.email || '') ||
    /^test doctor\b/i.test(user.full_name || user.fullName || '') ||
    /^TEST-/i.test(profile.license_no || profile.licenseNo || '') ||
    fixtureTextPattern.test(profile.bio || '');
}

export function hideDevelopmentHospital(hospital) {
  return isProduction && isDevelopmentFixtureHospital(hospital);
}

export function hideDevelopmentDoctor(doctor) {
  return isProduction && isDevelopmentFixtureDoctor(doctor);
}
