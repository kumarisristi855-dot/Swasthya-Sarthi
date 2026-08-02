export const outbreakSourceCatalog = {
  name: 'Government of India Integrated Disease Surveillance Programme (IDSP)',
  url: 'https://www.idsp.mohfw.gov.in/index4.php?lang=1&level=0&lid=3689&linkid=406',
  checkedAt: '2026-07-29T00:00:00.000Z',
  freshnessPolicy: 'Notices are hidden after their Swasthya Sarthi review date unless the official source is rechecked.'
};

export const publicHealthNotices = [
  {
    id: 'ncdc-nipah-kerala-2026-07',
    disease: 'Nipah Virus Disease',
    headline: 'Localized Nipah health notice',
    summary: 'NCDC reports a localized occurrence limited to Kozhikode and Malappuram districts. The official notice says this is not a major outbreak.',
    guidance: 'Follow local health authority advice and open the official notice for current guidance.',
    status: 'Local occurrence under monitoring',
    severity: 'caution',
    issuedAt: '2026-07-22T00:00:00.000Z',
    reviewAfter: '2026-08-22T23:59:59.999Z',
    sourceName: 'National Centre for Disease Control, Ministry of Health and Family Welfare',
    sourceUrl: 'https://ncdc.mohfw.gov.in/includes/Health_Information/healthcare.php',
    areas: [
      {
        state: 'Kerala',
        district: 'Kozhikode',
        aliases: ['Calicut'],
        latitude: 11.2588,
        longitude: 75.7804,
        radiusKm: 70
      },
      {
        state: 'Kerala',
        district: 'Malappuram',
        latitude: 11.0732,
        longitude: 76.0740,
        radiusKm: 70
      }
    ]
  }
];
