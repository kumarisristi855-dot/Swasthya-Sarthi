import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarCheck2,
  Cross,
  ExternalLink,
  Filter,
  FlaskConical,
  HeartPulse,
  Loader2,
  LocateFixed,
  MapPin,
  Menu,
  Navigation,
  PhoneCall,
  Search,
  SearchX,
  ArrowUpDown,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  User,
  X,
} from 'lucide-react';
import heroImage from '../assets/swasthya-sarthi-clinic-hero.jpg';
import consultationImage from '../assets/care-consultation.jpg';
import { DoctorRatingSummary, HospitalRatingSummary } from '../shared/HospitalRating';
import HospitalOperatingHours from '../shared/HospitalOperatingHours';
import { CardSkeleton } from '../shared/ui/Skeleton';
import { enrichHospitalsWithGoogleRatings } from '../lib/googleHospitalRatings';
import diagnosticsImage from '../assets/care-diagnostics.jpg';
import { API_URL } from '../lib/api';
import { trackInteraction } from '../lib/analytics';
import LanguageSwitcher from '../i18n/LanguageSwitcher';
import { useTranslation } from 'react-i18next';

const LOCATION_SESSION_KEY = 'swasthya-sarthi-public-location';
const publicNavItems = [
  { id: 'search-results', labelKey: 'findDoctors' },
  { id: 'facilities', labelKey: 'hospitals' },
  { id: 'services', labelKey: 'services' },
  { id: 'health-guides', labelKey: 'healthGuides' },
  { id: 'trust', labelKey: 'howItWorks' },
];
const DEFAULT_PUBLIC_LOCATION = 'Chas, Bokaro, Jharkhand';
const searchModeOrder = ['all', 'doctors', 'hospitals', 'symptoms'];
const LocationMapPicker = lazy(() => import('../shared/LocationMapPicker'));

function loadLocationSelection() {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(LOCATION_SESSION_KEY));
    if (!saved?.location || !saved?.locationLabel || !saved?.locationStatus) return null;

    const coordinates = saved.coordinates &&
      Number.isFinite(saved.coordinates.latitude) &&
      Number.isFinite(saved.coordinates.longitude)
      ? saved.coordinates
      : null;

    return {
      location: String(saved.location),
      locationLabel: String(saved.locationLabel),
      locationStatus: String(saved.locationStatus),
      locationAccuracy: Number.isFinite(saved.locationAccuracy) ? saved.locationAccuracy : null,
      coordinates,
    };
  } catch {
    return null;
  }
}

const symptomSpecialties = [
  { terms: ['fever', 'cold', 'cough', 'weakness', 'infection', 'malaria', 'dengue', 'viral'], specialty: 'General Physician' },
  { terms: ['chest', 'heart', 'palpitation', 'blood pressure'], specialty: 'Cardiologist' },
  { terms: ['skin', 'rash', 'acne', 'itch'], specialty: 'Dermatologist' },
  { terms: ['child', 'baby', 'infant', 'pediatric'], specialty: 'Pediatrician' },
  { terms: ['bone', 'joint', 'back pain', 'fracture'], specialty: 'Orthopedic' },
  { terms: ['ear', 'nose', 'throat', 'sinus'], specialty: 'ENT Specialist' },
  { terms: ['stomach', 'digestion', 'acidity', 'abdominal'], specialty: 'Gastroenterologist' },
  { terms: ['breathing', 'asthma', 'lungs'], specialty: 'Pulmonologist' },
  { terms: ['headache', 'migraine', 'seizure', 'nerve'], specialty: 'Neurologist' },
];

const quickServices = [
  { titleKey: 'quickServices.findDoctor.title', copyKey: 'quickServices.findDoctor.copy', icon: Stethoscope, mode: 'doctors' },
  { titleKey: 'quickServices.findHospitals.title', copyKey: 'quickServices.findHospitals.copy', icon: Building2, mode: 'hospitals' },
  { titleKey: 'quickServices.symptomGuidance.title', copyKey: 'quickServices.symptomGuidance.copy', icon: Sparkles, mode: 'symptoms' },
  { titleKey: 'quickServices.clinicVisit.title', copyKey: 'quickServices.clinicVisit.copy', icon: CalendarCheck2, mode: 'doctors' },
  { titleKey: 'quickServices.diagnostics.title', copyKey: 'quickServices.diagnostics.copy', icon: FlaskConical, mode: 'hospitals' },
  { titleKey: 'quickServices.emergency.title', copyKey: 'quickServices.emergency.copy', icon: HeartPulse, href: '#emergency' },
];

const guides = [
  {
    tagKey: 'guides.seasonal.tag',
    titleKey: 'guides.seasonal.title',
    copyKey: 'guides.seasonal.copy',
  },
  {
    tagKey: 'guides.heart.tag',
    titleKey: 'guides.heart.title',
    copyKey: 'guides.heart.copy',
  },
  {
    tagKey: 'guides.family.tag',
    titleKey: 'guides.family.title',
    copyKey: 'guides.family.copy',
  },
];

function formatTomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function findSpecialization(query, specializations) {
  const normalized = query.trim().toLowerCase();
  const direct = specializations.find(item => normalized.includes(item.name.toLowerCase()));
  if (direct) return direct;
  const symptomMatch = symptomSpecialties.find(item => item.terms.some(term => normalized.includes(term)));
  return symptomMatch
    ? specializations.find(item => item.name.toLowerCase() === symptomMatch.specialty.toLowerCase())
    : null;
}

function formatSlot(slot) {
  const value = typeof slot === 'string' ? slot : slot?.time;
  if (!value) return null;
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function normalizeLocationInput(value) {
  return String(value || '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeHospitalResults(officialHospitals = [], communityHospitals = []) {
  const normalize = value => String(value || '')
    .toLowerCase()
    .replace(/\b(?:hospital|clinic|nursing|home|healthcare|centre|center)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');
  const merged = new Map();

  [...officialHospitals, ...communityHospitals].forEach(hospital => {
    if (!hospital?.name) return;
    const key = [
      normalize(hospital.name),
      normalize(hospital.city || hospital.district),
      normalize(hospital.state),
      normalize(hospital.pincode)
    ].join('|');

    if (!merged.has(key)) {
      merged.set(key, hospital);
      return;
    }

    const existing = merged.get(key);
    if (existing.verificationStatus !== 'verified' && hospital.verificationStatus === 'verified') {
      merged.set(key, hospital);
    }
  });

  return [...merged.values()];
}

function PublicLogo({ light = false }) {
  return (
    <Link to="/" className="inline-flex items-center gap-3" aria-label="Swasthya Sarthi home">
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${light ? 'bg-care-surface text-care-heading' : 'bg-care-primary text-care-surface'}`}>
        <span className="relative h-6 w-6" aria-hidden="true">
          <Activity className="care-logo-pulse-base absolute inset-0 h-6 w-6" strokeWidth={2.5} />
          <Activity className="care-logo-pulse-scan absolute inset-0 h-6 w-6" strokeWidth={2.5} />
        </span>
      </span>
      <span className={`care-logo-word-shine ${light ? 'care-logo-word-shine-light text-care-surface' : 'text-care-heading'} text-xl font-bold`}>Swasthya Sarthi</span>
    </Link>
  );
}

function ResultBadge({ children, tone = 'teal' }) {
  const classes = tone === 'blue'
    ? 'border-care-border bg-care-primary-subtle text-care-primary-hover'
    : tone === 'amber'
      ? 'border-care-warning bg-care-surface text-care-warning'
      : 'border-care-primary bg-care-primary-subtle text-care-primary-hover';
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${classes}`}>{children}</span>;
}

function hospitalDoctorCount(hospital) {
  const doctorKeys = [
    ...(hospital.bookableDoctors || []),
    ...(hospital.doctors || [])
  ].map(doctor => doctor.id || doctor.fullName).filter(Boolean);
  const rosterCount = new Set(doctorKeys).size;
  if (rosterCount > 0) return rosterCount;
  return Number.isFinite(Number(hospital.doctorCount)) ? Number(hospital.doctorCount) : 0;
}

function formatFacilityType(type, t) {
  const normalized = String(type || '').trim().toLowerCase();
  const knownTypes = {
    hospital: 'hospital',
    'healthcare facility': 'healthcareFacility',
    clinic: 'clinic',
    'nursing home': 'nursingHome',
    'diagnostic centre': 'diagnosticCentre',
    'diagnostic center': 'diagnosticCentre',
    'primary health centre': 'primaryHealthCentre',
    'primary health center': 'primaryHealthCentre',
    'health sub-centre': 'healthSubCentre',
    'health sub-center': 'healthSubCentre',
    'community health centre': 'communityHealthCentre',
    'community health center': 'communityHealthCentre',
  };
  return knownTypes[normalized]
    ? t(`landing:facilityTypes.${knownTypes[normalized]}`)
    : type || t('landing:facilityTypes.healthcareFacility');
}

function hasPublishedOperatingHours(hospital) {
  return hospital.operatingHours?.status === 'published' && Boolean(
    hospital.operatingHours?.text ||
    hospital.operatingHours?.label ||
    Object.values(hospital.operatingHours?.weekly || {}).some(Boolean)
  );
}

function hasPublishedGoogleRating(hospital) {
  return Number(hospital.googleRating?.rating) > 0 && Number(hospital.googleRating?.ratingCount) > 0;
}

function facilityDirectionsUrl(hospital) {
  if (hospital.googleRating?.googleMapsUrl) return hospital.googleRating.googleMapsUrl;
  if (!Number.isFinite(Number(hospital.latitude)) || !Number.isFinite(Number(hospital.longitude))) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${hospital.latitude},${hospital.longitude}`)}`;
}

function formatUpdatedDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function FacilityVerificationBadge({ hospital }) {
  const { t } = useTranslation(['landing']);
  const status = hospital.verificationStatus;
  const key = status === 'verified'
    ? 'providerVerified'
    : status === 'community-mapped'
      ? 'communityMapped'
      : status === 'pending'
        ? 'verificationPending'
        : 'publicSourceVerified';
  const explanation = t(`landing:facilityCard.${key}Explanation`);

  return (
    <span
      className="inline-flex min-h-7 items-center gap-1.5 rounded-md border border-care-border bg-care-neutral px-2 py-1 text-xs font-semibold text-care-body"
      title={explanation}
      aria-label={`${t(`landing:facilityCard.${key}`)}. ${explanation}`}
    >
      <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-care-primary-hover" aria-hidden="true" />
      {t(`landing:facilityCard.${key}`)}
    </span>
  );
}

function PublicDoctorCard({ doctor, directoryOnly = false }) {
  const { t } = useTranslation(['landing']);
  const hospital = doctor.hospital || doctor.hospitals?.[0] || null;
  const distance = doctor.distance ?? hospital?.distance;
  const availableSlots = (doctor.nextAvailableSlots || []).filter(Boolean);
  const languages = Array.isArray(doctor.languages) ? doctor.languages.filter(Boolean) : [];
  const hasRating = Number(doctor.ratingAvg) > 0 && Number(doctor.ratingCount) > 0;
  const updatedDate = formatUpdatedDate(doctor.verifiedAt || doctor.updatedAt);

  return (
    <article className="care-hover flex flex-col rounded-lg border border-care-border bg-care-surface p-5 shadow-sm focus-within:ring-2 focus-within:ring-care-primary">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-care-primary-subtle text-care-primary-hover"><Stethoscope className="h-6 w-6" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h4 className="font-bold text-care-heading">{doctor.fullName}</h4>
          {doctor.credentials && <p className="mt-1 text-xs font-semibold text-care-body">{doctor.credentials}</p>}
          {doctor.specialization && <p className="mt-1 text-sm font-semibold text-care-primary-hover">{doctor.specialization}</p>}
          {hospital?.name && <p className="mt-1 line-clamp-2 text-xs leading-5 text-care-muted">{hospital.name}</p>}
          {hasRating && <DoctorRatingSummary ratingAvg={doctor.ratingAvg} ratingCount={doctor.ratingCount} className="mt-2" />}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!directoryOnly && <ResultBadge><BadgeCheck className="h-3 w-3" aria-hidden="true" /> {t('landing:directory.activeProvider')}</ResultBadge>}
        {distance != null && <ResultBadge tone="blue">{Number(distance).toFixed(1)} km</ResultBadge>}
        {hospital && <ResultBadge tone="blue">{t('landing:doctorCard.inPerson')}</ResultBadge>}
        {Number(doctor.consultationFee) > 0 && <ResultBadge tone="amber">INR {Number(doctor.consultationFee).toLocaleString('en-IN')}</ResultBadge>}
        {Number(doctor.yearsExperience) > 0 && <ResultBadge tone="blue">{t('landing:doctorCard.experience', { count: doctor.yearsExperience })}</ResultBadge>}
      </div>

      {languages.length > 0 && (
        <p className="mt-4 text-xs text-care-muted">{t('landing:doctorCard.languages', { languages: languages.join(', ') })}</p>
      )}

      {availableSlots.length > 0 && (
        <div className="mt-5 border-t border-care-border pt-4">
          <span className="text-xs font-bold text-care-muted">{t('landing:directory.nextAvailable')}</span>
          <p className="mt-2 text-sm font-semibold text-care-primary-hover">{t('landing:directory.tomorrowSlot', { slot: formatSlot(availableSlots[0]) })}</p>
        </div>
      )}

      {directoryOnly && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ResultBadge><BadgeCheck className="h-3 w-3" aria-hidden="true" /> {t('landing:directory.source', { source: doctor.sourceName || t('landing:directory.verifiedDirectory') })}</ResultBadge>
          {updatedDate && <span className="text-xs text-care-muted">{t('landing:facilityCard.updated', { date: updatedDate })}</span>}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <Link to={`/doctor/${doctor.id}`} onClick={() => trackInteraction('doctor_result_opened', { listingType: directoryOnly ? 'public_directory' : 'bookable' })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-care-primary px-4 text-sm font-semibold text-white hover:bg-care-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary focus-visible:ring-offset-2">
          {t('landing:directory.viewProfile')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        {!directoryOnly && (
          <Link to={`/doctor/${doctor.id}#availability`} onClick={() => trackInteraction('appointment_availability_checked', { listingType: 'doctor' })} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-care-border px-4 text-sm font-semibold text-care-heading hover:bg-care-primary-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary">
            <CalendarCheck2 className="h-4 w-4" aria-hidden="true" /> {t('landing:doctorCard.checkAvailability')}
          </Link>
        )}
      </div>
    </article>
  );
}

function DirectoryEmptyState({ icon: Icon, title, copy, actions = [] }) {
  return (
    <div className="rounded-lg border border-dashed border-care-border bg-care-surface px-5 py-10 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-care-primary-subtle text-care-primary-hover">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h4 className="mt-4 text-base font-bold text-care-heading">{title}</h4>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-care-muted">{copy}</p>
      {actions.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {actions.map((action, index) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                trackInteraction('empty_state_recovery_clicked', { recoveryAction: action.eventName || 'recovery' });
                action.onClick();
              }}
              className={`inline-flex min-h-10 items-center justify-center rounded-md px-4 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary focus-visible:ring-offset-2 ${index === 0 ? 'bg-care-primary text-white hover:bg-care-primary-hover' : 'border border-care-border text-care-heading hover:bg-care-primary-subtle'}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LandingPage() {
  const { t } = useTranslation(['common', 'nav', 'landing']);
  const initialLocationRef = useRef(loadLocationSelection());
  const initialLocation = initialLocationRef.current;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [activeNavSection, setActiveNavSection] = useState(publicNavItems[0].id);
  const [searchMode, setSearchMode] = useState('all');
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState(initialLocation?.location || DEFAULT_PUBLIC_LOCATION);
  const [coordinates, setCoordinates] = useState(initialLocation?.coordinates || null);
  const [locationLabel, setLocationLabel] = useState(initialLocation?.locationLabel || DEFAULT_PUBLIC_LOCATION);
  const [locationStatus, setLocationStatus] = useState(initialLocation?.locationStatus || 'prompt');
  const [locationAccuracy, setLocationAccuracy] = useState(initialLocation?.locationAccuracy || null);
  const [locationPromptOpen, setLocationPromptOpen] = useState(!initialLocation);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [mapPickerPosition, setMapPickerPosition] = useState([28.6139, 77.2090]);
  const [mapPickerLoading, setMapPickerLoading] = useState(false);
  const [specializations, setSpecializations] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [showAllHospitals, setShowAllHospitals] = useState(false);
  const [facilityFilter, setFacilityFilter] = useState('all');
  const [facilitySort, setFacilitySort] = useState('name');
  const [doctors, setDoctors] = useState([]);
  const [directoryDoctors, setDirectoryDoctors] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [locationSuggestionOpen, setLocationSuggestionOpen] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchSummary, setSearchSummary] = useState(t('landing:directory.headingAround', { location: t('landing:location.india') }));
  const [verificationDetailsOpen, setVerificationDetailsOpen] = useState(false);
  const locationInputRef = useRef(null);
  const locationPromptRef = useRef(null);
  const mapDialogRef = useRef(null);
  const mobileMenuRef = useRef(null);
  const mobileMenuButtonRef = useRef(null);
  const searchTabRefs = useRef({});
  const tomorrow = useMemo(formatTomorrow, []);

  useEffect(() => {
    const updateHeader = () => setHeaderScrolled(window.scrollY > 16);
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
    return () => window.removeEventListener('scroll', updateHeader);
  }, []);

  useEffect(() => {
    const updateActiveSection = () => {
      const visibleSection = publicNavItems
        .map(item => {
          const element = document.getElementById(item.id);
          if (!element) return null;
          return { id: item.id, top: Math.abs(element.getBoundingClientRect().top - 96) };
        })
        .filter(Boolean)
        .sort((a, b) => a.top - b.top)[0];

      if (visibleSection) setActiveNavSection(visibleSection.id);
    };

    updateActiveSection();
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('hashchange', updateActiveSection);
    return () => {
      window.removeEventListener('scroll', updateActiveSection);
      window.removeEventListener('hashchange', updateActiveSection);
    };
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const menu = mobileMenuRef.current;
    const focusableSelector = 'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = menu ? [...menu.querySelectorAll(focusableSelector)] : [];
    focusableElements[0]?.focus();

    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
        mobileMenuButtonRef.current?.focus();
        return;
      }

      if (event.key !== 'Tab' || focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    const dialog = mapPickerOpen ? mapDialogRef.current : locationPromptOpen ? locationPromptRef.current : null;
    if (!dialog) return undefined;

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = [...dialog.querySelectorAll(focusableSelector)];
    focusableElements[0]?.focus();
    document.body.style.overflow = 'hidden';

    const handleDialogKeyDown = event => {
      if (event.key === 'Escape') {
        if (mapPickerOpen) setMapPickerOpen(false);
        else setLocationPromptOpen(false);
        return;
      }
      if (event.key !== 'Tab' || focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleDialogKeyDown);
    return () => {
      document.removeEventListener('keydown', handleDialogKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [locationPromptOpen, mapPickerOpen]);

  useEffect(() => {
    const elements = [...document.querySelectorAll('.care-reveal')];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      elements.forEach(element => element.classList.add('care-reveal-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('care-reveal-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px' });

    elements.forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!['granted', 'approximate', 'manual', 'manual-list', 'pinned'].includes(locationStatus) || !location) {
      return;
    }

    window.sessionStorage.setItem(LOCATION_SESSION_KEY, JSON.stringify({
      location,
      locationLabel,
      locationStatus,
      locationAccuracy,
      coordinates,
    }));
  }, [coordinates, location, locationAccuracy, locationLabel, locationStatus]);

  const runSearch = useCallback(async ({
    requestedMode = searchMode,
    requestedQuery = query,
    requestedLocation = location,
    requestedCoordinates = coordinates,
  } = {}) => {
    setSearching(true);
    setSearchError('');
    setShowAllHospitals(false);

    try {
      const doctorSpecialty = findSpecialization(requestedQuery, specializations);
      const hospitalParams = new URLSearchParams({ limit: '80' });
      const doctorParams = new URLSearchParams();
      const directoryParams = new URLSearchParams();
      const alertParams = new URLSearchParams();

      if (requestedCoordinates) {
        hospitalParams.set('lat', String(requestedCoordinates.latitude));
        hospitalParams.set('lng', String(requestedCoordinates.longitude));
        doctorParams.set('lat', String(requestedCoordinates.latitude));
        doctorParams.set('lng', String(requestedCoordinates.longitude));
        directoryParams.set('lat', String(requestedCoordinates.latitude));
        directoryParams.set('lng', String(requestedCoordinates.longitude));
        doctorParams.set('radius', '150');
        directoryParams.set('radius', '150');
        alertParams.set('lat', String(requestedCoordinates.latitude));
        alertParams.set('lng', String(requestedCoordinates.longitude));
      } else if (requestedLocation.trim()) {
        hospitalParams.set('place', requestedLocation.trim());
        doctorParams.set('place', requestedLocation.trim());
        directoryParams.set('place', requestedLocation.trim());
        alertParams.set('district', requestedLocation.trim());
        alertParams.set('place', requestedLocation.trim());
      }

      if (
        requestedQuery.trim() &&
        !doctorSpecialty &&
        requestedMode !== 'doctors' &&
        requestedMode !== 'symptoms'
      ) {
        hospitalParams.set('q', requestedQuery.trim());
      }
      if (doctorSpecialty) {
        doctorParams.set('specializationId', String(doctorSpecialty.id));
        directoryParams.set('specializationId', String(doctorSpecialty.id));
      } else if (requestedQuery.trim()) {
        directoryParams.set('q', requestedQuery.trim());
      }

      const shouldLoadHospitals = ['all', 'hospitals', 'symptoms'].includes(requestedMode);
      const shouldLoadDoctors = ['all', 'doctors', 'symptoms'].includes(requestedMode);
      const requests = [];
      requests.push(
        fetch(`${API_URL}/outbreaks/nearby?${alertParams}`)
          .then(response => response.json())
          .then(data => setAlerts(data.alerts || []))
          .catch(() => setAlerts([]))
      );

      if (shouldLoadHospitals) {
        requests.push(
          Promise.allSettled([
            fetch(`${API_URL}/hospitals/india?${hospitalParams}`)
              .then(response => response.json().then(data => ({ response, data }))),
            (() => {
              const communityParams = new URLSearchParams(hospitalParams);
              communityParams.set('limit', '60');
              if (requestedLocation.trim()) {
                communityParams.set('location', requestedLocation.trim());
              }
              return fetch(`${API_URL}/hospitals/community?${communityParams}`)
                .then(response => response.json().then(data => ({ response, data })));
            })(),
          ]).then(results => {
            const officialResult = results[0].status === 'fulfilled' ? results[0].value : null;
            const communityResult = results[1].status === 'fulfilled' ? results[1].value : null;
            const officialHospitals = officialResult?.response?.ok
              ? (officialResult.data.hospitals || [])
              : [];
            const communityHospitals = communityResult?.response?.ok
              ? (communityResult.data.hospitals || communityResult.data.facilities || [])
              : [];

            if (!officialHospitals.length && !communityHospitals.length && officialResult && !officialResult.response.ok) {
              throw new Error(officialResult.data.error?.message || t('landing:directory.loadFacilitiesError'));
            }

            const mergedHospitals = mergeHospitalResults(officialHospitals, communityHospitals).slice(0, 80);
            setHospitals(mergedHospitals);
            enrichHospitalsWithGoogleRatings(mergedHospitals)
              .then(setHospitals)
              .catch(() => {
                // The verified directory remains usable when Google Places is unavailable.
              });
            })
        );
      } else {
        setHospitals([]);
      }

      if (shouldLoadDoctors) {
        setDirectoryDoctors([]);
        const availableParams = new URLSearchParams(doctorParams);
        availableParams.set('date', tomorrow);
        requests.push(
          Promise.all([
            fetch(`${API_URL}/doctors/search?${availableParams}`).then(response => response.json()),
            fetch(`${API_URL}/doctors/search?${doctorParams}`).then(response => response.json()),
          ]).then(([availableData, doctorData]) => {
            const available = availableData.doctors || [];
            const general = doctorData.doctors || [];
            const merged = [...available, ...general].filter(
              (doctor, index, list) => list.findIndex(item => item.id === doctor.id) === index
            );
            setDoctors(merged.slice(0, 8));
          })
        );
        fetch(`${API_URL}/directory/doctors?${directoryParams}`)
          .then(response => response.json())
          .then(data => setDirectoryDoctors((data.doctors || []).slice(0, 6)))
          .catch(() => setDirectoryDoctors([]));
      } else {
        setDoctors([]);
        setDirectoryDoctors([]);
      }

      await Promise.all(requests);
      const matchedSpecialty = doctorSpecialty ? ` · ${doctorSpecialty.name}` : '';
      const summaryLocation = requestedLocation || (requestedCoordinates ? t('landing:search.currentLocation', { defaultValue: 'your current location' }) : t('landing:location.india'));
      setSearchSummary(`${t(requestedCoordinates ? 'landing:directory.headingNear' : 'landing:directory.headingAround', { location: summaryLocation })}${matchedSpecialty}`);
    } catch (error) {
      console.error('Public directory search failed', error);
      setSearchError(t('landing:directory.searchUnavailable'));
    } finally {
      setSearching(false);
    }
  }, [coordinates, location, query, searchMode, specializations, t, tomorrow]);

  useEffect(() => {
    fetch(`${API_URL}/specializations`)
      .then(response => response.json())
      .then(data => setSpecializations(data.specializations || []))
      .catch(() => setSpecializations([]));
  }, []);

  useEffect(() => {
    if (specializations.length) {
      runSearch({
        requestedMode: 'all',
        requestedQuery: '',
        requestedLocation: initialLocation?.location || DEFAULT_PUBLIC_LOCATION,
        requestedCoordinates: initialLocation?.coordinates || null,
      });
    }
  // Load a useful fallback while the user chooses live or manual location.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specializations.length]);

  useEffect(() => {
    const typedLocation = normalizeLocationInput(location);
    if (typedLocation.length < 2) {
      setLocationSuggestions([]);
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      const mergeSuggestions = nextSuggestions => {
        setLocationSuggestions(currentSuggestions => {
          const byName = new Map();
          for (const suggestion of [...nextSuggestions, ...currentSuggestions]) {
            if (suggestion?.name && !byName.has(suggestion.name.toLowerCase())) {
              byName.set(suggestion.name.toLowerCase(), suggestion);
            }
          }
          return [...byName.values()].slice(0, 12);
        });
      };

      fetch(`${API_URL}/hospitals/locations?q=${encodeURIComponent(typedLocation)}`, {
        signal: controller.signal
      })
        .then(response => response.json().then(data => ({ response, data })))
        .then(({ response, data }) => {
          if (response.ok) mergeSuggestions(data.locations || []);
        })
        .catch(error => {
          if (error.name !== 'AbortError') setLocationSuggestions([]);
        });

      fetch(`${API_URL}/geolocation/suggest?q=${encodeURIComponent(typedLocation)}`, {
        signal: controller.signal
      })
        .then(response => response.json().then(data => ({ response, data })))
        .then(({ response, data }) => {
          if (response.ok) mergeSuggestions(data.suggestions || []);
        })
        .catch(() => {});
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [location]);

  const resolveManualLocation = async (rawLocation, preferredSuggestion = null) => {
    const typedLocation = normalizeLocationInput(rawLocation);
    if (!typedLocation) return null;
    const selectedSuggestion = preferredSuggestion || locationSuggestions.find(
      suggestion => suggestion.name.toLowerCase() === typedLocation.toLowerCase()
    );

    if (
      selectedSuggestion &&
      Number.isFinite(selectedSuggestion.latitude) &&
      Number.isFinite(selectedSuggestion.longitude)
    ) {
      return {
        label: selectedSuggestion.name,
        coordinates: {
          latitude: selectedSuggestion.latitude,
          longitude: selectedSuggestion.longitude
        }
      };
    }

    const geocodeParams = new URLSearchParams({ q: typedLocation });
    if (selectedSuggestion?.placeId) geocodeParams.set('placeId', selectedSuggestion.placeId);

    try {
      const response = await fetch(`${API_URL}/geolocation/search?${geocodeParams.toString()}`);
      const data = await response.json();
      if (response.ok && Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) {
        return {
          label: data.label || typedLocation,
          coordinates: {
            latitude: data.latitude,
            longitude: data.longitude
          }
        };
      }
    } catch {
      // Try the directory fallback below.
    }

    try {
      const response = await fetch(`${API_URL}/hospitals/locations?q=${encodeURIComponent(typedLocation)}`);
      const data = await response.json();
      const resolved = response.ok ? data.locations?.[0] : null;
      if (resolved && Number.isFinite(resolved.latitude) && Number.isFinite(resolved.longitude)) {
        return {
          label: resolved.name,
          coordinates: {
            latitude: resolved.latitude,
            longitude: resolved.longitude
          }
        };
      }
    } catch {
      // The directory can still use text-only search if no coordinate source works.
    }

    return {
      label: typedLocation,
      coordinates: null
    };
  };

  const applyManualLocation = async (rawLocation, preferredSuggestion = null) => {
    const resolved = await resolveManualLocation(rawLocation, preferredSuggestion);
    if (!resolved) return null;

    setCoordinates(resolved.coordinates);
    setLocation(resolved.label);
    setLocationLabel(resolved.label);
    setLocationStatus(resolved.coordinates ? 'manual' : 'manual-list');
    setLocationAccuracy(null);
    setLocationSuggestions([]);
    setLocationSuggestionOpen(false);
    return resolved;
  };

  const selectLocationSuggestion = async suggestion => {
    trackInteraction('location_selected', { locationMethod: 'suggestion' });
    setLocationLoading(true);
    setSearchError('');
    try {
      const resolved = await applyManualLocation(suggestion.name, suggestion);
      if (resolved) {
        await runSearch({
          requestedLocation: resolved.label,
          requestedCoordinates: resolved.coordinates
        });
        window.setTimeout(() => document.querySelector('#search-results')?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch (error) {
      console.error('Location selection failed', error);
      setSearchError(t('landing:search.manualLocationFailed'));
    } finally {
      setLocationLoading(false);
    }
  };

  const handleSearch = async event => {
    event.preventDefault();
    let requestedCoordinates = coordinates;
    let requestedLocation = normalizeLocationInput(location);

    if (!requestedLocation && !requestedCoordinates) {
      setSearchError(t('landing:search.locationRequired'));
      setLocationLabel(t('landing:search.enterExactArea'));
      locationInputRef.current?.focus();
      return;
    }

    if (requestedLocation) {
      setLocationLoading(true);
      try {
        const resolved = await applyManualLocation(requestedLocation);
        if (resolved) {
          requestedCoordinates = resolved.coordinates;
          requestedLocation = resolved.label;
        }
      } finally {
        setLocationLoading(false);
      }
    }

    trackInteraction('search_submitted', {
      mode: searchMode,
      locationMethod: requestedCoordinates ? 'coordinates' : 'manual',
    });
    await runSearch({ requestedLocation, requestedCoordinates });
    window.setTimeout(() => document.querySelector('#search-results')?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const requestLocation = useCallback(() => {
    trackInteraction('use_my_location_clicked', { locationMethod: 'gps' });
    if (!navigator.geolocation) {
      setLocationStatus('unavailable');
      setLocationLabel(t('landing:search.locationUnsupported'));
      setLocationLoading(false);
      setSearchError(t('landing:search.locationUnsupportedBrowser'));
      return;
    }

    setSearchError('');
    setLocationStatus('requesting');
    setLocationLabel(t('landing:search.allowLocation'));
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async position => {
        const selectedCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        const accuracy = Math.round(position.coords.accuracy);
        let resolvedLabel = t('landing:search.currentLocation');

        try {
          const response = await fetch(
            `${API_URL}/geolocation/reverse?lat=${selectedCoordinates.latitude}&lng=${selectedCoordinates.longitude}`
          );
          const data = await response.json();
          if (response.ok && (data.preciseLabel || data.label)) {
            resolvedLabel = data.preciseLabel || data.label;
          }
        } catch {
          // Coordinates still provide accurate distance search when a locality label is unavailable.
        }

        setCoordinates(selectedCoordinates);
        setLocation(resolvedLabel);
        setLocationLabel(resolvedLabel);
        setLocationAccuracy(accuracy);
        setLocationStatus('granted');
        setLocationLoading(false);
        runSearch({
          requestedMode: searchMode,
          requestedQuery: query,
          requestedLocation: resolvedLabel,
          requestedCoordinates: selectedCoordinates,
        });
      },
      async error => {
        setLocationLoading(false);
        setLocationAccuracy(null);
        const message = error.code === error.PERMISSION_DENIED
          ? t('landing:search.permissionDenied')
          : error.code === error.TIMEOUT
            ? t('landing:search.locationTimeout')
            : t('landing:search.liveLocationUnavailable');

        setLocationLoading(true);
        setLocationStatus('approximate-loading');
        setLocationLabel(t('landing:search.findingApproximate'));

        try {
          const response = await fetch(`${API_URL}/geolocation/approximate`);
          const data = await response.json();
          if (!response.ok || !data.label) throw new Error('Approximate location unavailable');

          setLocation(data.label);
          setCoordinates(null);
          setLocationLabel(data.label);
          if (Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) {
            setMapPickerPosition([data.latitude, data.longitude]);
          }
          setLocationStatus('approximate');
          setLocationLoading(false);
          setSearchError('');
          runSearch({
            requestedMode: searchMode,
            requestedQuery: query,
            requestedLocation: data.city || data.label,
            requestedCoordinates: null,
          });
        } catch {
          setLocationLoading(false);
          setLocationStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
          setLocationLabel(message);
          setSearchError(message);
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, [query, runSearch, searchMode, t]);

  const confirmMapLocation = async () => {
    if (!mapPickerPosition) return;

    const selectedCoordinates = {
      latitude: mapPickerPosition[0],
      longitude: mapPickerPosition[1],
    };
    setMapPickerLoading(true);
    let selectedLabel = `${selectedCoordinates.latitude.toFixed(5)}, ${selectedCoordinates.longitude.toFixed(5)}`;

    try {
      const response = await fetch(
        `${API_URL}/geolocation/reverse?lat=${selectedCoordinates.latitude}&lng=${selectedCoordinates.longitude}`
      );
      const data = await response.json();
      if (response.ok && (data.preciseLabel || data.label)) {
        selectedLabel = data.preciseLabel || data.label;
      }
    } catch {
      // Coordinates remain usable even if the address label cannot be resolved.
    }

    trackInteraction('location_selected', { locationMethod: 'map' });
    setCoordinates(selectedCoordinates);
    setLocation(selectedLabel);
    setLocationLabel(selectedLabel);
    setLocationAccuracy(null);
    setLocationStatus('pinned');
    setMapPickerLoading(false);
    setMapPickerOpen(false);
    await runSearch({
      requestedLocation: selectedLabel,
      requestedCoordinates: selectedCoordinates,
    });
    window.setTimeout(() => document.querySelector('#search-results')?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const chooseService = service => {
    if (service.href) return;
    setSearchMode(service.mode);
    document.querySelector('#care-search')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSearchTabKeyDown = (event, value) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();

    const currentIndex = searchModeOrder.indexOf(value);
    const lastIndex = searchModeOrder.length - 1;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? lastIndex
        : event.key === 'ArrowRight'
          ? (currentIndex + 1) % searchModeOrder.length
          : (currentIndex - 1 + searchModeOrder.length) % searchModeOrder.length;
    const nextMode = searchModeOrder[nextIndex];

    setSearchMode(nextMode);
    searchTabRefs.current[nextMode]?.focus();
  };

  const alert = alerts[0];
  const resultCount = hospitals.length + doctors.length + directoryDoctors.length;
  const publicDoctorCount = useMemo(() => {
    const seenDoctors = new Set();
    [...doctors, ...directoryDoctors].forEach(doctor => {
      seenDoctors.add(doctor.id || `${doctor.name || doctor.fullName}-${doctor.hospitalName || doctor.hospital}`);
    });
    return seenDoctors.size;
  }, [directoryDoctors, doctors]);
  const activeLocationName = coordinates ? locationLabel : location || t('landing:location.india');
  const directoryHeading = searchSummary.includes(activeLocationName)
    ? searchSummary
    : t(coordinates ? 'landing:directory.headingNear' : 'landing:directory.headingAround', { location: activeLocationName });
  const filteredHospitals = useMemo(() => {
    const filtered = hospitals.filter(hospital => {
      if (facilityFilter === 'withDoctors') return hospitalDoctorCount(hospital) > 0;
      if (facilityFilter === 'publishedHours') return hospital.operatingHours?.status === 'published';
      return true;
    });

    return [...filtered].sort((left, right) => {
      if (facilitySort === 'nearest') {
        const leftDistance = Number.isFinite(Number(left.distance)) ? Number(left.distance) : Number.POSITIVE_INFINITY;
        const rightDistance = Number.isFinite(Number(right.distance)) ? Number(right.distance) : Number.POSITIVE_INFINITY;
        return leftDistance - rightDistance || String(left.name || '').localeCompare(String(right.name || ''));
      }
      return String(left.name || '').localeCompare(String(right.name || ''));
    });
  }, [facilityFilter, facilitySort, hospitals]);
  const visibleHospitals = showAllHospitals ? filteredHospitals : filteredHospitals.slice(0, 8);
  const hiddenHospitalCount = Math.max(filteredHospitals.length - visibleHospitals.length, 0);
  const hasHospitalDistances = hospitals.some(hospital => Number.isFinite(Number(hospital.distance)));
  const currentYear = new Date().getFullYear();
  const trustSummaryItems = useMemo(() => [
    hospitals.length > 0
      ? { key: 'hospitals', icon: Building2, text: t('landing:trustSummary.hospitalsNear', { count: hospitals.length, location: activeLocationName }) }
      : null,
    publicDoctorCount > 0
      ? { key: 'doctors', icon: Stethoscope, text: t('landing:trustSummary.doctorsAvailable', { count: publicDoctorCount }) }
      : null,
    { key: 'sources', icon: ShieldCheck, text: t('landing:trustSummary.sourceShown') },
    { key: 'browse', icon: User, text: t('landing:trustSummary.noAccount') },
  ].filter(Boolean), [activeLocationName, hospitals.length, publicDoctorCount, t]);

  return (
    <div className="min-h-screen bg-care-surface text-care-body">
      <a href="#main-content" className="fixed left-4 top-2 z-[110] -translate-y-20 rounded-md bg-care-heading px-4 py-3 text-sm font-bold text-white shadow-lg focus:translate-y-0">
        {t('landing:accessibility.skipToMain')}
      </a>
      {locationPromptOpen && (
        <div className="care-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center px-5" role="dialog" aria-modal="true" aria-labelledby="location-permission-title">
          <div ref={locationPromptRef} className="w-full max-w-md rounded-lg border border-care-border bg-care-surface p-6 shadow-2xl">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-care-primary-subtle text-care-primary-hover">
              <LocateFixed className="h-6 w-6" />
            </span>
            <h2 id="location-permission-title" className="mt-5 text-2xl font-bold text-care-heading">{t('landing:locationPrompt.title')}</h2>
            <p className="mt-3 text-sm leading-6 text-care-muted">{t('landing:locationPrompt.copy')}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => { setLocationPromptOpen(false); requestLocation(); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-care-primary px-4 text-sm font-bold text-care-surface hover:bg-care-primary-hover">
                <Navigation className="h-4 w-4" /> {t('landing:locationPrompt.useCurrent')}
              </button>
              <button type="button" onClick={() => { window.sessionStorage.removeItem(LOCATION_SESSION_KEY); setLocationPromptOpen(false); setLocation(DEFAULT_PUBLIC_LOCATION); setCoordinates(null); setLocationStatus('manual'); setLocationLabel(DEFAULT_PUBLIC_LOCATION); window.setTimeout(() => { locationInputRef.current?.focus(); locationInputRef.current?.select(); }, 50); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-care-border px-4 text-sm font-semibold text-care-body hover:bg-care-neutral">
                <MapPin className="h-4 w-4" /> {t('landing:locationPrompt.chooseAnother')}
              </button>
            </div>
            <p className="mt-4 text-xs leading-5 text-care-muted">{t('landing:locationPrompt.note')}</p>
          </div>
        </div>
      )}
      {mapPickerOpen && (
        <div className="care-modal-backdrop-strong fixed inset-0 z-[90] flex items-center justify-center px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="map-location-title">
          <div ref={mapDialogRef} className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-care-border bg-care-surface shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-care-border px-5 py-4">
              <div>
                <h2 id="map-location-title" className="text-xl font-bold text-care-heading">{t('landing:mapPicker.title')}</h2>
                <p className="mt-1 text-sm text-care-muted">{t('landing:mapPicker.copy')}</p>
              </div>
              <button type="button" onClick={() => setMapPickerOpen(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-care-border text-care-muted hover:bg-care-neutral" aria-label={t('landing:mapPicker.close')}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="h-[52vh] min-h-80 w-full bg-care-neutral">
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-care-muted" role="status">{t('landing:mapPicker.loading')}</div>}>
                <LocationMapPicker position={mapPickerPosition} onChange={setMapPickerPosition} />
              </Suspense>
            </div>
            <div className="flex flex-col gap-3 border-t border-care-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-care-muted">{t('landing:mapPicker.selectedCoordinates')}: {mapPickerPosition[0].toFixed(5)}, {mapPickerPosition[1].toFixed(5)}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setMapPickerOpen(false)} className="min-h-11 rounded-lg border border-care-border px-4 text-sm font-semibold text-care-body hover:bg-care-neutral">{t('landing:mapPicker.cancel')}</button>
                <button type="button" onClick={confirmMapLocation} disabled={mapPickerLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-care-primary px-5 text-sm font-bold text-care-surface hover:bg-care-primary-hover disabled:opacity-60">
                  {mapPickerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                  {t('landing:mapPicker.usePoint')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <header className={`public-header-motion public-site-header sticky top-0 z-40 ${headerScrolled ? 'public-header-scrolled' : ''}`}>
        <div className="public-navbar-inner">
          <PublicLogo />
          <nav className="public-navbar-links" aria-label="Primary navigation">
            {publicNavItems.map(item => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => setActiveNavSection(item.id)}
                className={`public-navbar-link ${activeNavSection === item.id ? 'public-navbar-link-active' : ''}`}
                aria-current={activeNavSection === item.id ? 'page' : undefined}
              >
                {t(`nav:${item.labelKey}`)}
              </a>
            ))}
          </nav>
          <div className="public-navbar-actions">
            <LanguageSwitcher compact />
            <Link to="/login/patient" className="public-navbar-action-link">{t('common:signIn')}</Link>
            <Link to="/signup/patient" className="public-navbar-cta">{t('common:createAccount')}</Link>
          </div>
          <button
            ref={mobileMenuButtonRef}
            type="button"
            onClick={() => setMobileMenuOpen(value => !value)}
            className="public-mobile-menu-trigger"
            aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
            aria-controls="public-mobile-menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <nav id="public-mobile-menu" ref={mobileMenuRef} className="public-mobile-menu lg:hidden" aria-label="Mobile navigation">
            <div className="grid w-full gap-2 text-sm font-semibold text-care-body sm:grid-cols-2">
              {publicNavItems.map(item => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => {
                    setActiveNavSection(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`public-mobile-menu-link ${activeNavSection === item.id ? 'public-mobile-menu-link-active' : ''}`}
                  aria-current={activeNavSection === item.id ? 'page' : undefined}
                >
                  {t(`nav:${item.labelKey}`)}
                </a>
              ))}
              <div className="rounded-lg px-1 py-1"><LanguageSwitcher /></div>
              <Link to="/login/patient" onClick={() => setMobileMenuOpen(false)} className="public-mobile-menu-secondary">{t('common:signIn')}</Link>
              <Link to="/signup/patient" onClick={() => setMobileMenuOpen(false)} className="public-mobile-menu-cta">{t('common:createAccount')}</Link>
            </div>
          </nav>
        )}
      </header>

      {alert && (
        <div className="border-b border-care-warning bg-care-surface">
          <div className="mx-auto flex max-w-7xl items-start gap-3 px-5 py-3 text-sm text-care-warning sm:items-center sm:px-8">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-care-warning sm:mt-0" />
            <p className="flex-1"><strong>{alert.matchedArea} health notice:</strong> {alert.headline}</p>
            <a href={alert.sourceUrl} target="_blank" rel="noreferrer" className="hidden font-semibold underline sm:inline">Official source</a>
          </div>
        </div>
      )}

      <main id="main-content" tabIndex="-1">
        <section className="public-hero-section relative overflow-visible bg-care-heading">
          <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
            <img src={heroImage} alt="" width="1600" height="900" fetchPriority="high" decoding="async" className="public-hero-image absolute inset-0 h-full w-full object-cover object-[65%_center]" />
          </div>
          <div className="care-hero-overlay absolute inset-0" />
          <div className="public-hero-container relative mx-auto flex max-w-7xl items-start px-5 sm:items-center sm:px-8">
            <div className="public-hero-content max-w-[42rem]">
              <span className="mb-5 inline-flex items-center gap-2 rounded-lg border border-care-surface/30 bg-care-heading/35 px-3 py-2 text-xs font-semibold text-care-surface shadow-sm">
                <ShieldCheck className="h-4 w-4" />
                {t('landing:hero.badge')}
              </span>
              <h1 className="max-w-[18ch] text-4xl font-bold leading-[1.08] text-care-surface sm:text-5xl lg:text-[3.6rem]">{t('landing:hero.title')}</h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-white/90">{t('landing:hero.copy')}</p>
              <div className="mt-7 hidden flex-wrap gap-4 text-sm text-white/90 sm:flex">
                <span className="inline-flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-care-primary" /> {t('landing:hero.sourceLabelled')}</span>
                <span className="inline-flex items-center gap-2"><CalendarCheck2 className="h-4 w-4 text-care-primary" /> {t('landing:hero.availability')}</span>
                <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-care-primary" /> {t('landing:hero.locationAware')}</span>
              </div>
            </div>
          </div>

          <div id="care-search" className="relative z-10 mx-auto max-w-7xl px-5 pb-6 sm:absolute sm:inset-x-0 sm:bottom-0 sm:px-8 sm:pb-0">
            <form onSubmit={handleSearch} className="public-search-dock overflow-visible rounded-lg border border-care-border bg-care-surface p-5 shadow-xl sm:p-8">
              <div className="grid gap-4 lg:grid-cols-[minmax(280px,1.05fr)_minmax(320px,1.1fr)_minmax(210px,0.7fr)] lg:items-end">
                <div className="space-y-2">
                  <label htmlFor="public-care-query" className="block text-sm font-bold text-care-heading">
                    {t('landing:search.careLabel')}
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-care-heading" />
                  <input
                    id="public-care-query"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={searchMode === 'symptoms' ? t('landing:search.symptomPlaceholder') : t('landing:search.doctorPlaceholder')}
                    className="h-14 w-full rounded-md border border-care-border bg-care-surface pl-12 pr-4 text-base text-care-body outline-none placeholder:text-care-muted focus:border-care-primary focus:ring-4 focus:ring-care-primary"
                  />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="public-care-location" className="block text-sm font-bold text-care-heading">
                    {t('landing:search.locationLabel')}
                  </label>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="relative">
                      <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-care-heading" />
                      <input
                        id="public-care-location"
                        ref={locationInputRef}
                        value={location}
                        onFocus={() => setLocationSuggestionOpen(true)}
                        onBlur={() => window.setTimeout(() => setLocationSuggestionOpen(false), 120)}
                        onChange={event => {
                          const nextLocation = event.target.value;
                          setLocation(nextLocation);
                          setCoordinates(null);
                          setLocationAccuracy(null);
                          setLocationStatus('manual');
                          setLocationLabel(nextLocation || t('landing:search.enterExactArea'));
                          setLocationSuggestionOpen(true);
                        }}
                        placeholder={t('landing:search.locationPlaceholder')}
                        required
                        aria-describedby={searchError ? 'public-search-error' : 'public-location-help'}
                        className="h-14 w-full rounded-md border border-care-border bg-care-surface pl-12 pr-4 text-base text-care-body outline-none placeholder:text-care-muted focus:border-care-primary focus:ring-4 focus:ring-care-primary"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => requestLocation()}
                      disabled={locationLoading}
                      className="inline-flex h-14 items-center justify-center gap-2 rounded-md border border-care-border bg-care-surface px-4 text-sm font-bold text-care-heading transition-colors hover:bg-care-primary-subtle hover:text-care-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary focus-visible:ring-offset-2 focus-visible:ring-offset-care-surface disabled:opacity-60"
                    >
                      {locationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                      {locationStatus === 'granted' ? t('landing:search.refreshLocationShort') : t('landing:search.useLocationShort')}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={searching || locationLoading} className="inline-flex h-14 w-full min-w-52 items-center justify-center gap-2 rounded-md bg-care-primary px-7 text-base font-bold text-care-surface transition-colors hover:bg-care-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary focus-visible:ring-offset-2 focus-visible:ring-offset-care-surface disabled:opacity-60 lg:w-auto">
                  {searching && <Loader2 className="h-5 w-5 animate-spin" />}
                  {t('landing:search.searchCare')}
                </button>
              </div>
              <div className="mt-4 flex flex-col gap-3 border-t border-care-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('landing:search.searchType')}>
                  {[
                    ['all', t('landing:search.allCare')],
                    ['doctors', t('nav:doctors')],
                    ['hospitals', t('nav:hospitals')],
                    ['symptoms', t('landing:search.symptoms')],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      ref={element => { searchTabRefs.current[value] = element; }}
                      type="button"
                      role="tab"
                      aria-selected={searchMode === value}
                      tabIndex={searchMode === value ? 0 : -1}
                      onClick={() => setSearchMode(value)}
                      onKeyDown={event => handleSearchTabKeyDown(event, value)}
                      className={`min-h-11 rounded-md px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary focus-visible:ring-offset-2 focus-visible:ring-offset-care-surface ${
                        searchMode === value
                          ? 'bg-care-primary-subtle text-care-primary-hover shadow-[inset_0_-3px_0_var(--color-primary)]'
                          : 'text-care-muted hover:bg-care-neutral'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div id="public-location-help" className="flex min-w-0 items-center gap-3 text-xs text-care-muted">
                  <Navigation className="h-4 w-4 shrink-0 text-care-primary-hover" />
                  <span className="min-w-0 truncate">{locationLabel}</span>
                  <button
                    type="button"
                    onClick={() => setMapPickerOpen(true)}
                    className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2 font-semibold text-care-primary-hover hover:bg-care-primary-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary"
                  >
                    {t('landing:search.setOnMap')}
                  </button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-care-border pt-4" aria-label={t('landing:trustSummary.label')}>
                {trustSummaryItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <span key={item.key} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-care-border bg-care-neutral px-3 text-xs font-semibold text-care-body">
                      <Icon className="h-4 w-4 shrink-0 text-care-primary-hover" />
                      {item.text}
                    </span>
                  );
                })}
              </div>
              {locationSuggestionOpen && normalizeLocationInput(location).length >= 2 && (
                <div className="relative z-[90] mt-2 overflow-hidden rounded-lg border border-care-primary bg-care-surface shadow-2xl ring-1 ring-care-border">
                  <div className="border-b border-care-border bg-care-primary-subtle px-4 py-2 text-xs font-bold text-care-primary-hover">
                    {t('landing:search.selectLocation')}
                  </div>
                  {locationSuggestions.length ? (
                    <div className="max-h-72 overflow-y-auto py-1">
                      {locationSuggestions.map(suggestion => (
                        <button
                          key={`${suggestion.provider || suggestion.type || 'directory'}-${suggestion.placeId || suggestion.name}`}
                          type="button"
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => selectLocationSuggestion(suggestion)}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-care-primary-subtle focus:bg-care-primary-subtle focus:outline-none"
                        >
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-care-primary-hover" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold leading-5 text-care-heading">{suggestion.name}</span>
                            <span className="mt-0.5 block text-xs text-care-muted">
                              {suggestion.provider === 'google'
                                ? t('landing:search.googleMapsLocation')
                                : suggestion.provider === 'openstreetmap'
                                  ? t('landing:search.mapLocation')
                                  : suggestion.type
                                    ? Number.isFinite(suggestion.hospitalCount)
                                      ? t('landing:search.nearbyDirectoryListings', { type: suggestion.type, count: suggestion.hospitalCount })
                                      : t('landing:search.typedLocation', { type: suggestion.type })
                                    : t('landing:search.directoryLocation')}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-3 text-sm text-care-muted">
                      {t('landing:search.keepTyping')}
                    </div>
                  )}
                </div>
              )}
              <span className="sr-only" aria-live="polite">{locationLabel}</span>
            </form>
          </div>
        </section>

        <section id="services" className="border-b border-care-border bg-care-surface">
          <div className="care-reveal mx-auto max-w-7xl px-5 py-14 sm:px-8">
            <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <span className="text-xs font-bold text-care-primary-hover">{t('landing:services.eyebrow')}</span>
                <h2 className="mt-2 text-3xl font-bold text-care-heading">{t('landing:services.title')}</h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-care-muted">{t('landing:services.copy')}</p>
            </div>
            <div className="care-stagger grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {quickServices.map(service => {
                const Icon = service.icon;
                const content = (
                  <>
                    <span className="flex w-full items-start justify-between gap-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-care-primary-subtle text-care-primary-hover transition-colors group-hover:bg-care-primary group-hover:text-white">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-care-muted transition-transform group-hover:translate-x-1 group-hover:text-care-primary-hover" aria-hidden="true" />
                    </span>
                    <span className="mt-5 block min-w-0">
                      <strong className="block text-base font-bold text-care-heading">{t(`landing:${service.titleKey}`)}</strong>
                      <span className="mt-2 block text-sm leading-6 text-care-muted">{t(`landing:${service.copyKey}`)}</span>
                    </span>
                  </>
                );
                const cardClassName = 'group care-action care-hover flex min-h-40 h-full w-full flex-col rounded-lg border border-care-border bg-care-surface p-5 text-left shadow-sm transition-all hover:-translate-y-1 hover:border-care-primary hover:bg-care-primary-subtle/30 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary focus-visible:ring-offset-2';
                return service.href ? (
                  <a key={service.titleKey} href={service.href} className={cardClassName}>{content}</a>
                ) : (
                  <button key={service.titleKey} type="button" onClick={() => chooseService(service)} className={cardClassName}>{content}</button>
                );
              })}
            </div>
          </div>
        </section>

        <section id="search-results" className="bg-care-neutral">
          <div className="care-reveal mx-auto max-w-7xl px-5 py-16 sm:px-8">
            <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <span className="text-xs font-bold text-care-primary-hover">{t('landing:directory.eyebrow')}</span>
                <h2 className="mt-2 text-3xl font-bold text-care-heading">{directoryHeading}</h2>
                <p className="mt-2 text-sm text-care-muted" role="status" aria-live="polite" aria-atomic="true">
                  {searching
                    ? t('landing:directory.checking')
                    : t('landing:directory.resultSummary', { count: resultCount, location: activeLocationName })}
                </p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-care-border bg-care-surface px-3 py-2 text-xs font-semibold text-care-muted">
                <BadgeCheck className="h-4 w-4 text-care-primary-hover" />
                {t('landing:directory.sourceNote')}
              </div>
            </div>

            {searchError && (
              <div id="public-search-error" role="alert" className="mb-6 flex items-start gap-3 rounded-lg border border-care-danger bg-care-surface p-4 text-sm text-care-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1">
                  <p>{searchError}</p>
                  <button type="button" onClick={() => runSearch()} className="mt-3 min-h-10 rounded-md border border-care-danger px-4 font-semibold hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-care-danger">
                    {t('landing:directory.retry')}
                  </button>
                </div>
              </div>
            )}

            {searching ? (
              <CardSkeleton count={6} label={t('landing:directory.searching')} />
            ) : (
              <div className="space-y-14">
                {(searchMode === 'all' || searchMode === 'doctors' || searchMode === 'symptoms') && (
                  <div>
                    <div className="mb-5 flex items-center justify-between">
                      <h3 className="text-xl font-bold text-care-heading">{t('landing:directory.doctorsTitle')}</h3>
                      <Link to="/login/patient" className="text-sm font-semibold text-care-primary-hover hover:underline">{t('landing:directory.viewFull')}</Link>
                    </div>
                    {doctors.length || directoryDoctors.length ? (
                      <div className="care-stagger grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {doctors.slice(0, 6).map(doctor => (
                          <PublicDoctorCard key={`bookable-${doctor.id}`} doctor={doctor} />
                        ))}
                        {doctors.length === 0 && directoryDoctors.slice(0, 6).map(doctor => (
                          <PublicDoctorCard key={`directory-${doctor.id}`} doctor={doctor} directoryOnly />
                        ))}
                      </div>
                    ) : (
                      <DirectoryEmptyState
                        icon={Stethoscope}
                        title={t('landing:emptyStates.noDoctorsTitle')}
                        copy={t('landing:emptyStates.noDoctorsCopy', { location: activeLocationName })}
                        actions={[
                          {
                            label: t('landing:emptyStates.changeLocation'),
                            eventName: 'change_location',
                            onClick: () => {
                              document.querySelector('#care-search')?.scrollIntoView({ behavior: 'smooth' });
                              window.setTimeout(() => locationInputRef.current?.focus(), 250);
                            },
                          },
                          {
                            label: t('landing:emptyStates.viewHospitals'),
                            eventName: 'view_hospitals',
                            onClick: () => {
                              setSearchMode('hospitals');
                              runSearch({ requestedMode: 'hospitals' });
                            },
                          },
                          query.trim() ? {
                            label: t('landing:emptyStates.clearSearch'),
                            eventName: 'clear_search',
                            onClick: () => {
                              setQuery('');
                              runSearch({ requestedMode: 'doctors', requestedQuery: '' });
                            },
                          } : null,
                        ].filter(Boolean)}
                      />
                    )}
                  </div>
                )}

                {(searchMode === 'all' || searchMode === 'hospitals' || searchMode === 'symptoms') && (
                  <div id="facilities">
                    <div className="mb-5 flex flex-col gap-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-care-heading">{t('landing:directory.hospitalsTitle')}</h3>
                        {hospitals.length > 0 && (
                          <p className="mt-1 text-sm text-care-muted">
                            {t('landing:directory.facilitySummary', { visible: visibleHospitals.length, total: filteredHospitals.length, location: activeLocationName })}
                            {coordinates && <span> · {t('landing:directory.searchRadius', { radius: 150 })}</span>}
                          </p>
                        )}
                      </div>
                        <div className="flex flex-wrap items-center gap-3">
                        {hiddenHospitalCount > 0 && (
                            <button type="button" onClick={() => setShowAllHospitals(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-care-border bg-care-surface px-3 text-sm font-semibold text-care-heading hover:bg-care-primary-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary">
                            {t('landing:directory.showAll', { count: filteredHospitals.length })}
                          </button>
                        )}
                          {showAllHospitals && filteredHospitals.length > 8 && (
                            <button type="button" onClick={() => setShowAllHospitals(false)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-care-border bg-care-surface px-3 text-sm font-semibold text-care-heading hover:bg-care-primary-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary">
                            {t('landing:directory.showLess')}
                          </button>
                        )}
                          <button type="button" onClick={requestLocation} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-care-primary px-3 text-sm font-semibold text-care-primary-hover hover:bg-care-primary-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary"><Navigation className="h-4 w-4" /> {t('landing:directory.findNearest')}</button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 rounded-lg border border-care-border bg-care-surface p-3 sm:flex-row sm:items-center">
                        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-care-heading">
                          <Filter className="h-4 w-4 shrink-0 text-care-primary-hover" aria-hidden="true" />
                          <span className="sr-only">{t('landing:directory.filter')}</span>
                          <select
                            value={facilityFilter}
                            onChange={event => { setFacilityFilter(event.target.value); setShowAllHospitals(false); }}
                            className="min-h-10 w-full rounded-md border border-care-border bg-care-surface px-3 text-sm text-care-body focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary"
                          >
                            <option value="all">{t('landing:directory.allFacilities')}</option>
                            <option value="withDoctors">{t('landing:directory.withDoctors')}</option>
                            <option value="publishedHours">{t('landing:directory.withPublishedHours')}</option>
                          </select>
                        </label>
                        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-care-heading">
                          <ArrowUpDown className="h-4 w-4 shrink-0 text-care-primary-hover" aria-hidden="true" />
                          <span className="sr-only">{t('landing:directory.sort')}</span>
                          <select
                            value={facilitySort}
                            onChange={event => setFacilitySort(event.target.value)}
                            className="min-h-10 w-full rounded-md border border-care-border bg-care-surface px-3 text-sm text-care-body focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary"
                          >
                            {hasHospitalDistances && <option value="nearest">{t('landing:directory.sortNearest')}</option>}
                            <option value="name">{t('landing:directory.sortName')}</option>
                          </select>
                        </label>
                        {facilityFilter !== 'all' && (
                          <button type="button" onClick={() => setFacilityFilter('all')} className="min-h-10 rounded-md px-3 text-sm font-semibold text-care-primary-hover hover:bg-care-primary-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary">
                            {t('landing:directory.clearFilter')}
                          </button>
                        )}
                      </div>
                    </div>
                    {hospitals.length ? (
                      <div className="care-stagger grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {visibleHospitals.map(hospital => (
                          <article key={hospital.id} className="care-hover flex flex-col rounded-lg border border-care-border bg-care-surface p-5 shadow-sm focus-within:ring-2 focus-within:ring-care-primary">
                            <div className="flex items-start justify-between gap-3">
                              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-care-primary-subtle text-care-heading"><Building2 className="h-5 w-5" aria-hidden="true" /></span>
                              {hospital.distance != null && <ResultBadge tone="blue">{Number(hospital.distance).toFixed(1)} km</ResultBadge>}
                            </div>
                            <h4 className="mt-4 text-base font-bold leading-6 text-care-heading">{hospital.name}</h4>
                            <p className="mt-2 line-clamp-3 text-sm leading-5 text-care-muted">{hospital.address || `${hospital.district || hospital.city}, ${hospital.state}`}</p>
                            <p className="mt-3 text-xs font-semibold text-care-muted">{formatFacilityType(hospital.hospitalType || hospital.careType, t)}</p>

                            <div className="mt-4 flex flex-wrap gap-2">
                              {hasPublishedGoogleRating(hospital) && (
                                <HospitalRatingSummary googleRating={hospital.googleRating} />
                              )}
                              {hasPublishedOperatingHours(hospital) && (
                                <HospitalOperatingHours operatingHours={hospital.operatingHours} compact />
                              )}
                              {hospitalDoctorCount(hospital) > 0 && (
                                <ResultBadge tone="blue">
                                  <Stethoscope className="h-3 w-3" aria-hidden="true" />
                                  {t(hospitalDoctorCount(hospital) === 1 ? 'landing:facilityCard.doctorListed' : 'landing:facilityCard.doctorsListed', { count: hospitalDoctorCount(hospital) })}
                                </ResultBadge>
                              )}
                              {(hospital.emergencyAvailable === true || hospital.emergencyServices === true) && (
                                <ResultBadge tone="amber"><Cross className="h-3 w-3" aria-hidden="true" /> {t('landing:facilityCard.emergencyAvailable')}</ResultBadge>
                              )}
                              {(hospital.bookableDoctors || []).length > 0 && (
                                <ResultBadge><CalendarCheck2 className="h-3 w-3" aria-hidden="true" /> {t('landing:facilityCard.bookingAvailable')}</ResultBadge>
                              )}
                            </div>

                            {(!hasPublishedGoogleRating(hospital) || !hasPublishedOperatingHours(hospital) || hospitalDoctorCount(hospital) === 0) && (
                              <p className="mt-4 text-xs leading-5 text-care-muted">{t('landing:facilityCard.partialData')}</p>
                            )}

                            <div className="mt-4 flex flex-wrap items-center gap-2">
                              <FacilityVerificationBadge hospital={hospital} />
                              {formatUpdatedDate(hospital.sourceLastUpdated || hospital.verifiedAt || hospital.updatedAt) && (
                                <span className="text-xs text-care-muted">{t('landing:facilityCard.updated', { date: formatUpdatedDate(hospital.sourceLastUpdated || hospital.verifiedAt || hospital.updatedAt) })}</span>
                              )}
                            </div>

                            <div className="mt-5 flex flex-col gap-2">
                              <Link
                                to={{
                                  pathname: `/hospital/${hospital.id}`,
                                  search: `?place=${encodeURIComponent(activeLocationName)}`,
                                }}
                                state={{ hospital }}
                                onClick={() => trackInteraction('hospital_result_opened', { sourceType: hospital.sourceType || hospital.source_type || 'directory' })}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-care-primary px-4 text-sm font-semibold text-white hover:bg-care-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary focus-visible:ring-offset-2"
                              >
                                {t(hospitalDoctorCount(hospital) > 0 ? 'landing:facilityCard.viewFacilityDoctors' : 'landing:facilityCard.viewHospital')}
                                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                              </Link>
                              {facilityDirectionsUrl(hospital) && (
                                <a
                                  href={facilityDirectionsUrl(hospital)}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={() => trackInteraction('directions_clicked', { listingType: 'hospital' })}
                                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-care-border px-4 text-sm font-semibold text-care-heading hover:bg-care-primary-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary"
                                >
                                  <Navigation className="h-4 w-4" aria-hidden="true" /> {t('landing:facilityCard.getDirections')} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                </a>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : hospitals.length > 0 ? (
                      <DirectoryEmptyState
                        icon={Filter}
                        title={t('landing:emptyStates.noFilterTitle')}
                        copy={t('landing:directory.noFilteredFacilities')}
                        actions={[{ label: t('landing:directory.clearFilter'), eventName: 'clear_filter', onClick: () => setFacilityFilter('all') }]}
                      />
                    ) : (
                      <DirectoryEmptyState
                        icon={SearchX}
                        title={t('landing:emptyStates.noFacilitiesTitle')}
                        copy={t('landing:emptyStates.noFacilitiesCopy', { location: activeLocationName })}
                        actions={[
                          {
                            label: t('landing:emptyStates.changeLocation'),
                            eventName: 'change_location',
                            onClick: () => {
                              document.querySelector('#care-search')?.scrollIntoView({ behavior: 'smooth' });
                              window.setTimeout(() => locationInputRef.current?.focus(), 250);
                            },
                          },
                          query.trim() ? {
                            label: t('landing:emptyStates.clearSearch'),
                            eventName: 'clear_search',
                            onClick: () => {
                              setQuery('');
                              runSearch({ requestedMode: 'hospitals', requestedQuery: '' });
                            },
                          } : null,
                        ].filter(Boolean)}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section id="trust" className="bg-care-surface">
          <div className="care-reveal mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:items-center">
            <div>
              <img src={consultationImage} alt={t('landing:trust.imageAlt')} width="1200" height="900" loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-lg object-cover" />
              <div className="mt-4 flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-care-primary-hover" aria-hidden="true" />
                <div>
                  <strong className="block text-sm text-care-heading">{t('landing:trust.cardTitle')}</strong>
                  <span className="mt-1 block text-sm leading-6 text-care-muted">{t('landing:trust.cardCopy')}</span>
                </div>
              </div>
            </div>
            <div>
              <span className="text-xs font-bold text-care-primary-hover">{t('landing:trust.eyebrow')}</span>
              <h2 className="mt-3 text-3xl font-bold leading-tight text-care-heading">{t('landing:trust.title')}</h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-care-muted">{t('landing:trust.copy')}</p>
              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                {[
                  [t('landing:trust.verifiedTitle'), t('landing:trust.verifiedCopy')],
                  [t('landing:trust.sourcesTitle'), t('landing:trust.sourcesCopy')],
                  [t('landing:trust.privacyTitle'), t('landing:trust.privacyCopy')],
                  [t('landing:trust.discoveryTitle'), t('landing:trust.discoveryCopy')],
                ].map(([title, copy]) => (
                  <div key={title} className="flex gap-3">
                    <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-care-primary" />
                    <div><h3 className="text-sm font-bold text-care-heading">{title}</h3><p className="mt-1 text-sm leading-6 text-care-muted">{copy}</p></div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!verificationDetailsOpen) trackInteraction('verification_explanation_opened');
                  setVerificationDetailsOpen(value => !value);
                }}
                aria-expanded={verificationDetailsOpen}
                aria-controls="verification-details"
                className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-lg bg-care-primary px-5 text-sm font-semibold text-care-surface hover:bg-care-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary focus-visible:ring-offset-2"
              >
                {t('landing:trust.cta')} <ArrowRight className={`h-4 w-4 transition-transform ${verificationDetailsOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
              </button>
              {verificationDetailsOpen && (
                <div id="verification-details" className="mt-5 space-y-3 border-l-2 border-care-primary pl-4 text-sm leading-6 text-care-muted">
                  <p><strong className="text-care-heading">{t('landing:facilityCard.providerVerified')}:</strong> {t('landing:facilityCard.providerVerifiedExplanation')}</p>
                  <p><strong className="text-care-heading">{t('landing:facilityCard.publicSourceVerified')}:</strong> {t('landing:facilityCard.publicSourceVerifiedExplanation')}</p>
                  <p><strong className="text-care-heading">{t('landing:facilityCard.communityMapped')}:</strong> {t('landing:facilityCard.communityMappedExplanation')}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="bg-care-neutral">
          <div className="care-reveal mx-auto max-w-7xl px-5 py-16 sm:px-8">
            <div className="mx-auto mb-8 max-w-2xl text-center">
              <span className="text-xs font-bold text-care-primary-hover">{t('landing:more.eyebrow')}</span>
              <h2 className="mt-3 text-3xl font-bold text-care-heading">{t('landing:more.title')}</h2>
            </div>
            <div className="care-stagger grid items-stretch gap-5 md:grid-cols-3">
              <article className="care-hover flex h-full flex-col overflow-hidden rounded-lg border border-care-border bg-care-surface">
                <img src={diagnosticsImage} alt={t('landing:more.diagnosticsAlt')} width="1200" height="900" className="h-40 w-full object-cover" loading="lazy" decoding="async" />
                <div className="flex flex-1 flex-col p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-care-primary-subtle text-care-primary-hover"><FlaskConical className="h-5 w-5" aria-hidden="true" /></span>
                  <h3 className="mt-4 text-lg font-bold text-care-heading">{t('landing:more.diagnosticsTitle')}</h3>
                  <p className="mt-2 text-sm leading-6 text-care-muted">{t('landing:more.diagnosticsCopy')}</p>
                  <button type="button" onClick={() => { setSearchMode('hospitals'); setQuery('diagnostic'); document.querySelector('#care-search')?.scrollIntoView({ behavior: 'smooth' }); }} className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-care-border px-4 text-sm font-semibold text-care-heading hover:bg-care-primary-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary">
                    {t('landing:more.findDiagnostics')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </article>
              <article className="care-hover flex h-full flex-col overflow-hidden rounded-lg border border-care-border bg-care-surface">
                <img src={heroImage} alt={t('landing:more.appointmentsAlt')} width="1600" height="900" className="h-40 w-full object-cover object-[70%_center]" loading="lazy" decoding="async" />
                <div className="flex flex-1 flex-col p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-care-primary-subtle text-care-primary-hover"><CalendarCheck2 className="h-5 w-5" aria-hidden="true" /></span>
                  <h3 className="mt-4 text-lg font-bold text-care-heading">{t('landing:more.appointmentsTitle')}</h3>
                  <p className="mt-2 text-sm leading-6 text-care-muted">{t('landing:more.appointmentsCopy')}</p>
                  <button type="button" onClick={() => { setSearchMode('doctors'); document.querySelector('#care-search')?.scrollIntoView({ behavior: 'smooth' }); }} className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-care-border px-4 text-sm font-semibold text-care-heading hover:bg-care-primary-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary">
                    {t('landing:more.findAppointment')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </article>
              <article id="emergency" className="flex h-full flex-col justify-between rounded-lg border border-care-danger border-l-4 bg-care-surface p-6 text-care-heading">
                <div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-50 text-care-danger"><PhoneCall className="h-5 w-5" aria-hidden="true" /></span>
                  <h3 className="mt-6 text-xl font-bold">{t('landing:more.urgentTitle')}</h3>
                  <p className="mt-3 text-sm leading-6 text-care-body">{t('landing:more.urgentCopy')}</p>
                </div>
                <div className="mt-8 space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      trackInteraction('emergency_care_action_clicked');
                      setSearchMode('hospitals');
                      setQuery('emergency');
                      runSearch({ requestedMode: 'hospitals', requestedQuery: 'emergency' });
                      document.querySelector('#search-results')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-care-danger px-4 text-sm font-bold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-care-danger focus-visible:ring-offset-2"
                  >
                    <Cross className="h-4 w-4" aria-hidden="true" /> {t('landing:more.findEmergency')}
                  </button>
                  <a href="tel:112" onClick={() => trackInteraction('emergency_call_clicked')} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-care-danger px-4 text-sm font-bold text-care-danger hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-care-danger focus-visible:ring-offset-2">
                    <PhoneCall className="h-4 w-4" aria-hidden="true" /> {t('landing:more.callEmergency')}
                  </a>
                  <p className="text-center text-xs leading-5 text-care-muted">{t('landing:more.emergencyNote')}</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="health-guides" className="bg-care-surface">
          <div className="care-reveal mx-auto max-w-7xl px-5 py-16 sm:px-8">
            <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div><span className="text-xs font-bold text-care-primary-hover">{t('landing:guides.eyebrow')}</span><h2 className="mt-3 text-3xl font-bold text-care-heading">{t('landing:guides.title')}</h2></div>
              <div className="inline-flex items-center gap-2 text-xs text-care-muted"><ShieldCheck className="h-4 w-4 text-care-primary-hover" /> {t('landing:guides.reviewNote')}</div>
            </div>
            <div className="care-stagger grid gap-4 md:grid-cols-3">
              {guides.map(guide => (
                <article key={guide.titleKey} className="care-hover rounded-lg border border-care-border p-6">
                  <span className="text-xs font-bold text-care-primary-hover">{t(`landing:${guide.tagKey}`)}</span>
                  <h3 className="mt-3 text-lg font-bold leading-7 text-care-heading">{t(`landing:${guide.titleKey}`)}</h3>
                  <p className="mt-3 text-sm leading-6 text-care-muted">{t(`landing:${guide.copyKey}`)}</p>
                  <Link to="/login/patient" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-care-heading">{t('landing:guides.readGuide')} <ArrowRight className="h-4 w-4" /></Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-care-border bg-care-neutral">
          <div className="care-reveal mx-auto max-w-7xl px-5 py-12 sm:px-8">
            <div className="max-w-2xl">
              <span className="text-xs font-bold text-care-primary-hover">{t('landing:teams.eyebrow')}</span>
              <h2 className="mt-2 text-2xl font-bold text-care-heading">{t('landing:teams.title')}</h2>
              <p className="mt-2 text-sm leading-6 text-care-muted">{t('landing:teams.copy')}</p>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {[
                { to: '/login/patient', icon: User, title: t('landing:teams.patientPortal'), copy: t('landing:teams.patientCopy') },
                { to: '/login/doctor', icon: Stethoscope, title: t('landing:teams.doctorPortal'), copy: t('landing:teams.doctorCopy') },
                { to: '/login/admin', icon: Building2, title: t('landing:teams.hospitalPortal'), copy: t('landing:teams.hospitalCopy') },
              ].map(portal => {
                const Icon = portal.icon;
                return (
                  <Link key={portal.to} to={portal.to} className="group flex min-h-32 items-start gap-4 rounded-lg border border-care-border bg-care-surface p-4 text-left hover:-translate-y-0.5 hover:border-care-primary hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-care-primary">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-care-primary-subtle text-care-primary-hover"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                    <span>
                      <strong className="block text-sm text-care-heading">{portal.title}</strong>
                      <span className="mt-2 block text-sm leading-6 text-care-muted">{portal.copy}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-care-heading text-care-surface">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div><PublicLogo light /><p className="mt-4 max-w-sm text-sm leading-6 text-care-primary-subtle">{t('landing:footer.copy')}</p></div>
            <div><h3 className="text-sm font-bold">{t('landing:footer.findCare')}</h3><div className="mt-4 grid gap-2 text-sm text-care-primary-subtle"><a href="#search-results">{t('nav:doctors')}</a><a href="#facilities">{t('nav:hospitals')}</a><a href="#services">{t('nav:services')}</a><a href="#emergency">{t('landing:footer.emergencyGuidance')}</a></div></div>
            <div><h3 className="text-sm font-bold">Swasthya Sarthi</h3><div className="mt-4 grid gap-2 text-sm text-care-primary-subtle"><a href="#trust">{t('landing:footer.verification')}</a><a href="#health-guides">{t('nav:healthGuides')}</a><Link to="/login/doctor">{t('landing:footer.forDoctors')}</Link><Link to="/login/admin">{t('landing:footer.forHospitals')}</Link></div></div>
            <div><h3 className="text-sm font-bold">{t('landing:footer.language')}</h3><div className="mt-4"><LanguageSwitcher /></div></div>
          </div>
          <div className="mt-10 flex flex-col gap-4 border-t border-care-border/15 pt-6 text-xs text-care-primary-subtle sm:flex-row sm:items-center sm:justify-between">
            <span>{t('landing:footer.disclaimer', { year: currentYear })}</span>
            <nav className="flex gap-5" aria-label={t('landing:footer.legal')}><Link to="/legal/privacy">{t('landing:footer.privacy')}</Link><Link to="/legal/terms">{t('landing:footer.terms')}</Link><Link to="/legal/security">{t('landing:footer.security')}</Link></nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
