import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from './locales/en/common.json';
import enNav from './locales/en/nav.json';
import enAuth from './locales/en/auth.json';
import enPatientDashboard from './locales/en/patient-dashboard.json';
import enSymptomChecker from './locales/en/symptom-checker.json';
import enBooking from './locales/en/booking.json';
import enDoctorPortal from './locales/en/doctor-portal.json';
import enHospitalAdmin from './locales/en/hospital-admin.json';

import hiCommon from './locales/hi/common.json';
import hiNav from './locales/hi/nav.json';
import hiAuth from './locales/hi/auth.json';
import hiPatientDashboard from './locales/hi/patient-dashboard.json';
import hiSymptomChecker from './locales/hi/symptom-checker.json';
import hiBooking from './locales/hi/booking.json';
import hiDoctorPortal from './locales/hi/doctor-portal.json';
import hiHospitalAdmin from './locales/hi/hospital-admin.json';

import bnCommon from './locales/bn/common.json';
import bnNav from './locales/bn/nav.json';
import bnAuth from './locales/bn/auth.json';
import bnPatientDashboard from './locales/bn/patient-dashboard.json';
import bnSymptomChecker from './locales/bn/symptom-checker.json';
import bnBooking from './locales/bn/booking.json';
import bnDoctorPortal from './locales/bn/doctor-portal.json';
import bnHospitalAdmin from './locales/bn/hospital-admin.json';

import taCommon from './locales/ta/common.json';
import taNav from './locales/ta/nav.json';
import taAuth from './locales/ta/auth.json';
import taPatientDashboard from './locales/ta/patient-dashboard.json';
import taSymptomChecker from './locales/ta/symptom-checker.json';
import taBooking from './locales/ta/booking.json';
import taDoctorPortal from './locales/ta/doctor-portal.json';
import taHospitalAdmin from './locales/ta/hospital-admin.json';

import teCommon from './locales/te/common.json';
import teNav from './locales/te/nav.json';
import teAuth from './locales/te/auth.json';
import tePatientDashboard from './locales/te/patient-dashboard.json';
import teSymptomChecker from './locales/te/symptom-checker.json';
import teBooking from './locales/te/booking.json';
import teDoctorPortal from './locales/te/doctor-portal.json';
import teHospitalAdmin from './locales/te/hospital-admin.json';

import knCommon from './locales/kn/common.json';
import knNav from './locales/kn/nav.json';
import knAuth from './locales/kn/auth.json';
import knPatientDashboard from './locales/kn/patient-dashboard.json';
import knSymptomChecker from './locales/kn/symptom-checker.json';
import knBooking from './locales/kn/booking.json';
import knDoctorPortal from './locales/kn/doctor-portal.json';
import knHospitalAdmin from './locales/kn/hospital-admin.json';

export const supportedLocales = [
  { code: 'en', label: 'English', nativeLabel: 'English', font: null },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', font: 'Noto Sans Devanagari' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা', font: 'Noto Sans Bengali' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்', font: 'Noto Sans Tamil' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు', font: 'Noto Sans Telugu' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ', font: 'Noto Sans Kannada' },
];

export const defaultLocale = 'en';
export const localeStorageKey = 'swasthya-sarthi-language';

export const namespaces = [
  'common',
  'nav',
  'auth',
  'patient-dashboard',
  'symptom-checker',
  'booking',
  'doctor-portal',
  'hospital-admin',
];

const resources = {
  en: {
    common: enCommon,
    nav: enNav,
    auth: enAuth,
    'patient-dashboard': enPatientDashboard,
    'symptom-checker': enSymptomChecker,
    booking: enBooking,
    'doctor-portal': enDoctorPortal,
    'hospital-admin': enHospitalAdmin,
  },
  hi: {
    common: hiCommon,
    nav: hiNav,
    auth: hiAuth,
    'patient-dashboard': hiPatientDashboard,
    'symptom-checker': hiSymptomChecker,
    booking: hiBooking,
    'doctor-portal': hiDoctorPortal,
    'hospital-admin': hiHospitalAdmin,
  },
  bn: {
    common: bnCommon,
    nav: bnNav,
    auth: bnAuth,
    'patient-dashboard': bnPatientDashboard,
    'symptom-checker': bnSymptomChecker,
    booking: bnBooking,
    'doctor-portal': bnDoctorPortal,
    'hospital-admin': bnHospitalAdmin,
  },
  ta: {
    common: taCommon,
    nav: taNav,
    auth: taAuth,
    'patient-dashboard': taPatientDashboard,
    'symptom-checker': taSymptomChecker,
    booking: taBooking,
    'doctor-portal': taDoctorPortal,
    'hospital-admin': taHospitalAdmin,
  },
  te: {
    common: teCommon,
    nav: teNav,
    auth: teAuth,
    'patient-dashboard': tePatientDashboard,
    'symptom-checker': teSymptomChecker,
    booking: teBooking,
    'doctor-portal': teDoctorPortal,
    'hospital-admin': teHospitalAdmin,
  },
  kn: {
    common: knCommon,
    nav: knNav,
    auth: knAuth,
    'patient-dashboard': knPatientDashboard,
    'symptom-checker': knSymptomChecker,
    booking: knBooking,
    'doctor-portal': knDoctorPortal,
    'hospital-admin': knHospitalAdmin,
  },
};

function normalizeLocale(value) {
  const base = String(value || '').toLowerCase().split('-')[0];
  return supportedLocales.some(locale => locale.code === base) ? base : null;
}

export function detectInitialLocale() {
  if (typeof window === 'undefined') return defaultLocale;
  const queryLocale = normalizeLocale(new URLSearchParams(window.location.search).get('lang'));
  if (queryLocale) return queryLocale;
  const storedLocale = normalizeLocale(window.localStorage.getItem(localeStorageKey));
  if (storedLocale) return storedLocale;

  const browserLocales = navigator.languages?.length ? navigator.languages : [navigator.language];
  return browserLocales.map(normalizeLocale).find(Boolean) || defaultLocale;
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: detectInitialLocale(),
    fallbackLng: defaultLocale,
    supportedLngs: supportedLocales.map(locale => locale.code),
    ns: namespaces,
    defaultNS: 'common',
    fallbackNS: 'common',
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });

export default i18n;
