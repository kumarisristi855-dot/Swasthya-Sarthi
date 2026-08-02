import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleMarker, MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarCheck2,
  Cross,
  FlaskConical,
  HeartPulse,
  Languages,
  Loader2,
  LocateFixed,
  MapPin,
  Menu,
  Navigation,
  PhoneCall,
  Search,
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
import { enrichHospitalsWithGoogleRatings } from '../lib/googleHospitalRatings';
import diagnosticsImage from '../assets/care-diagnostics.jpg';
import { API_URL } from '../lib/api';
import LanguageSwitcher from '../i18n/LanguageSwitcher';
import { useTranslation } from 'react-i18next';

const LOCATION_SESSION_KEY = 'swasthya-sarthi-public-location';

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
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${classes}`}>{children}</span>;
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

function LocationPin({ position, onChange }) {
  useMapEvents({
    click(event) {
      onChange([event.latlng.lat, event.latlng.lng]);
    },
  });

  return position ? (
    <CircleMarker
      center={position}
      radius={9}
      pathOptions={{ color: 'var(--color-surface)', fillColor: 'var(--color-primary)', fillOpacity: 1, weight: 3 }}
    />
  ) : null;
}

export default function LandingPage() {
  const { t } = useTranslation(['common', 'nav', 'landing']);
  const initialLocationRef = useRef(loadLocationSelection());
  const initialLocation = initialLocationRef.current;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [searchMode, setSearchMode] = useState('all');
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState(initialLocation?.location || 'Delhi');
  const [coordinates, setCoordinates] = useState(initialLocation?.coordinates || null);
  const [locationLabel, setLocationLabel] = useState(initialLocation?.locationLabel || t('landing:search.chooseOrEnter'));
  const [locationStatus, setLocationStatus] = useState(initialLocation?.locationStatus || 'prompt');
  const [locationAccuracy, setLocationAccuracy] = useState(initialLocation?.locationAccuracy || null);
  const [locationPromptOpen, setLocationPromptOpen] = useState(!initialLocation);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [mapPickerPosition, setMapPickerPosition] = useState([28.6139, 77.2090]);
  const [mapPickerLoading, setMapPickerLoading] = useState(false);
  const [specializations, setSpecializations] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [showAllHospitals, setShowAllHospitals] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [directoryDoctors, setDirectoryDoctors] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [locationSuggestionOpen, setLocationSuggestionOpen] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchSummary, setSearchSummary] = useState(t('landing:directory.headingAround', { location: t('landing:location.india') }));
  const locationInputRef = useRef(null);
  const tomorrow = useMemo(formatTomorrow, []);

  useEffect(() => {
    const updateHeader = () => setHeaderScrolled(window.scrollY > 16);
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
    return () => window.removeEventListener('scroll', updateHeader);
  }, []);

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
      setSearchError(error.message || t('landing:directory.searchUnavailable'));
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
        requestedLocation: initialLocation?.location || 'Delhi',
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
      setSearchError(error.message || 'Could not use that location. Try typing a nearby area.');
    } finally {
      setLocationLoading(false);
    }
  };

  const handleSearch = async event => {
    event.preventDefault();
    let requestedCoordinates = coordinates;
    let requestedLocation = normalizeLocationInput(location);

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

    await runSearch({ requestedLocation, requestedCoordinates });
    window.setTimeout(() => document.querySelector('#search-results')?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const requestLocation = useCallback(({ fallbackToDelhi = false } = {}) => {
    if (!navigator.geolocation) {
      setLocationStatus('unavailable');
      setLocationLabel(t('landing:search.locationUnsupported'));
      setLocationLoading(false);
      setSearchError(t('landing:search.locationUnsupportedBrowser'));
      if (fallbackToDelhi) {
        setLocation('Delhi');
        setLocationLabel('Delhi');
        runSearch({ requestedLocation: 'Delhi', requestedCoordinates: null });
      }
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
          ? 'Location permission was denied. Enter any city or locality instead.'
          : error.code === error.TIMEOUT
            ? 'Location detection took too long. Retry or enter another locality.'
            : 'Your live location is unavailable. Enter a city or locality instead.';

        setLocationLoading(true);
        setLocationStatus('approximate-loading');
        setLocationLabel('Exact location is blocked. Finding your approximate city...');

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
          if (fallbackToDelhi) {
            setLocation('Delhi');
            runSearch({
              requestedMode: 'all',
              requestedQuery: '',
              requestedLocation: 'Delhi',
              requestedCoordinates: null,
            });
          }
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

  const alert = alerts[0];
  const resultCount = hospitals.length + doctors.length + directoryDoctors.length;
  const activeLocationName = coordinates ? locationLabel : location || t('landing:location.india');
  const directoryHeading = searchSummary.includes(activeLocationName)
    ? searchSummary
    : t(coordinates ? 'landing:directory.headingNear' : 'landing:directory.headingAround', { location: activeLocationName });
  const visibleHospitals = showAllHospitals ? hospitals : hospitals.slice(0, 8);
  const hiddenHospitalCount = Math.max(hospitals.length - visibleHospitals.length, 0);

  return (
    <div className="min-h-screen bg-care-surface text-care-body">
      {locationPromptOpen && (
        <div className="care-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center px-5" role="dialog" aria-modal="true" aria-labelledby="location-permission-title">
          <div className="w-full max-w-md rounded-lg border border-care-border bg-care-surface p-6 shadow-2xl">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-care-primary-subtle text-care-primary-hover">
              <LocateFixed className="h-6 w-6" />
            </span>
            <h2 id="location-permission-title" className="mt-5 text-2xl font-bold text-care-heading">{t('landing:locationPrompt.title')}</h2>
            <p className="mt-3 text-sm leading-6 text-care-muted">{t('landing:locationPrompt.copy')}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => { setLocationPromptOpen(false); requestLocation(); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-care-primary px-4 text-sm font-bold text-care-surface hover:bg-care-primary-hover">
                <Navigation className="h-4 w-4" /> {t('landing:locationPrompt.useCurrent')}
              </button>
              <button type="button" onClick={() => { window.sessionStorage.removeItem(LOCATION_SESSION_KEY); setLocationPromptOpen(false); setLocation(''); setCoordinates(null); setLocationStatus('manual'); setLocationLabel(t('landing:search.enterExactArea')); window.setTimeout(() => locationInputRef.current?.focus(), 50); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-care-border px-4 text-sm font-semibold text-care-body hover:bg-care-neutral">
                <MapPin className="h-4 w-4" /> {t('landing:locationPrompt.chooseAnother')}
              </button>
            </div>
            <p className="mt-4 text-xs leading-5 text-care-muted">{t('landing:locationPrompt.note')}</p>
          </div>
        </div>
      )}
      {mapPickerOpen && (
        <div className="care-modal-backdrop-strong fixed inset-0 z-[90] flex items-center justify-center px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="map-location-title">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-care-border bg-care-surface shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-care-border px-5 py-4">
              <div>
                <h2 id="map-location-title" className="text-xl font-bold text-care-heading">Set your exact search point</h2>
                <p className="mt-1 text-sm text-care-muted">Move the map and click your road, building, or neighbourhood to place the marker.</p>
              </div>
              <button type="button" onClick={() => setMapPickerOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-care-border text-care-muted hover:bg-care-neutral" aria-label="Close location map">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="h-[52vh] min-h-80 w-full bg-care-neutral">
              <MapContainer center={mapPickerPosition} zoom={14} className="h-full w-full" zoomControl={true}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationPin position={mapPickerPosition} onChange={setMapPickerPosition} />
              </MapContainer>
            </div>
            <div className="flex flex-col gap-3 border-t border-care-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-care-muted">Selected coordinates: {mapPickerPosition[0].toFixed(5)}, {mapPickerPosition[1].toFixed(5)}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setMapPickerOpen(false)} className="h-10 rounded-lg border border-care-border px-4 text-sm font-semibold text-care-body hover:bg-care-neutral">Cancel</button>
                <button type="button" onClick={confirmMapLocation} disabled={mapPickerLoading} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-care-primary px-5 text-sm font-bold text-care-surface hover:bg-care-primary-hover disabled:opacity-60">
                  {mapPickerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                  Use this point
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <header className={`public-header-motion sticky top-0 z-40 border-b border-care-border bg-care-surface/95 backdrop-blur-md ${headerScrolled ? 'public-header-scrolled' : ''}`}>
        <div className="public-navbar-inner">
          <PublicLogo />
          <nav className="public-navbar-links" aria-label="Primary navigation">
            <a href="#services" className="public-navbar-link">{t('nav:services')}</a>
            <a href="#search-results" className="public-navbar-link">{t('nav:doctors')}</a>
            <a href="#facilities" className="public-navbar-link">{t('nav:hospitals')}</a>
            <a href="#health-guides" className="public-navbar-link">{t('nav:healthGuides')}</a>
            <a href="#trust" className="public-navbar-link">{t('nav:whyBrand')}</a>
          </nav>
          <div className="public-navbar-actions">
            <LanguageSwitcher compact />
            <Link to="/login/patient" className="rounded-lg px-4 py-2.5 text-sm font-semibold text-care-body hover:bg-care-neutral">{t('common:signIn')}</Link>
            <Link to="/signup/patient" className="rounded-lg bg-care-primary px-4 py-2.5 text-sm font-semibold text-care-surface hover:bg-care-primary-hover">{t('common:createAccount')}</Link>
          </div>
          <button type="button" onClick={() => setMobileMenuOpen(value => !value)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-care-border text-care-body lg:hidden" aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}>
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <nav className="border-t border-care-border bg-care-surface px-5 py-4 lg:hidden" aria-label="Mobile navigation">
            <div className="grid w-full gap-1 text-sm font-semibold text-care-body sm:grid-cols-2">
              <div className="rounded-lg px-3 py-2.5"><LanguageSwitcher /></div>
              <a href="#services" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-care-neutral">{t('nav:services')}</a>
              <a href="#search-results" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-care-neutral">{t('nav:doctors')}</a>
              <a href="#facilities" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-care-neutral">{t('nav:hospitals')}</a>
              <a href="#health-guides" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-care-neutral">{t('nav:healthGuides')}</a>
              <a href="#trust" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-care-neutral">{t('nav:whyBrand')}</a>
              <Link to="/login/patient" onClick={() => setMobileMenuOpen(false)} className="mt-2 rounded-lg border border-care-border px-3 py-3 text-center text-care-heading hover:bg-care-neutral sm:mt-0">{t('common:signIn')}</Link>
              <Link to="/signup/patient" onClick={() => setMobileMenuOpen(false)} className="rounded-lg bg-care-primary px-3 py-3 text-center text-care-surface hover:bg-care-primary-hover">{t('common:createAccount')}</Link>
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

      <main>
        <section className="relative min-h-[760px] overflow-visible bg-care-heading sm:min-h-[660px]">
          <img src={heroImage} alt="Doctor discussing care with a patient" className="public-hero-image absolute inset-0 h-full w-full object-cover object-[65%_center]" />
          <div className="care-hero-overlay absolute inset-0" />
          <div className="relative mx-auto flex min-h-[760px] max-w-7xl items-start px-5 pb-96 pt-24 sm:min-h-[660px] sm:items-center sm:px-8 sm:pb-36 sm:pt-16">
            <div className="public-hero-content max-w-2xl">
              <span className="mb-5 inline-flex items-center gap-2 rounded-lg border border-care-border/25 bg-care-surface/10 px-3 py-2 text-xs font-semibold text-care-primary-subtle">
                <ShieldCheck className="h-4 w-4" />
                {t('landing:hero.badge')}
              </span>
              <h1 className="text-4xl font-bold leading-[1.08] text-care-surface sm:text-5xl lg:text-6xl">{t('landing:hero.title')}</h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-care-primary-subtle">{t('landing:hero.copy')}</p>
              <div className="mt-8 hidden flex-wrap gap-4 text-sm text-care-primary-subtle sm:flex">
                <span className="inline-flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-care-primary" /> {t('landing:hero.sourceLabelled')}</span>
                <span className="inline-flex items-center gap-2"><CalendarCheck2 className="h-4 w-4 text-care-primary" /> {t('landing:hero.availability')}</span>
                <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-care-primary" /> {t('landing:hero.locationAware')}</span>
              </div>
            </div>
          </div>

          <div id="care-search" className="absolute inset-x-0 bottom-0 z-10 mx-auto max-w-7xl px-5 sm:px-8">
            <form onSubmit={handleSearch} className="public-search-dock overflow-visible rounded-lg border border-care-border bg-care-surface p-5 shadow-xl sm:p-8">
              <div className="grid gap-3 lg:grid-cols-[minmax(280px,1.08fr)_minmax(280px,1.08fr)_minmax(250px,0.94fr)]">
                <label className="relative">
                  <span className="sr-only">{t('landing:search.doctorSr')}</span>
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-care-heading" />
                  <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={searchMode === 'symptoms' ? t('landing:search.symptomPlaceholder') : t('landing:search.doctorPlaceholder')}
                    className="h-16 w-full rounded-md border border-care-border bg-care-surface pl-14 pr-4 text-base text-care-body outline-none placeholder:text-care-muted focus:border-care-primary focus:ring-4 focus:ring-care-primary"
                  />
                </label>
                <label className="relative">
                  <span className="sr-only">{t('landing:search.locationSr')}</span>
                  <MapPin className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-care-heading" />
                  <input
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
                    className="h-16 w-full rounded-md border border-care-border bg-care-surface pl-14 pr-12 text-base text-care-body outline-none placeholder:text-care-muted focus:border-care-primary focus:ring-4 focus:ring-care-primary"
                  />
                  <button
                    type="button"
                    onClick={() => requestLocation()}
                    disabled={locationLoading}
                    className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-care-heading hover:text-care-primary-hover disabled:opacity-50"
                    aria-label={locationStatus === 'granted' ? t('landing:search.refreshLocation') : t('landing:search.useLocation')}
                    title={locationStatus === 'granted' ? t('landing:search.refreshLocation') : t('landing:search.useLocation')}
                  >
                    {locationLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}
                  </button>
                </label>
                <button type="submit" disabled={searching} className="inline-flex h-16 min-w-52 items-center justify-center gap-2 rounded-md bg-care-primary px-7 text-base font-bold text-care-surface hover:bg-care-primary-hover disabled:opacity-60">
                  {searching && <Loader2 className="h-5 w-5 animate-spin" />}
                  {searchMode === 'hospitals'
                    ? t('landing:search.findHospitals')
                    : searchMode === 'symptoms'
                      ? t('landing:search.checkSymptoms')
                      : t('landing:search.bookAppointment')}
                </button>
              </div>
              <div className="mt-4 flex flex-col gap-3 border-t border-care-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1" role="tablist" aria-label="Search type">
                  {[
                    ['all', t('landing:search.allCare')],
                    ['doctors', t('nav:doctors')],
                    ['hospitals', t('nav:hospitals')],
                    ['symptoms', t('landing:search.symptoms')],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={searchMode === value}
                      onClick={() => setSearchMode(value)}
                      className={`h-9 rounded-md px-3 text-xs font-semibold transition-colors ${
                        searchMode === value
                          ? 'bg-care-primary-subtle text-care-primary-hover'
                          : 'text-care-muted hover:bg-care-neutral'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex min-w-0 items-center gap-3 text-xs text-care-muted">
                  <Navigation className="h-4 w-4 shrink-0 text-care-primary-hover" />
                  <span className="min-w-0 truncate">{locationLabel}</span>
                  <button
                    type="button"
                    onClick={() => setMapPickerOpen(true)}
                    className="shrink-0 font-semibold text-care-primary-hover hover:underline"
                  >
                    {t('landing:search.setOnMap')}
                  </button>
                </div>
              </div>
              {locationSuggestionOpen && normalizeLocationInput(location).length >= 2 && (
                <div className="relative z-[90] mt-2 overflow-hidden rounded-lg border border-care-primary bg-care-surface shadow-2xl ring-1 ring-care-border">
                  <div className="border-b border-care-border bg-care-primary-subtle px-4 py-2 text-xs font-bold uppercase text-care-primary-hover">
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
          <div className="care-reveal mx-auto max-w-7xl px-5 py-16 sm:px-8">
            <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <span className="text-xs font-bold text-care-primary-hover">{t('landing:services.eyebrow')}</span>
                <h2 className="mt-2 text-3xl font-bold text-care-heading">{t('landing:services.title')}</h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-care-muted">{t('landing:services.copy')}</p>
            </div>
            <div className="care-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {quickServices.map(service => {
                const Icon = service.icon;
                const content = (
                  <>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-care-primary-subtle text-care-primary-hover"><Icon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm text-care-heading">{t(`landing:${service.titleKey}`)}</strong>
                      <span className="mt-1 block text-xs leading-5 text-care-muted">{t(`landing:${service.copyKey}`)}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-care-muted" />
                  </>
                );
                return service.href ? (
                  <a key={service.titleKey} href={service.href} className="care-action care-hover flex items-center gap-4 rounded-lg border border-care-border p-4 text-left hover:border-care-primary hover:bg-care-primary-subtle/40">{content}</a>
                ) : (
                  <button key={service.titleKey} type="button" onClick={() => chooseService(service)} className="care-action care-hover flex items-center gap-4 rounded-lg border border-care-border p-4 text-left hover:border-care-primary hover:bg-care-primary-subtle/40">{content}</button>
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
                <p className="mt-2 text-sm text-care-muted">
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
              <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg border border-care-danger bg-care-surface p-4 text-sm text-care-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {searchError}
              </div>
            )}

            {searching ? (
              <div className="flex min-h-52 items-center justify-center gap-3 text-care-muted"><Loader2 className="h-6 w-6 animate-spin text-care-primary" /> {t('landing:directory.searching')}</div>
            ) : (
              <div className="space-y-14">
                {(searchMode === 'all' || searchMode === 'doctors' || searchMode === 'symptoms') && (
                  <div>
                    <div className="mb-5 flex items-center justify-between">
                      <h3 className="text-xl font-bold text-care-heading">{t('landing:directory.doctorsTitle')}</h3>
                      <Link to="/login/patient" className="text-sm font-semibold text-care-primary-hover hover:underline">{t('landing:directory.viewFull')}</Link>
                    </div>
                    {doctors.length || directoryDoctors.length ? (
                      <div className="care-stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {doctors.slice(0, 6).map(doctor => (
                          <article key={`bookable-${doctor.id}`} className="care-hover flex flex-col rounded-lg border border-care-border bg-care-surface p-5 shadow-sm">
                            <div className="flex items-start gap-4">
                              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-care-primary-subtle text-care-heading"><Stethoscope className="h-6 w-6" /></span>
                              <div className="min-w-0">
                                <h4 className="font-bold text-care-heading">{doctor.fullName}</h4>
                                <p className="mt-1 text-sm font-semibold text-care-primary-hover">{doctor.specialization}</p>
                                <p className="mt-1 truncate text-xs text-care-muted">{doctor.hospital?.name || t('landing:directory.affiliatedClinic')}</p>
                                <DoctorRatingSummary
                                  ratingAvg={doctor.ratingAvg}
                                  ratingCount={doctor.ratingCount}
                                  className="mt-2"
                                />
                              </div>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <ResultBadge><BadgeCheck className="h-3 w-3" /> {t('landing:directory.activeProvider')}</ResultBadge>
                              {doctor.distance != null && <ResultBadge tone="blue">{doctor.distance.toFixed(1)} km</ResultBadge>}
                              {doctor.consultationFee > 0 && <ResultBadge tone="amber">INR {doctor.consultationFee}</ResultBadge>}
                            </div>
                            <div className="mt-5 border-t border-care-border pt-4">
                              <span className="text-[11px] font-bold text-care-muted">{t('landing:directory.nextAvailable')}</span>
                              <div className="mt-2 flex min-h-8 flex-wrap gap-2">
                                {doctor.nextAvailableSlots?.length ? doctor.nextAvailableSlots.map((slot, index) => (
                                  <span key={`${doctor.id}-${index}`} className="rounded-md bg-care-primary-subtle px-2 py-1 text-xs font-semibold text-care-primary-hover">{t('landing:directory.tomorrowSlot', { slot: formatSlot(slot) })}</span>
                                )) : <span className="text-xs text-care-muted">{t('landing:directory.contactClinic')}</span>}
                              </div>
                            </div>
                            <Link to={`/doctor/${doctor.id}`} className="care-action mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-care-primary text-sm font-semibold text-care-surface hover:bg-care-primary-hover">
                              {t('landing:directory.viewProfileSlots')} <ArrowRight className="h-4 w-4" />
                            </Link>
                          </article>
                        ))}
                        {doctors.length === 0 && directoryDoctors.slice(0, 6).map(doctor => (
                          <article key={`directory-${doctor.id}`} className="care-hover flex flex-col rounded-lg border border-care-border bg-care-surface p-5 shadow-sm">
                            <div className="flex items-start gap-4">
                              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-care-primary-subtle text-care-primary-hover"><User className="h-6 w-6" /></span>
                              <div>
                                <h4 className="font-bold text-care-heading">{doctor.fullName}</h4>
                                <p className="mt-1 text-sm font-semibold text-care-primary-hover">{doctor.specialization}</p>
                                <p className="mt-1 text-xs text-care-muted">{doctor.hospital?.name}</p>
                                <DoctorRatingSummary
                                  ratingAvg={doctor.ratingAvg}
                                  ratingCount={doctor.ratingCount}
                                  className="mt-2"
                                />
                              </div>
                            </div>
                            <div className="mt-4"><ResultBadge><BadgeCheck className="h-3 w-3" /> {t('landing:directory.source', { source: doctor.sourceName || t('landing:directory.verifiedDirectory') })}</ResultBadge></div>
                            <Link to={`/doctor/${doctor.id}`} className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-care-heading text-sm font-semibold text-care-heading hover:bg-care-primary-subtle">
                              {t('landing:directory.viewProfile')} <ArrowRight className="h-4 w-4" />
                            </Link>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-care-border bg-care-surface p-10 text-center text-sm text-care-muted">{t('landing:directory.noDoctors')}</div>
                    )}
                  </div>
                )}

                {(searchMode === 'all' || searchMode === 'hospitals' || searchMode === 'symptoms') && (
                  <div id="facilities">
                    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-care-heading">{t('landing:directory.hospitalsTitle')}</h3>
                        {hospitals.length > 0 && (
                          <p className="mt-1 text-sm text-care-muted">{t('landing:directory.facilitySummary', { visible: visibleHospitals.length, total: hospitals.length, location: activeLocationName })}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-4">
                        {hiddenHospitalCount > 0 && (
                          <button type="button" onClick={() => setShowAllHospitals(true)} className="inline-flex items-center gap-2 text-sm font-semibold text-care-heading hover:underline">
                            {t('landing:directory.showAll', { count: hospitals.length })}
                          </button>
                        )}
                        {showAllHospitals && hospitals.length > 8 && (
                          <button type="button" onClick={() => setShowAllHospitals(false)} className="inline-flex items-center gap-2 text-sm font-semibold text-care-heading hover:underline">
                            {t('landing:directory.showLess')}
                          </button>
                        )}
                        <button type="button" onClick={requestLocation} className="inline-flex items-center gap-2 text-sm font-semibold text-care-primary-hover hover:underline"><Navigation className="h-4 w-4" /> {t('landing:directory.findNearest')}</button>
                      </div>
                    </div>
                    {hospitals.length ? (
                      <div className="care-stagger grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {visibleHospitals.map(hospital => (
                          <article key={hospital.id} className="care-hover flex flex-col rounded-lg border border-care-border bg-care-surface p-5 shadow-sm">
                            <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-care-primary-subtle text-care-heading"><Building2 className="h-5 w-5" /></span>
                            <h4 className="font-bold leading-6 text-care-heading">{hospital.name}</h4>
                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-care-muted">{hospital.address || `${hospital.district || hospital.city}, ${hospital.state}`}</p>
                            <HospitalRatingSummary
                              ratingAvg={hospital.ratingAvg}
                              ratingCount={hospital.ratingCount}
                              googleRating={hospital.googleRating}
                              className="mt-3"
                            />
                            <HospitalOperatingHours operatingHours={hospital.operatingHours} compact className="mt-3" />
                            <div className="mt-4 flex flex-wrap gap-2">
                              <ResultBadge tone={hospital.verificationStatus === 'verified' ? 'teal' : 'blue'}>
                                <BadgeCheck className="h-3 w-3" /> {hospital.verificationStatus === 'verified' ? t('landing:facilityCard.verified') : hospital.verificationStatus === 'community-mapped' ? t('landing:facilityCard.communityMapped') : t('landing:facilityCard.publicDirectory')}
                              </ResultBadge>
                              {hospital.distance != null && <ResultBadge tone="blue">{hospital.distance.toFixed(1)} km</ResultBadge>}
                              <ResultBadge tone="blue">
                                <Stethoscope className="h-3 w-3" />
                                {t(hospitalDoctorCount(hospital) === 1 ? 'landing:facilityCard.doctorListed' : 'landing:facilityCard.doctorsListed', { count: hospitalDoctorCount(hospital) })}
                              </ResultBadge>
                            </div>
                            <p className="mt-4 text-xs text-care-muted">{formatFacilityType(hospital.hospitalType || hospital.careType, t)}</p>
                            <Link to={`/hospital/${hospital.id}`} className="mt-auto pt-5 text-sm font-semibold text-care-primary-hover hover:underline">{t('landing:facilityCard.viewFacilityDoctors')} <ArrowRight className="ml-1 inline h-4 w-4" /></Link>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-care-border bg-care-surface p-10 text-center text-sm text-care-muted">{t('landing:directory.noFacilities')}</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section id="trust" className="bg-care-surface">
          <div className="care-reveal mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:items-center">
            <div className="relative">
              <img src={consultationImage} alt="Doctor discussing a care plan with an older patient" className="aspect-[4/3] w-full rounded-lg object-cover" />
              <div className="absolute bottom-4 left-4 right-4 rounded-lg border border-care-border/70 bg-care-surface/95 p-4 shadow-lg sm:right-auto sm:max-w-xs">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-7 w-7 text-care-primary-hover" />
                  <div><strong className="block text-sm text-care-heading">{t('landing:trust.cardTitle')}</strong><span className="text-xs text-care-muted">{t('landing:trust.cardCopy')}</span></div>
                </div>
              </div>
            </div>
            <div>
              <span className="text-xs font-bold text-care-primary-hover">{t('landing:trust.eyebrow')}</span>
              <h2 className="mt-3 text-3xl font-bold leading-tight text-care-heading sm:text-4xl">{t('landing:trust.title')}</h2>
              <p className="mt-5 text-base leading-7 text-care-muted">{t('landing:trust.copy')}</p>
              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                {[
                  [t('landing:trust.verifiedTitle'), t('landing:trust.verifiedCopy')],
                  [t('landing:trust.availabilityTitle'), t('landing:trust.availabilityCopy')],
                  [t('landing:trust.privacyTitle'), t('landing:trust.privacyCopy')],
                  [t('landing:trust.discoveryTitle'), t('landing:trust.discoveryCopy')],
                ].map(([title, copy]) => (
                  <div key={title} className="flex gap-3">
                    <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-care-primary" />
                    <div><h3 className="text-sm font-bold text-care-heading">{title}</h3><p className="mt-1 text-sm leading-6 text-care-muted">{copy}</p></div>
                  </div>
                ))}
              </div>
              <a href="#search-results" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-care-primary px-5 py-3 text-sm font-semibold text-care-surface hover:bg-care-primary-hover">{t('landing:trust.cta')} <ArrowRight className="h-4 w-4" /></a>
            </div>
          </div>
        </section>

        <section className="bg-care-neutral">
          <div className="care-reveal mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <span className="text-xs font-bold text-care-primary-hover">{t('landing:more.eyebrow')}</span>
              <h2 className="mt-3 text-3xl font-bold text-care-heading">{t('landing:more.title')}</h2>
            </div>
            <div className="care-stagger grid gap-5 md:grid-cols-3">
              <article className="care-hover overflow-hidden rounded-lg border border-care-border bg-care-surface">
                <img src={diagnosticsImage} alt="Clinical team reviewing diagnostic results" className="aspect-[16/10] w-full object-cover" />
                <div className="p-5"><FlaskConical className="h-5 w-5 text-care-primary-hover" /><h3 className="mt-3 font-bold text-care-heading">{t('landing:more.diagnosticsTitle')}</h3><p className="mt-2 text-sm leading-6 text-care-muted">{t('landing:more.diagnosticsCopy')}</p><button type="button" onClick={() => { setSearchMode('hospitals'); setQuery('diagnostic'); document.querySelector('#care-search')?.scrollIntoView({ behavior: 'smooth' }); }} className="mt-4 text-sm font-semibold text-care-primary-hover">{t('landing:more.findDiagnostics')} <ArrowRight className="ml-1 inline h-4 w-4" /></button></div>
              </article>
              <article className="care-hover overflow-hidden rounded-lg border border-care-border bg-care-surface">
                <img src={heroImage} alt="Doctor meeting a patient at a clinic" className="aspect-[16/10] w-full object-cover object-[70%_center]" />
                <div className="p-5"><CalendarCheck2 className="h-5 w-5 text-care-primary-hover" /><h3 className="mt-3 font-bold text-care-heading">{t('landing:more.appointmentsTitle')}</h3><p className="mt-2 text-sm leading-6 text-care-muted">{t('landing:more.appointmentsCopy')}</p><button type="button" onClick={() => { setSearchMode('doctors'); document.querySelector('#care-search')?.scrollIntoView({ behavior: 'smooth' }); }} className="mt-4 text-sm font-semibold text-care-primary-hover">{t('landing:more.findAppointment')} <ArrowRight className="ml-1 inline h-4 w-4" /></button></div>
              </article>
              <article id="emergency" className="care-hover flex flex-col justify-between rounded-lg border border-care-heading bg-care-heading p-6 text-care-surface">
                <div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-care-surface/12"><PhoneCall className="h-5 w-5" /></span>
                  <h3 className="mt-6 text-xl font-bold">{t('landing:more.urgentTitle')}</h3>
                  <p className="mt-3 text-sm leading-6 text-care-primary-subtle">{t('landing:more.urgentCopy')}</p>
                </div>
                <div className="mt-8 space-y-3">
                  <button type="button" onClick={() => { setSearchMode('hospitals'); setQuery('emergency'); requestLocation(); }} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-care-surface px-4 py-3 text-sm font-bold text-care-heading"><Cross className="h-4 w-4" /> {t('landing:more.findEmergency')}</button>
                  <p className="text-center text-xs text-care-primary-subtle">{t('landing:more.emergencyNote')}</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="health-guides" className="bg-care-surface">
          <div className="care-reveal mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <div className="mb-9 flex flex-col justify-between gap-4 md:flex-row md:items-end">
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
          <div className="care-reveal mx-auto flex max-w-7xl flex-col gap-7 px-5 py-12 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl"><span className="text-xs font-bold text-care-primary-hover">{t('landing:teams.eyebrow')}</span><h2 className="mt-2 text-2xl font-bold text-care-heading">{t('landing:teams.title')}</h2><p className="mt-2 text-sm leading-6 text-care-muted">{t('landing:teams.copy')}</p></div>
            <div className="flex flex-wrap gap-2">
              <Link to="/login/patient" className="rounded-lg border border-care-border bg-care-surface px-4 py-2.5 text-sm font-semibold text-care-heading hover:bg-care-neutral">{t('landing:teams.patientPortal')}</Link>
              <Link to="/login/doctor" className="rounded-lg border border-care-border bg-care-surface px-4 py-2.5 text-sm font-semibold text-care-heading hover:bg-care-neutral">{t('landing:teams.doctorPortal')}</Link>
              <Link to="/login/admin" className="rounded-lg bg-care-primary px-4 py-2.5 text-sm font-semibold text-care-surface hover:bg-care-primary-hover">{t('landing:teams.hospitalPortal')}</Link>
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
            <div><h3 className="text-sm font-bold">{t('landing:footer.language')}</h3><div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-care-border/20 px-3 py-2 text-sm text-care-primary-subtle"><Languages className="h-4 w-4" /> {t('landing:footer.localeName')}</div></div>
          </div>
          <div className="mt-10 flex flex-col gap-4 border-t border-care-border/15 pt-6 text-xs text-care-primary-subtle sm:flex-row sm:items-center sm:justify-between">
            <span>{t('landing:footer.disclaimer')}</span>
            <nav className="flex gap-5" aria-label={t('landing:footer.legal')}><Link to="/legal/privacy">{t('landing:footer.privacy')}</Link><Link to="/legal/terms">{t('landing:footer.terms')}</Link><Link to="/legal/security">{t('landing:footer.security')}</Link></nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
