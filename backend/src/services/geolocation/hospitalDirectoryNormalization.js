const DELHI_AGENCY_LABELS = new Set([
  'army defence',
  'autonomous',
  'cghs',
  'delhi govt',
  'esi',
  'ipp viii-mcd',
  'mcd',
  'mcw centres mcd',
  'ndmc',
  'ndmc mcw',
  'others',
  'railways'
]);

function clean(value) {
  const text = String(value ?? '').trim();
  return text && !/^n\/?a$/i.test(text) && !/^not available$/i.test(text)
    ? text
    : null;
}

export function isDelhiAgencyLabel(value) {
  return DELHI_AGENCY_LABELS.has(String(value || '').trim().toLowerCase());
}

export function normalizeDelhiDistrict(value) {
  const district = clean(value);
  if (!district) return 'Delhi';
  if (/delhi$/i.test(district)) return district;
  return `${district} Delhi`;
}

function correctCommonSourceTypos(value) {
  return String(value || '')
    .replace(/\bdispen(?:c|s)ry\b/gi, 'Dispensary')
    .replace(/\bsectreteriat\b/gi, 'Secretariat')
    .replace(/\bsecreteriat\b/gi, 'Secretariat')
    .replace(/\bman\s+sarover\b/gi, 'Mansarovar')
    .replace(/\bsubji\s+mandi\b/gi, 'Sabzi Mandi')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferDelhiLocality(facilityName) {
  const name = correctCommonSourceTypos(facilityName);
  const locality = name
    .replace(/^(?:CGHS\s+Wellness\s+Centre,?\s*|Delhi\s+Government\s+Dispensary,?\s*|Aam\s+Aadmi\s+Mohalla\s+Clinic,?\s*|Maternal\s+and\s+Child\s+Welfare\s+Centre,?\s*|Maternity\s+Home,?\s*|Delhi\s+Government\s+Polyclinic,?\s*|CGHS\s+(?:Dispensary\s+)?|DGD\s+|AAMC\s+|MCW\s+|MH\s+|Polyclinic\s+|SPUHC\s+|ESI\s+(?:Dispensary\s+)?|PHC\s+|CHC\s+)/i, '')
    .replace(/^[-,:\s]+|[-,:\s]+$/g, '')
    .trim();
  return locality && locality !== name ? locality : null;
}

export function normalizeDelhiFacilityName(name, hospitalType, agency) {
  const corrected = correctCommonSourceTypos(name);
  const type = String(hospitalType || '').toLowerCase();

  if (/^CGHS\s+Wellness\s+Centre(?:,|\b)/i.test(corrected)) return corrected;

  if (/^DGD\s+/i.test(corrected)) {
    return corrected.replace(/^DGD\s+/i, 'Delhi Government Dispensary, ');
  }
  if (/^AAMC\s+/i.test(corrected)) {
    return corrected.replace(/^AAMC\s+/i, 'Aam Aadmi Mohalla Clinic, ');
  }
  if (/^MCW\s+/i.test(corrected)) {
    return corrected.replace(/^MCW\s+/i, 'Maternal and Child Welfare Centre, ');
  }
  if (/^MH\s+/i.test(corrected)) {
    return corrected.replace(/^MH\s+/i, 'Maternity Home, ');
  }
  if (/^CGHS\s+/i.test(corrected) && type.includes('primary health')) {
    return corrected.replace(/^CGHS\s+(?:Dispensary\s+)?/i, 'CGHS Wellness Centre, ');
  }
  if (/^Polyclinic\s+/i.test(corrected) && /delhi govt/i.test(String(agency || ''))) {
    return corrected.replace(/^Polyclinic\s+/i, 'Delhi Government Polyclinic, ');
  }

  return corrected;
}

export function extractIndianPincode(value) {
  return String(value || '').match(/\b[1-9][0-9]{5}\b/)?.[0] || null;
}

const facilityDescriptorPattern = /(?:\bhospital\b|\bmedical\b|\binstitute\b|\bcollege\b|\bclinic\b|\bdispensar(?:y|ies)\b|\bwellness\b|\bhealth\s+cent(?:re|er)\b|\bsub[-\s]*cent(?:re|er)\b|\bpolyclinic\b|\bmaternity\b|\bPHC\b|\bP\.?H\.?C\.?\b|\bUPHC\b|\bU-PHC\b|\bCHC\b|\bC\.?H\.?C\.?\b|\bHSC\b|\bSHC\b|\bS\.?H\.?C\.?\b|\bS\.?C\.?\b|\bDGD\b|\bAAMC\b|\bMCW\b|\bCGHS\b|\bSPUHC\b|\bUHC\b|\bPUHC\b|\bESI\b)/i;

export function ensureGovernmentFacilityTypeName(name, hospitalType) {
  const cleanedName = correctCommonSourceTypos(name);
  if (!cleanedName || facilityDescriptorPattern.test(cleanedName)) return cleanedName;

  const type = String(hospitalType || '').trim();
  if (![
    'Health Sub-Centre',
    'Primary Health Centre',
    'Community Health Centre',
    'District Hospital',
    'State Hospital'
  ].includes(type)) return cleanedName;

  return `${type}, ${cleanedName}`;
}

export function normalizeDelhiDirectoryRecord(record) {
  const agency = isDelhiAgencyLabel(record.city)
    ? record.city
    : (isDelhiAgencyLabel(record.area) ? record.area : null);
  const district = normalizeDelhiDistrict(record.district);
  const locality = inferDelhiLocality(record.name);
  const existingAddress = clean(record.address);
  const hasAgencyAddress = existingAddress && existingAddress
    .split(',')
    .some((part, index) => index < 2 && isDelhiAgencyLabel(part));
  const address = !existingAddress || hasAgencyAddress
    ? [locality, district, 'Delhi'].filter(Boolean).join(', ')
    : existingAddress;

  return {
    name: normalizeDelhiFacilityName(record.name, record.hospital_type, agency),
    address,
    city: 'Delhi',
    district,
    state: 'Delhi',
    area: locality || district,
    pincode: clean(record.pincode) || extractIndianPincode(address),
    facilities: [clean(record.facilities), agency ? `Agency: ${agency}` : null]
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(', ') || null
  };
}
