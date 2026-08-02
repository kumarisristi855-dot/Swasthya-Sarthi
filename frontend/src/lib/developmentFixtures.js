const fixturePattern = /(?:test doctor|caresync test clinic|development-only)/i;
const isProductionMode = import.meta.env.MODE === 'production';

export function isDevelopmentFixture(value) {
  if (!value) return false;
  const text = [
    value.fullName,
    value.full_name,
    value.name,
    value.address,
    value.bio,
    value.licenseNo,
    value.license_no,
    value.email,
    value.sourceDataset,
    value.source_dataset,
    value.hospital?.name,
    value.hospital?.address
  ].filter(Boolean).join(' ');
  return fixturePattern.test(text) || /@test\.com\b/i.test(text) || /caresync-development/i.test(text);
}

export function productionSafe(items) {
  if (!isProductionMode) return items || [];
  return (items || []).filter(item => !isDevelopmentFixture(item));
}

export function assertProductionSafe(value) {
  return !isProductionMode || !isDevelopmentFixture(value);
}
