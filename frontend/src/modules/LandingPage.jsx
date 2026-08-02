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
import heroImage from '../assets/caresync-clinic-hero.jpg';
import consultationImage from '../assets/care-consultation.jpg';
import { DoctorRatingSummary, HospitalRatingSummary } from '../shared/HospitalRating';
import HospitalOperatingHours from '../shared/HospitalOperatingHours';
import { enrichHospitalsWithGoogleRatings } from '../lib/googleHospitalRatings';
import diagnosticsImage from '../assets/care-diagnostics.jpg';
import { API_URL } from '../lib/api';

const LOCATION_SESSION_KEY = 'caresync-public-location';

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
  { title: 'Find a doctor', copy: 'Browse by specialty and availability', icon: Stethoscope, mode: 'doctors' },
  { title: 'Find hospitals', copy: 'Explore clinics and hospitals near you', icon: Building2, mode: 'hospitals' },
  { title: 'Symptom guidance', copy: 'Match symptoms to a suitable specialty', icon: Sparkles, mode: 'symptoms' },
  { title: 'Book a clinic visit', copy: 'Reserve an in-person appointment', icon: CalendarCheck2, mode: 'doctors' },
  { title: 'Diagnostic centres', copy: 'Find testing and imaging facilities', icon: FlaskConical, mode: 'hospitals' },
  { title: 'Emergency care', copy: 'Locate urgent medical help quickly', icon: HeartPulse, href: '#emergency' },
];

const guides = [
  {
    tag: 'Seasonal health',
    title: 'Fever: when home care is enough and when to seek help',
    copy: 'Understand warning signs, hydration basics, and when a clinician should evaluate persistent fever.',
  },
  {
    tag: 'Heart health',
    title: 'Recognising symptoms that need urgent cardiac attention',
    copy: 'Chest pressure, breathlessness, fainting, and radiating pain should never be ignored.',
  },
  {
    tag: 'Family care',
    title: 'Preparing for a child’s first doctor appointment',
    copy: 'Bring symptom timing, current medicines, vaccination records, and questions for the pediatrician.',
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
    <Link to="/" className="inline-flex items-center gap-3" aria-label="CareSync home">
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${light ? 'bg-care-surface text-care-heading' : 'bg-care-primary text-care-surface'}`}>
        <span className="relative h-6 w-6" aria-hidden="true">
          <Activity className="care-logo-pulse-base absolute inset-0 h-6 w-6" strokeWidth={2.5} />
          <Activity className="care-logo-pulse-scan absolute inset-0 h-6 w-6" strokeWidth={2.5} />
        </span>
      </span>
      <span className={`care-logo-word-shine ${light ? 'care-logo-word-shine-light text-care-surface' : 'text-care-heading'} text-xl font-bold`}>CareSync</span>
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
  const initialLocationRef = useRef(loadLocationSelection());
  const initialLocation = initialLocationRef.current;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [searchMode, setSearchMode] = useState('all');
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState(initialLocation?.location || 'Delhi');
  const [coordinates, setCoordinates] = useState(initialLocation?.coordinates || null);
  const [locationLabel, setLocationLabel] = useState(initialLocation?.locationLabel || 'Choose current location or enter another locality');
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
  const [searchSummary, setSearchSummary] = useState('Care around India');
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
              throw new Error(officialResult.data.error?.message || 'Could not load facilities');
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
      setSearchSummary(`${requestedCoordinates ? `Care near ${requestedLocation || 'your current location'}` : `Care around ${requestedLocation || 'India'}`}${matchedSpecialty}`);
    } catch (error) {
      setSearchError(error.message || 'Search is temporarily unavailable');
    } finally {
      setSearching(false);
    }
  }, [coordinates, location, query, searchMode, specializations, tomorrow]);

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
      setLocationLabel('Location is not supported. Enter a city or locality.');
      setLocationLoading(false);
      setSearchError('Location is not supported by this browser. Enter a city instead.');
      if (fallbackToDelhi) {
        setLocation('Delhi');
        setLocationLabel('Delhi');
        runSearch({ requestedLocation: 'Delhi', requestedCoordinates: null });
      }
      return;
    }

    setSearchError('');
    setLocationStatus('requesting');
    setLocationLabel('Allow location access to find care near you');
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async position => {
        const selectedCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        const accuracy = Math.round(position.coords.accuracy);
        let resolvedLabel = 'Current location';

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
  }, [query, runSearch, searchMode]);

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
  const activeLocationName = coordinates ? locationLabel : location || 'India';
  const directoryHeading = searchSummary.includes(activeLocationName)
    ? searchSummary
    : `${coordinates ? 'Care near' : 'Care around'} ${activeLocationName}`;
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
            <h2 id="location-permission-title" className="mt-5 text-2xl font-bold text-care-heading">Find care near your live location?</h2>
            <p className="mt-3 text-sm leading-6 text-care-muted">Allow CareSync to use your device location for accurate nearby hospitals and doctors. Your browser will ask for permission next. If GPS is blocked, CareSync will use your approximate city, and you can still enter another location.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => { setLocationPromptOpen(false); requestLocation(); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-care-primary px-4 text-sm font-bold text-care-surface hover:bg-care-primary-hover">
                <Navigation className="h-4 w-4" /> Use current location
              </button>
              <button type="button" onClick={() => { window.sessionStorage.removeItem(LOCATION_SESSION_KEY); setLocationPromptOpen(false); setLocation(''); setCoordinates(null); setLocationStatus('manual'); setLocationLabel('Enter an exact area, neighbourhood, landmark, or address'); window.setTimeout(() => locationInputRef.current?.focus(), 50); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-care-border px-4 text-sm font-semibold text-care-body hover:bg-care-neutral">
                <MapPin className="h-4 w-4" /> Choose another
              </button>
            </div>
            <p className="mt-4 text-xs leading-5 text-care-muted">Location is used for this care search. Personal health information remains protected behind sign-in.</p>
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
        <div className="care-navbar-inner">
          <PublicLogo />
          <nav className="hidden items-center gap-7 text-sm font-semibold text-care-muted lg:flex" aria-label="Primary navigation">
            <a href="#services" className="hover:text-care-primary-hover">Services</a>
            <a href="#search-results" className="hover:text-care-primary-hover">Doctors</a>
            <a href="#facilities" className="hover:text-care-primary-hover">Hospitals</a>
            <a href="#health-guides" className="hover:text-care-primary-hover">Health guides</a>
            <a href="#trust" className="hover:text-care-primary-hover">Why CareSync</a>
          </nav>
          <div className="hidden items-center gap-2 sm:flex">
            <Link to="/login/patient" className="rounded-lg px-4 py-2.5 text-sm font-semibold text-care-body hover:bg-care-neutral">Sign in</Link>
            <Link to="/signup/patient" className="rounded-lg bg-care-primary px-4 py-2.5 text-sm font-semibold text-care-surface hover:bg-care-primary-hover">Create account</Link>
          </div>
          <button type="button" onClick={() => setMobileMenuOpen(value => !value)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-care-border text-care-body lg:hidden" aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}>
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <nav className="border-t border-care-border bg-care-surface px-5 py-4 lg:hidden" aria-label="Mobile navigation">
            <div className="grid gap-1 text-sm font-semibold text-care-body">
              <a href="#services" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-care-neutral">Services</a>
              <a href="#search-results" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-care-neutral">Find care</a>
              <a href="#health-guides" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-care-neutral">Health guides</a>
              <Link to="/login/patient" className="mt-2 rounded-lg bg-care-primary px-3 py-3 text-center text-care-surface hover:bg-care-primary-hover">Sign in</Link>
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
                Verified healthcare discovery across India
              </span>
              <h1 className="text-4xl font-bold leading-[1.08] text-care-surface sm:text-5xl lg:text-6xl">The right care, closer than you think.</h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-care-primary-subtle">Search doctors, hospitals, specialists, or symptoms. Review trustworthy public information before you create an account.</p>
              <div className="mt-8 hidden flex-wrap gap-4 text-sm text-care-primary-subtle sm:flex">
                <span className="inline-flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-care-primary" /> Source-labelled providers</span>
                <span className="inline-flex items-center gap-2"><CalendarCheck2 className="h-4 w-4 text-care-primary" /> Availability previews</span>
                <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-care-primary" /> Location-aware results</span>
              </div>
            </div>
          </div>

          <div id="care-search" className="absolute inset-x-0 bottom-0 z-10 mx-auto max-w-7xl px-5 sm:px-8">
            <form onSubmit={handleSearch} className="public-search-dock overflow-visible rounded-lg border border-care-border bg-care-surface p-5 shadow-xl sm:p-8">
              <div className="grid gap-3 lg:grid-cols-[minmax(280px,1.08fr)_minmax(280px,1.08fr)_minmax(250px,0.94fr)]">
                <label className="relative">
                  <span className="sr-only">Search for doctor or specialty</span>
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-care-heading" />
                  <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={searchMode === 'symptoms' ? 'Describe your symptoms' : 'Search for Doctor or Speciality'}
                    className="h-16 w-full rounded-md border border-care-border bg-care-surface pl-14 pr-4 text-base text-care-body outline-none placeholder:text-care-muted focus:border-care-primary focus:ring-4 focus:ring-care-primary"
                  />
                </label>
                <label className="relative">
                  <span className="sr-only">Select location</span>
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
                      setLocationLabel(nextLocation || 'Enter an exact area, neighbourhood, landmark, or address');
                      setLocationSuggestionOpen(true);
                    }}
                    placeholder="Select Location"
                    className="h-16 w-full rounded-md border border-care-border bg-care-surface pl-14 pr-12 text-base text-care-body outline-none placeholder:text-care-muted focus:border-care-primary focus:ring-4 focus:ring-care-primary"
                  />
                  <button
                    type="button"
                    onClick={() => requestLocation()}
                    disabled={locationLoading}
                    className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-care-heading hover:text-care-primary-hover disabled:opacity-50"
                    aria-label={locationStatus === 'granted' ? 'Refresh current location' : 'Use my current location'}
                    title={locationStatus === 'granted' ? 'Refresh current location' : 'Use my current location'}
                  >
                    {locationLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}
                  </button>
                </label>
                <button type="submit" disabled={searching} className="inline-flex h-16 min-w-52 items-center justify-center gap-2 rounded-md bg-care-primary px-7 text-base font-bold text-care-surface hover:bg-care-primary-hover disabled:opacity-60">
                  {searching && <Loader2 className="h-5 w-5 animate-spin" />}
                  {searchMode === 'hospitals'
                    ? 'Find Hospitals'
                    : searchMode === 'symptoms'
                      ? 'Check Symptoms'
                      : 'Book an Appointment'}
                </button>
              </div>
              <div className="mt-4 flex flex-col gap-3 border-t border-care-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1" role="tablist" aria-label="Search type">
                  {[
                    ['all', 'All care'],
                    ['doctors', 'Doctors'],
                    ['hospitals', 'Hospitals'],
                    ['symptoms', 'Symptoms'],
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
                    Set on map
                  </button>
                </div>
              </div>
              {locationSuggestionOpen && normalizeLocationInput(location).length >= 2 && (
                <div className="relative z-[90] mt-2 overflow-hidden rounded-lg border border-care-primary bg-care-surface shadow-2xl ring-1 ring-care-border">
                  <div className="border-b border-care-border bg-care-primary-subtle px-4 py-2 text-xs font-bold uppercase text-care-primary-hover">
                    Select a location
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
                                ? 'Google Maps location'
                                : suggestion.provider === 'openstreetmap'
                                  ? 'Map location'
                                  : suggestion.type
                                    ? Number.isFinite(suggestion.hospitalCount)
                                      ? `${suggestion.type} - ${suggestion.hospitalCount} nearby directory listings`
                                      : `${suggestion.type} location`
                                    : 'Directory location'}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-3 text-sm text-care-muted">
                      Keep typing a locality, landmark, village, or city.
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
                <span className="text-xs font-bold text-care-primary-hover">START WITH WHAT YOU NEED</span>
                <h2 className="mt-2 text-3xl font-bold text-care-heading">Healthcare without the runaround</h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-care-muted">Explore real public directory information first. Sign in only when you are ready to book or manage personal health information.</p>
            </div>
            <div className="care-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {quickServices.map(service => {
                const Icon = service.icon;
                const content = (
                  <>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-care-primary-subtle text-care-primary-hover"><Icon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm text-care-heading">{service.title}</strong>
                      <span className="mt-1 block text-xs leading-5 text-care-muted">{service.copy}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-care-muted" />
                  </>
                );
                return service.href ? (
                  <a key={service.title} href={service.href} className="care-action care-hover flex items-center gap-4 rounded-lg border border-care-border p-4 text-left hover:border-care-primary hover:bg-care-primary-subtle/40">{content}</a>
                ) : (
                  <button key={service.title} type="button" onClick={() => chooseService(service)} className="care-action care-hover flex items-center gap-4 rounded-lg border border-care-border p-4 text-left hover:border-care-primary hover:bg-care-primary-subtle/40">{content}</button>
                );
              })}
            </div>
          </div>
        </section>

        <section id="search-results" className="bg-care-neutral">
          <div className="care-reveal mx-auto max-w-7xl px-5 py-16 sm:px-8">
            <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <span className="text-xs font-bold text-care-primary-hover">PUBLIC CARE DIRECTORY</span>
                <h2 className="mt-2 text-3xl font-bold text-care-heading">{directoryHeading}</h2>
                <p className="mt-2 text-sm text-care-muted">{searching ? 'Checking current directory information...' : `${resultCount} relevant listings shown · ${activeLocationName}`}</p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-care-border bg-care-surface px-3 py-2 text-xs font-semibold text-care-muted">
                <BadgeCheck className="h-4 w-4 text-care-primary-hover" />
                Every listing shows its verification source
              </div>
            </div>

            {searchError && (
              <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg border border-care-danger bg-care-surface p-4 text-sm text-care-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {searchError}
              </div>
            )}

            {searching ? (
              <div className="flex min-h-52 items-center justify-center gap-3 text-care-muted"><Loader2 className="h-6 w-6 animate-spin text-care-primary" /> Searching CareSync directory...</div>
            ) : (
              <div className="space-y-14">
                {(searchMode === 'all' || searchMode === 'doctors' || searchMode === 'symptoms') && (
                  <div>
                    <div className="mb-5 flex items-center justify-between">
                      <h3 className="text-xl font-bold text-care-heading">Doctors and specialists</h3>
                      <Link to="/login/patient" className="text-sm font-semibold text-care-primary-hover hover:underline">View full directory</Link>
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
                                <p className="mt-1 truncate text-xs text-care-muted">{doctor.hospital?.name || 'Affiliated clinic'}</p>
                                <DoctorRatingSummary
                                  ratingAvg={doctor.ratingAvg}
                                  ratingCount={doctor.ratingCount}
                                  className="mt-2"
                                />
                              </div>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <ResultBadge><BadgeCheck className="h-3 w-3" /> CareSync active</ResultBadge>
                              {doctor.distance != null && <ResultBadge tone="blue">{doctor.distance.toFixed(1)} km</ResultBadge>}
                              {doctor.consultationFee > 0 && <ResultBadge tone="amber">INR {doctor.consultationFee}</ResultBadge>}
                            </div>
                            <div className="mt-5 border-t border-care-border pt-4">
                              <span className="text-[11px] font-bold text-care-muted">NEXT AVAILABLE</span>
                              <div className="mt-2 flex min-h-8 flex-wrap gap-2">
                                {doctor.nextAvailableSlots?.length ? doctor.nextAvailableSlots.map((slot, index) => (
                                  <span key={`${doctor.id}-${index}`} className="rounded-md bg-care-primary-subtle px-2 py-1 text-xs font-semibold text-care-primary-hover">Tomorrow {formatSlot(slot)}</span>
                                )) : <span className="text-xs text-care-muted">Contact clinic for the next opening</span>}
                              </div>
                            </div>
                            <Link to={`/doctor/${doctor.id}`} className="care-action mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-care-primary text-sm font-semibold text-care-surface hover:bg-care-primary-hover">
                              View profile and slots <ArrowRight className="h-4 w-4" />
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
                            <div className="mt-4"><ResultBadge><BadgeCheck className="h-3 w-3" /> Source: {doctor.sourceName || 'Verified directory'}</ResultBadge></div>
                            <Link to={`/doctor/${doctor.id}`} className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-care-heading text-sm font-semibold text-care-heading hover:bg-care-primary-subtle">
                              View profile <ArrowRight className="h-4 w-4" />
                            </Link>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-care-border bg-care-surface p-10 text-center text-sm text-care-muted">No matching doctors were found. Try a broader specialty or nearby city.</div>
                    )}
                  </div>
                )}

                {(searchMode === 'all' || searchMode === 'hospitals' || searchMode === 'symptoms') && (
                  <div id="facilities">
                    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-care-heading">Hospitals and clinics</h3>
                        {hospitals.length > 0 && (
                          <p className="mt-1 text-sm text-care-muted">Showing {visibleHospitals.length} of {hospitals.length} facilities near {activeLocationName}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-4">
                        {hiddenHospitalCount > 0 && (
                          <button type="button" onClick={() => setShowAllHospitals(true)} className="inline-flex items-center gap-2 text-sm font-semibold text-care-heading hover:underline">
                            Show all {hospitals.length}
                          </button>
                        )}
                        {showAllHospitals && hospitals.length > 8 && (
                          <button type="button" onClick={() => setShowAllHospitals(false)} className="inline-flex items-center gap-2 text-sm font-semibold text-care-heading hover:underline">
                            Show less
                          </button>
                        )}
                        <button type="button" onClick={requestLocation} className="inline-flex items-center gap-2 text-sm font-semibold text-care-primary-hover hover:underline"><Navigation className="h-4 w-4" /> Find nearest</button>
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
                                <BadgeCheck className="h-3 w-3" /> {hospital.verificationStatus === 'verified' ? 'Verified' : hospital.verificationStatus === 'community-mapped' ? 'Community mapped' : 'Public directory'}
                              </ResultBadge>
                              {hospital.distance != null && <ResultBadge tone="blue">{hospital.distance.toFixed(1)} km</ResultBadge>}
                              <ResultBadge tone="blue">
                                <Stethoscope className="h-3 w-3" />
                                {hospitalDoctorCount(hospital)} {hospitalDoctorCount(hospital) === 1 ? 'doctor' : 'doctors'} listed
                              </ResultBadge>
                            </div>
                            <p className="mt-4 text-xs text-care-muted">{hospital.hospitalType || hospital.careType || 'Healthcare facility'}</p>
                            <Link to={`/hospital/${hospital.id}`} className="mt-auto pt-5 text-sm font-semibold text-care-primary-hover hover:underline">View facility and doctors <ArrowRight className="ml-1 inline h-4 w-4" /></Link>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-care-border bg-care-surface p-10 text-center text-sm text-care-muted">No facilities matched this search. Try a nearby landmark, area, city, or district name.</div>
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
                  <div><strong className="block text-sm text-care-heading">Transparent care information</strong><span className="text-xs text-care-muted">Source, verification, and update status shown clearly</span></div>
                </div>
              </div>
            </div>
            <div>
              <span className="text-xs font-bold text-care-primary-hover">WHY CARESYNC</span>
              <h2 className="mt-3 text-3xl font-bold leading-tight text-care-heading sm:text-4xl">Confidence begins before the appointment.</h2>
              <p className="mt-5 text-base leading-7 text-care-muted">CareSync separates bookable providers, source-verified public listings, and community discovery leads so you always know what kind of information you are viewing.</p>
              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                {[
                  ['Verified identities', 'Provider and facility verification is shown, never implied.'],
                  ['Real availability', 'Published CareSync slots are separated from public clinic schedules.'],
                  ['Privacy by design', 'Browsing is public; personal records remain behind secure sign-in.'],
                  ['India-wide discovery', 'Search supports cities, districts, and location-based results.'],
                ].map(([title, copy]) => (
                  <div key={title} className="flex gap-3">
                    <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-care-primary" />
                    <div><h3 className="text-sm font-bold text-care-heading">{title}</h3><p className="mt-1 text-sm leading-6 text-care-muted">{copy}</p></div>
                  </div>
                ))}
              </div>
              <a href="#search-results" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-care-primary px-5 py-3 text-sm font-semibold text-care-surface hover:bg-care-primary-hover">Explore verified care <ArrowRight className="h-4 w-4" /></a>
            </div>
          </div>
        </section>

        <section className="bg-care-neutral">
          <div className="care-reveal mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <span className="text-xs font-bold text-care-primary-hover">MORE WAYS TO GET CARE</span>
              <h2 className="mt-3 text-3xl font-bold text-care-heading">Support for every step of your care journey</h2>
            </div>
            <div className="care-stagger grid gap-5 md:grid-cols-3">
              <article className="care-hover overflow-hidden rounded-lg border border-care-border bg-care-surface">
                <img src={diagnosticsImage} alt="Clinical team reviewing diagnostic results" className="aspect-[16/10] w-full object-cover" />
                <div className="p-5"><FlaskConical className="h-5 w-5 text-care-primary-hover" /><h3 className="mt-3 font-bold text-care-heading">Diagnostics and testing</h3><p className="mt-2 text-sm leading-6 text-care-muted">Discover hospitals and centres offering laboratory and imaging services.</p><button type="button" onClick={() => { setSearchMode('hospitals'); setQuery('diagnostic'); document.querySelector('#care-search')?.scrollIntoView({ behavior: 'smooth' }); }} className="mt-4 text-sm font-semibold text-care-primary-hover">Find diagnostic care <ArrowRight className="ml-1 inline h-4 w-4" /></button></div>
              </article>
              <article className="care-hover overflow-hidden rounded-lg border border-care-border bg-care-surface">
                <img src={heroImage} alt="Doctor meeting a patient at a clinic" className="aspect-[16/10] w-full object-cover object-[70%_center]" />
                <div className="p-5"><CalendarCheck2 className="h-5 w-5 text-care-primary-hover" /><h3 className="mt-3 font-bold text-care-heading">In-person appointments</h3><p className="mt-2 text-sm leading-6 text-care-muted">Choose a doctor, hospital or clinic, and an available time for a physical visit.</p><button type="button" onClick={() => { setSearchMode('doctors'); document.querySelector('#care-search')?.scrollIntoView({ behavior: 'smooth' }); }} className="mt-4 text-sm font-semibold text-care-primary-hover">Find an appointment <ArrowRight className="ml-1 inline h-4 w-4" /></button></div>
              </article>
              <article id="emergency" className="care-hover flex flex-col justify-between rounded-lg border border-care-heading bg-care-heading p-6 text-care-surface">
                <div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-care-surface/12"><PhoneCall className="h-5 w-5" /></span>
                  <h3 className="mt-6 text-xl font-bold">Need urgent medical care?</h3>
                  <p className="mt-3 text-sm leading-6 text-care-primary-subtle">For severe chest pain, breathing difficulty, unconsciousness, major bleeding, or stroke symptoms, contact local emergency services immediately.</p>
                </div>
                <div className="mt-8 space-y-3">
                  <button type="button" onClick={() => { setSearchMode('hospitals'); setQuery('emergency'); requestLocation(); }} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-care-surface px-4 py-3 text-sm font-bold text-care-heading"><Cross className="h-4 w-4" /> Find nearby emergency care</button>
                  <p className="text-center text-xs text-care-primary-subtle">CareSync is not an emergency response service.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="health-guides" className="bg-care-surface">
          <div className="care-reveal mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <div className="mb-9 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div><span className="text-xs font-bold text-care-primary-hover">HEALTH GUIDES</span><h2 className="mt-3 text-3xl font-bold text-care-heading">Clear information for everyday decisions</h2></div>
              <div className="inline-flex items-center gap-2 text-xs text-care-muted"><ShieldCheck className="h-4 w-4 text-care-primary-hover" /> Editorial content requires clinical review before publication</div>
            </div>
            <div className="care-stagger grid gap-4 md:grid-cols-3">
              {guides.map(guide => (
                <article key={guide.title} className="care-hover rounded-lg border border-care-border p-6">
                  <span className="text-xs font-bold text-care-primary-hover">{guide.tag}</span>
                  <h3 className="mt-3 text-lg font-bold leading-7 text-care-heading">{guide.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-care-muted">{guide.copy}</p>
                  <Link to="/login/patient" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-care-heading">Read guide <ArrowRight className="h-4 w-4" /></Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-care-border bg-care-neutral">
          <div className="care-reveal mx-auto flex max-w-7xl flex-col gap-7 px-5 py-12 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl"><span className="text-xs font-bold text-care-primary-hover">CARE TEAMS</span><h2 className="mt-2 text-2xl font-bold text-care-heading">A dedicated workspace for every role</h2><p className="mt-2 text-sm leading-6 text-care-muted">Patients book physical visits, doctors manage clinic appointments, and hospitals coordinate teams through separate secure portals.</p></div>
            <div className="flex flex-wrap gap-2">
              <Link to="/login/patient" className="rounded-lg border border-care-border bg-care-surface px-4 py-2.5 text-sm font-semibold text-care-heading hover:bg-care-neutral">Patient portal</Link>
              <Link to="/login/doctor" className="rounded-lg border border-care-border bg-care-surface px-4 py-2.5 text-sm font-semibold text-care-heading hover:bg-care-neutral">Doctor portal</Link>
              <Link to="/login/admin" className="rounded-lg bg-care-primary px-4 py-2.5 text-sm font-semibold text-care-surface hover:bg-care-primary-hover">Hospital portal</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-care-heading text-care-surface">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div><PublicLogo light /><p className="mt-4 max-w-sm text-sm leading-6 text-care-primary-subtle">A transparent healthcare discovery and appointment network for patients, doctors, and hospitals across India.</p></div>
            <div><h3 className="text-sm font-bold">Find care</h3><div className="mt-4 grid gap-2 text-sm text-care-primary-subtle"><a href="#search-results">Doctors</a><a href="#facilities">Hospitals</a><a href="#services">Services</a><a href="#emergency">Emergency guidance</a></div></div>
            <div><h3 className="text-sm font-bold">CareSync</h3><div className="mt-4 grid gap-2 text-sm text-care-primary-subtle"><a href="#trust">How verification works</a><a href="#health-guides">Health guides</a><Link to="/login/doctor">For doctors</Link><Link to="/login/admin">For hospitals</Link></div></div>
            <div><h3 className="text-sm font-bold">Language</h3><div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-care-border/20 px-3 py-2 text-sm text-care-primary-subtle"><Languages className="h-4 w-4" /> English · India</div></div>
          </div>
          <div className="mt-10 flex flex-col gap-4 border-t border-care-border/15 pt-6 text-xs text-care-primary-subtle sm:flex-row sm:items-center sm:justify-between">
            <span>&copy; 2026 CareSync Platform. Healthcare information is not a substitute for medical advice.</span>
            <nav className="flex gap-5" aria-label="Legal"><Link to="/legal/privacy">Privacy</Link><Link to="/legal/terms">Terms</Link><Link to="/legal/security">Security</Link></nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
