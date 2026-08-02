import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Activity, MapPin, Search, ShieldAlert, Loader2, Navigation, Compass, Award, Stethoscope, AlertTriangle, SlidersHorizontal, ExternalLink, Building2, CalendarPlus, Crosshair, X, ArrowLeft, ClipboardList, UserRoundSearch, CheckCircle2 } from 'lucide-react';
import { Circle, MapContainer, TileLayer, Marker, Popup, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import PublicAvailability from '../../shared/PublicAvailability';
import HospitalOperatingHours from '../../shared/HospitalOperatingHours';
import OutbreakAlert from '../../shared/OutbreakAlert';
import { DoctorRatingSummary, HospitalRatingSummary } from '../../shared/HospitalRating';
import { enrichHospitalsWithGoogleRatings } from '../../lib/googleHospitalRatings';
import { Avatar, Badge, Card, CardSkeleton, buttonStyles } from '../../shared/ui';
import { productionSafe } from '../../lib/developmentFixtures';
import PatientPortalHeader from '../../shared/PatientPortalHeader';
import { LEGACY_LOCATION_KEY, patientLocationStorageKey } from '../../lib/patientSession';
import { API_URL } from '../../lib/api';

function loadSavedLocation(userId) {
  try {
    const savedValue = window.localStorage.getItem(patientLocationStorageKey(userId)) ||
      window.sessionStorage.getItem(LEGACY_LOCATION_KEY);
    const saved = JSON.parse(savedValue);
    if (!saved?.location) return null;

    const latitude = Number(saved.coordinates?.latitude);
    const longitude = Number(saved.coordinates?.longitude);
    const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
    const displayDistrict = Object.prototype.hasOwnProperty.call(saved, 'district')
      ? saved.district
      : null;
    return {
      place: String(saved.location),
      label: String(saved.locationLabel || saved.location),
      state: saved.state
        ? String(saved.state)
        : stateForLocation(String(saved.locationLabel || saved.location)),
      district: Object.prototype.hasOwnProperty.call(saved, 'district')
        ? (
          saved.district &&
          !(
            stateForLocation(String(saved.locationLabel || saved.location)) === 'Delhi' &&
            String(saved.district).toLowerCase() === placeForSearch(saved.location).toLowerCase()
          )
            ? String(saved.district)
            : null
        )
        : (
          placeForSearch(saved.locationLabel || saved.location).toLowerCase() ===
          placeForSearch(saved.location).toLowerCase()
            ? placeForSearch(saved.location)
            : null
        ),
      queryDistrict: Object.prototype.hasOwnProperty.call(saved, 'queryDistrict')
        ? (saved.queryDistrict ? String(saved.queryDistrict) : null)
        : (hasCoordinates ? null : (displayDistrict ? String(displayDistrict) : null)),
      coordinates: hasCoordinates
        ? [latitude, longitude]
        : null
    };
  } catch {
    return null;
  }
}

function placeForSearch(value) {
  return String(value || '').split(',')[0].trim();
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

const searchableLocations = [
  { name: 'Connaught Place, Central Delhi', coords: [28.6315, 77.2167] },
  { name: 'Saket, South Delhi', coords: [28.5245, 77.2066] },
  { name: 'Janakpuri, West Delhi', coords: [28.6219, 77.0878] },
  { name: 'Shahdara, East Delhi', coords: [28.6733, 77.2890] },
  { name: 'Dwarka, Delhi', coords: [28.5921, 77.0460] },
  { name: 'Rohini, Delhi', coords: [28.7041, 77.1025] },
  { name: 'Vasant Kunj, Delhi', coords: [28.5293, 77.1484] },
  { name: 'Karol Bagh, Delhi', coords: [28.6519, 77.1909] },
  { name: 'Lajpat Nagar, Delhi', coords: [28.5677, 77.2433] },
  { name: 'Rajouri Garden, Delhi', coords: [28.6415, 77.1209] },
  { name: 'Pitampura, Delhi', coords: [28.6942, 77.1314] },
  { name: 'Hauz Khas, Delhi', coords: [28.5494, 77.2001] },
  { name: 'Chandni Chowk, Delhi', coords: [28.6506, 77.2303] },
  { name: 'Mayur Vihar, Delhi', coords: [28.6093, 77.2960] },
  { name: 'Nehru Place, Delhi', coords: [28.5491, 77.2532] },
  { name: 'Noida Sector 18, NCR', coords: [28.5708, 77.3261] },
  { name: 'Gurugram, NCR', coords: [28.4595, 77.0266] },
  { name: 'Faridabad, NCR', coords: [28.4089, 77.3178] },
  { name: 'Ghaziabad, NCR', coords: [28.6692, 77.4538] },
  { name: 'Mumbai, Maharashtra', coords: [19.0760, 72.8777] },
  { name: 'Pune, Maharashtra', coords: [18.5204, 73.8567] },
  { name: 'Nagpur, Maharashtra', coords: [21.1458, 79.0882] },
  { name: 'Bengaluru, Karnataka', coords: [12.9716, 77.5946] },
  { name: 'Mysuru, Karnataka', coords: [12.2958, 76.6394] },
  { name: 'Chennai, Tamil Nadu', coords: [13.0827, 80.2707] },
  { name: 'Coimbatore, Tamil Nadu', coords: [11.0168, 76.9558] },
  { name: 'Hyderabad, Telangana', coords: [17.3850, 78.4867] },
  { name: 'Kolkata, West Bengal', coords: [22.5726, 88.3639] },
  { name: 'Ahmedabad, Gujarat', coords: [23.0225, 72.5714] },
  { name: 'Surat, Gujarat', coords: [21.1702, 72.8311] },
  { name: 'Jaipur, Rajasthan', coords: [26.9124, 75.7873] },
  { name: 'Lucknow, Uttar Pradesh', coords: [26.8467, 80.9462] },
  { name: 'Kanpur, Uttar Pradesh', coords: [26.4499, 80.3319] },
  { name: 'Varanasi, Uttar Pradesh', coords: [25.3176, 82.9739] },
  { name: 'Patna, Bihar', coords: [25.5941, 85.1376] },
  { name: 'Bhopal, Madhya Pradesh', coords: [23.2599, 77.4126] },
  { name: 'Indore, Madhya Pradesh', coords: [22.7196, 75.8577] },
  { name: 'Bhubaneswar, Odisha', coords: [20.2961, 85.8245] },
  { name: 'Kochi, Kerala', coords: [9.9312, 76.2673] },
  { name: 'Thiruvananthapuram, Kerala', coords: [8.5241, 76.9366] },
  { name: 'Chandigarh', coords: [30.7333, 76.7794] },
  { name: 'Dehradun, Uttarakhand', coords: [30.3165, 78.0322] },
  { name: 'Guwahati, Assam', coords: [26.1445, 91.7362] },
  { name: 'Ranchi, Jharkhand', coords: [23.3441, 85.3096] },
  { name: 'Raipur, Chhattisgarh', coords: [21.2514, 81.6296] },
  { name: 'Srinagar, Jammu and Kashmir', coords: [34.0837, 74.7973] },
  { name: 'Panaji, Goa', coords: [15.4909, 73.8278] }
];

const specializationAliases = {
  'General Physician': ['general medicine', 'internal medicine', 'general physician', 'emergency medicine'],
  Cardiologist: ['cardiology', 'cardiac'],
  Dermatologist: ['dermatology', 'skin'],
  Pediatrician: ['pediatrics', 'paediatrics', 'child'],
  Orthopedic: ['orthopedic', 'orthopaedic'],
  'ENT Specialist': ['ent', 'ear nose throat', 'otorhinolaryngology'],
  Gynecologist: ['gynecology', 'gynaecology', 'obstetrics'],
  Neurologist: ['neurology', 'neurosciences'],
  Psychiatrist: ['psychiatry', 'mental health'],
  Dentist: ['dental', 'dentistry'],
  Ophthalmologist: ['ophthalmology', 'eye'],
  Gastroenterologist: ['gastroenterology', 'digestive'],
  Pulmonologist: ['pulmonology', 'respiratory', 'chest medicine'],
  Urologist: ['urology'],
  Endocrinologist: ['endocrinology', 'diabetes'],
  Oncologist: ['oncology', 'cancer'],
  Nephrologist: ['nephrology', 'kidney', 'renal']
};

const exampleSymptoms = [
  'Fever and body aches',
  'Persistent headache',
  'Itchy skin rash',
  'Chest pain',
  'Stomach pain',
  'Cough and breathlessness'
];

function stateForLocation(locationName) {
  if (locationName.includes('Delhi')) return 'Delhi';
  if (locationName.startsWith('Noida') || locationName.startsWith('Ghaziabad')) return 'Uttar Pradesh';
  if (locationName.startsWith('Gurugram') || locationName.startsWith('Faridabad')) return 'Haryana';
  if (locationName === 'Chandigarh') return 'Chandigarh';
  return locationName.split(',').at(-1)?.trim() || null;
}

function nearestSupportedState(latitude, longitude) {
  const nearest = searchableLocations.reduce((best, location) => {
    const delta = Math.hypot(latitude - location.coords[0], longitude - location.coords[1]);
    return !best || delta < best.delta ? { location, delta } : best;
  }, null);

  return nearest && nearest.delta <= 1.5 ? stateForLocation(nearest.location.name) : null;
}

// Custom Map Helper to pan view dynamically
function ChangeMapView({ center, zoom = 11, focusVersion = 0 }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, focusVersion, map, zoom]);
  return null;
}

const mapFacilityIcon = L.icon({
  iconUrl: '/google-map-red-pin.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -30],
  tooltipAnchor: [14, -22]
});

export default function PatientDashboard() {
  const { user, token } = useAuth();
  const locationRequestedRef = useRef(false);
  const savedLocationRef = useRef(loadSavedLocation(user?.id));
  const savedLocation = savedLocationRef.current;

  const [center, setCenter] = useState(savedLocation?.coordinates || [28.6139, 77.2090]);
  const [livePosition, setLivePosition] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapFocusVersion, setMapFocusVersion] = useState(0);
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [locationStatus, setLocationStatus] = useState(savedLocation ? 'manual' : 'prompt');
  const [locationQuery, setLocationQuery] = useState(savedLocation?.label || '');
  const [selectedLocationName, setSelectedLocationName] = useState(savedLocation?.label || 'Delhi');
  const [selectedLocationPlace, setSelectedLocationPlace] = useState(
    savedLocation?.place || 'Delhi'
  );
  const [selectedLocationState, setSelectedLocationState] = useState(
    savedLocation?.state || 'Delhi'
  );
  const [selectedLocationDistrict, setSelectedLocationDistrict] = useState(
    savedLocation?.district || null
  );
  const [selectedLocationQueryDistrict, setSelectedLocationQueryDistrict] = useState(
    savedLocation?.queryDistrict || null
  );
  const [locationError, setLocationError] = useState('');
  const [locationSearching, setLocationSearching] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [manualQuery, setManualQuery] = useState('');
  const [visibleHospitalCount, setVisibleHospitalCount] = useState(24);
  const [outbreakAlerts, setOutbreakAlerts] = useState([]);
  const [outbreakStatus, setOutbreakStatus] = useState('idle');
  
  // Phase 5 Tab & AI State variables
  const [activeTab, setActiveTab] = useState('hospitals'); // 'hospitals', 'symptoms', or 'browse'
  const [symptomInput, setSymptomInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiResult, setAiResult] = useState(null);

  const [specializations, setSpecializations] = useState([]);
  const [selectedSpecialization, setSelectedSpecialization] = useState('all');
  const [bookableDoctors, setBookableDoctors] = useState([]);
  const [browseDoctors, setBrowseDoctors] = useState([]);
  const [communityProviders, setCommunityProviders] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState('');
  const [communityProviderError, setCommunityProviderError] = useState('');

  // Leaflet divIcons with Tailwind styling
  const userIcon = L.divIcon({
    html: `
      <div class="relative flex items-center justify-center">
        <div class="w-4 h-4 bg-care-success border-2 border-care-border rounded-full shadow-lg shadow-care-primary/50 animate-ping absolute"></div>
        <div class="w-4.5 h-4.5 bg-care-primary border-2 border-care-border rounded-full shadow-lg shadow-care-primary/50"></div>
      </div>
    `,
    className: 'custom-user-marker',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });

  const fetchHospitals = useCallback(async (
    lat,
    lng,
    state = null,
    place = null,
    district = null
  ) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        params.set('lat', lat);
        params.set('lng', lng);
      }
      if (state) params.set('state', state);
      if (place) params.set('place', place);
      if (district) params.set('district', district);
      params.set('limit', '1000');
      const res = await fetch(`${API_URL}/hospitals/india?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to retrieve hospitals');
      }
      const loadedHospitals = productionSafe(data.hospitals);
      setHospitals(loadedHospitals);
      enrichHospitalsWithGoogleRatings(loadedHospitals)
        .then(items => setHospitals(productionSafe(items)))
        .catch(() => {
          // Keep the Swasthya Sarthi directory visible if Google Places is unavailable.
        });
    } catch (err) {
      setError(err.message || 'Error loading the India facilities directory');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Request browser location
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('unavailable');
      setLivePosition(null);
      setLocationError('Location is not supported by this browser. Enter an area, landmark, or address.');
      return;
    }

    setLocationStatus('requesting');
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let resolved = null;
        try {
          const response = await fetch(
            `${API_URL}/geolocation/reverse?lat=${latitude}&lng=${longitude}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const data = await response.json();
          if (response.ok) resolved = data;
        } catch {
          // Coordinates still provide an exact distance search.
        }

        const preciseLabel = resolved?.preciseLabel || resolved?.label || 'Current location';
        const nearestState = resolved?.state || nearestSupportedState(latitude, longitude);
        const nearestPlace = resolved?.locality ||
          resolved?.district ||
          nearestState ||
          'Current location';
        setLocationStatus('granted');
        setLivePosition([latitude, longitude]);
        setSelectedLocationName(preciseLabel);
        setSelectedLocationPlace(nearestPlace);
        setSelectedLocationState(nearestState);
        setSelectedLocationDistrict(resolved?.district || null);
        setSelectedLocationQueryDistrict(null);
        setLocationQuery(preciseLabel);
        setLocationError('');
        setCenter([latitude, longitude]);
        fetchHospitals(
          latitude,
          longitude,
          nearestState,
          nearestPlace,
          null
        );
      },
      async (locationFailure) => {
        setLivePosition(null);
        setLocationStatus('approximate-loading');
        setLocationError('Exact GPS is unavailable. Finding your approximate city...');

        try {
          const response = await fetch(`${API_URL}/geolocation/approximate`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await response.json();
          if (!response.ok || !data.label) throw new Error('Approximate location unavailable');

          if (Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) {
            setCenter([data.latitude, data.longitude]);
          }
          const approximateDistrict = data.state === 'Delhi'
            ? null
            : data.city || null;
          setLocationStatus('approximate');
          setSelectedLocationName(data.label);
          setSelectedLocationPlace(data.city || placeForSearch(data.label));
          setSelectedLocationState(data.state || null);
          setSelectedLocationDistrict(approximateDistrict);
          setSelectedLocationQueryDistrict(approximateDistrict);
          setLocationQuery(data.label);
          setLocationError('Using approximate network location. Enter an exact area or address to refine it.');
          fetchHospitals(
            null,
            null,
            data.state || null,
            data.city || data.label,
            approximateDistrict
          );
        } catch {
          const message = locationFailure.code === locationFailure.PERMISSION_DENIED
            ? 'Location permission was denied. Enter an area, landmark, or address instead.'
            : locationFailure.code === locationFailure.TIMEOUT
              ? 'Location detection took too long. Retry or enter an address.'
              : 'Live location is unavailable. Enter an area, landmark, or address.';
          setLocationStatus(locationFailure.code === locationFailure.PERMISSION_DENIED ? 'denied' : 'unavailable');
          setLocationError(message);
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, [fetchHospitals, token]);

  useEffect(() => {
    if (locationRequestedRef.current) return;
    locationRequestedRef.current = true;
    if (savedLocation) {
      fetchHospitals(
        savedLocation.coordinates?.[0] ?? null,
        savedLocation.coordinates?.[1] ?? null,
        savedLocation.state,
        placeForSearch(savedLocation.place),
        savedLocation.queryDistrict
      );
      return;
    }
    requestLocation();
  }, [fetchHospitals, requestLocation, savedLocation]);

  useEffect(() => {
    if (!selectedLocationPlace || locationStatus === 'prompt') return;
    window.localStorage.setItem(patientLocationStorageKey(user?.id), JSON.stringify({
      location: selectedLocationPlace,
      locationLabel: selectedLocationName,
      locationStatus,
      locationAccuracy: null,
      state: selectedLocationState,
      district: selectedLocationDistrict,
      queryDistrict: selectedLocationQueryDistrict,
      coordinates: ['granted', 'manual'].includes(locationStatus)
        ? { latitude: center[0], longitude: center[1] }
        : null
    }));
    window.sessionStorage.removeItem(LEGACY_LOCATION_KEY);
  }, [
    center,
    locationStatus,
    selectedLocationDistrict,
    selectedLocationName,
    selectedLocationPlace,
    selectedLocationQueryDistrict,
    selectedLocationState,
    user?.id
  ]);

  useEffect(() => {
    if (locationStatus !== 'granted' || !navigator.geolocation) return undefined;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextPosition = [
          position.coords.latitude,
          position.coords.longitude
        ];
        setLivePosition(current => {
          if (!current) return nextPosition;
          const movement = Math.hypot(
            current[0] - nextPosition[0],
            current[1] - nextPosition[1]
          );
          return movement >= 0.0005 ? nextPosition : current;
        });
      },
      () => {
        // Keep the most recent location if a later live update is unavailable.
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [locationStatus]);

  useEffect(() => {
    if (!mapOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = event => {
      if (event.key === 'Escape') setMapOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mapOpen]);

  useEffect(() => {
    if (!token || locationStatus === 'prompt') return;

    async function fetchOutbreakAlerts() {
      setOutbreakStatus('loading');
      const params = new URLSearchParams();
      if (['granted', 'manual'].includes(locationStatus)) {
        const alertCenter = locationStatus === 'granted' && livePosition
          ? livePosition
          : center;
        params.set('lat', alertCenter[0]);
        params.set('lng', alertCenter[1]);
      }
      if (selectedLocationState) params.set('state', selectedLocationState);
      if (selectedLocationPlace) params.set('place', selectedLocationPlace);
      if (selectedLocationDistrict) params.set('district', selectedLocationDistrict);

      try {
        const response = await fetch(
          `${API_URL}/outbreaks/nearby?${params.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error?.message || 'Failed to check public-health notices');
        }
        setOutbreakAlerts(data.alerts || []);
        setOutbreakStatus('checked');
      } catch (outbreakError) {
        console.warn('Unable to check public-health notices:', outbreakError);
        setOutbreakAlerts([]);
        setOutbreakStatus('error');
      }
    }

    fetchOutbreakAlerts();
  }, [
    center,
    livePosition,
    locationStatus,
    selectedLocationDistrict,
    selectedLocationName,
    selectedLocationPlace,
    selectedLocationState,
    token
  ]);

  useEffect(() => {
    async function fetchSpecializations() {
      try {
        const res = await fetch(`${API_URL}/specializations`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.message || 'Failed to load specializations');
        }
        setSpecializations(data.specializations || []);
      } catch (err) {
        console.warn('Failed to load specializations:', err);
      }
    }

    if (token) {
      fetchSpecializations();
    }
  }, [token]);

  const fetchBrowseDoctors = useCallback(async () => {
    setBrowseLoading(true);
    setBrowseError('');
    setCommunityProviderError('');
    try {
      const [lat, lng] = ['granted', 'manual'].includes(locationStatus) ? center : [null, null];
      const hasCoordinates = lat !== null && lng !== null;
      const searchPlace = placeForSearch(selectedLocationPlace || selectedLocationName);
      const bookableParams = new URLSearchParams();
      if (selectedSpecialization !== 'all') {
        bookableParams.set('specializationId', selectedSpecialization);
      }
      if (hasCoordinates) {
        bookableParams.set('lat', lat);
        bookableParams.set('lng', lng);
        bookableParams.set('radius', '150');
      }
      if (searchPlace) {
        bookableParams.set('place', searchPlace);
      }
      const bookableRes = await fetch(
        `${API_URL}/doctors/search?${bookableParams.toString()}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const bookableData = await bookableRes.json();
      if (!bookableRes.ok) {
        throw new Error(bookableData.error?.message || 'Failed to browse bookable doctors');
      }
      setBookableDoctors(productionSafe(bookableData.doctors));

      const params = new URLSearchParams();
      if (selectedSpecialization !== 'all') params.set('specializationId', selectedSpecialization);
      if (hasCoordinates) {
        params.set('lat', lat);
        params.set('lng', lng);
        params.set('radius', '150');
      }
      if (searchPlace) {
        params.set('place', searchPlace);
      }
      if (selectedLocationState) params.set('state', selectedLocationState);
      const res = await fetch(`${API_URL}/directory/doctors?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to browse verified doctors');
      }
      setBrowseDoctors(productionSafe(data.doctors));

      const providerLocation = selectedLocationName === 'Current location'
        ? selectedLocationState
        : selectedLocationName;
      if (providerLocation) {
        const providerParams = new URLSearchParams({ location: providerLocation });
        if (lat !== null && lng !== null) {
          providerParams.set('lat', lat);
          providerParams.set('lng', lng);
        }
        const providerRes = await fetch(
          `${API_URL}/directory/community-providers?${providerParams.toString()}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const providerData = await providerRes.json();
        if (providerRes.ok) {
          setCommunityProviders(providerData.providers || []);
        } else {
          setCommunityProviders([]);
          setCommunityProviderError(
            providerData.error?.message || 'Community provider listings are temporarily unavailable'
          );
        }
      } else {
        setCommunityProviders([]);
      }
    } catch (err) {
      setBrowseError(err.message || 'Failed to browse doctors');
      setBookableDoctors([]);
    } finally {
      setBrowseLoading(false);
    }
  }, [
    center,
    locationStatus,
    selectedLocationName,
    selectedLocationPlace,
    selectedLocationState,
    selectedSpecialization,
    token
  ]);

  useEffect(() => {
    if (activeTab === 'browse' && token) {
      fetchBrowseDoctors();
    }
  }, [activeTab, token, fetchBrowseDoctors]);

  const locationOptions = useMemo(() => {
    const byName = new Map();
    for (const location of [...searchableLocations, ...locationSuggestions]) {
      if (location?.name && !byName.has(location.name.toLowerCase())) {
        byName.set(location.name.toLowerCase(), location);
      }
    }
    return [...byName.values()];
  }, [locationSuggestions]);

  useEffect(() => {
    const typedQuery = locationQuery.trim();
    if (!token || typedQuery.length < 2) {
      setLocationSuggestions([]);
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const [googleResponse, directoryResponse] = await Promise.allSettled([
          fetch(
            `${API_URL}/geolocation/suggest?q=${encodeURIComponent(typedQuery)}`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: controller.signal
            }
          ),
          fetch(
            `${API_URL}/hospitals/locations?q=${encodeURIComponent(typedQuery)}`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: controller.signal
            }
          )
        ]);
        const suggestions = [];

        if (googleResponse.status === 'fulfilled') {
          const data = await googleResponse.value.json();
          if (googleResponse.value.ok) {
            suggestions.push(...(data.suggestions || []));
          }
        }

        if (directoryResponse.status === 'fulfilled') {
          const data = await directoryResponse.value.json();
          if (directoryResponse.value.ok) {
            suggestions.push(...(data.locations || []));
          }
        }

        setLocationSuggestions(suggestions);
      } catch (suggestionError) {
        if (suggestionError.name !== 'AbortError') {
          setLocationSuggestions([]);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [locationQuery, token]);

  const fetchGoogleLocation = async (typedQuery, placeId = null) => {
    const params = new URLSearchParams({ q: typedQuery });
    if (placeId) params.set('placeId', placeId);
    const geocodeResponse = await fetch(
      `${API_URL}/geolocation/search?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const geocodeData = await geocodeResponse.json();

    if (
      geocodeResponse.ok &&
      Number.isFinite(geocodeData.latitude) &&
      Number.isFinite(geocodeData.longitude)
    ) {
      return geocodeData;
    }

    return null;
  };

  const applyResolvedLocation = async (geocodeData, fallbackQuery) => {
    const resolvedPlace = geocodeData.locality ||
      geocodeData.district ||
      placeForSearch(fallbackQuery);
    setCenter([geocodeData.latitude, geocodeData.longitude]);
    setLivePosition(null);
    setLocationStatus('manual');
    setSelectedLocationName(geocodeData.label || fallbackQuery);
    setSelectedLocationPlace(resolvedPlace);
    setSelectedLocationState(geocodeData.state || null);
    setSelectedLocationDistrict(geocodeData.district || null);
    setSelectedLocationQueryDistrict(null);
    setLocationQuery(geocodeData.label || fallbackQuery);
    setLocationSuggestions([]);
    await fetchHospitals(
      geocodeData.latitude,
      geocodeData.longitude,
      geocodeData.state || null,
      resolvedPlace,
      null
    );
  };

  const selectSearchLocation = async (location) => {
    if (location.provider === 'google' || location.placeId) {
      setLocationSearching(true);
      setLocationError('');
      try {
        const geocodeData = await fetchGoogleLocation(location.name, location.placeId || null);
        if (geocodeData) {
          await applyResolvedLocation(geocodeData, location.name);
          return;
        }
        setLocationError('Google could not map that place exactly. Try adding the city or state.');
      } catch {
        setLocationError('Could not map that place exactly. Try another nearby landmark.');
      } finally {
        setLocationSearching(false);
      }
      return;
    }

    const coords = location.coords || [location.latitude, location.longitude];
    const hasCoordinates = Number.isFinite(coords?.[0]) && Number.isFinite(coords?.[1]);
    const locationName = location.name;
    if (hasCoordinates) setCenter(coords);
    setLivePosition(null);
    setLocationStatus(hasCoordinates ? 'manual' : 'manual-list');
    setSelectedLocationName(locationName);
    setSelectedLocationPlace(location.place || placeForSearch(locationName));
    setSelectedLocationState(location.state || stateForLocation(locationName));
    setSelectedLocationDistrict(location.district || null);
    setSelectedLocationQueryDistrict(location.district || null);
    setLocationQuery(locationName);
    setLocationError('');
    setLocationSuggestions([]);
    fetchHospitals(
      hasCoordinates ? coords[0] : null,
      hasCoordinates ? coords[1] : null,
      location.state || stateForLocation(locationName),
      location.place || placeForSearch(locationName),
      location.district || null
    );
  };

  const handleLocationSearch = async (event) => {
    event.preventDefault();
    const typedQuery = locationQuery.trim();
    const normalizedQuery = typedQuery.toLowerCase();
    if (normalizedQuery.length < 2) {
      setLocationError('Enter at least two characters.');
      return;
    }

    // Only accept an explicitly selected suggestion here. A loose substring
    // match makes a specific query such as "Amritpuri Delhi" select the
    // generic "Delhi, Delhi" directory entry before geocoding can run.
    const location = locationOptions.find(option =>
      option.name.toLowerCase() === normalizedQuery
    );

    if (location) {
      await selectSearchLocation(location);
      return;
    }

    setLocationSearching(true);
    setLocationError('');
    try {
      const geocodeData = await fetchGoogleLocation(typedQuery);
      if (geocodeData) {
        await applyResolvedLocation(geocodeData, typedQuery);
        return;
      }

      const directoryResponse = await fetch(
        `${API_URL}/hospitals/locations?q=${encodeURIComponent(typedQuery)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const directoryData = await directoryResponse.json();
      if (!directoryResponse.ok) {
        throw new Error(
          directoryData.error?.message ||
          'Location search failed'
        );
      }

      const resolved = directoryData.locations?.[0];
      if (!resolved) {
        setLocationError('No matching Indian location was found. Try adding the city or state.');
        return;
      }

      const hasCoordinates = Number.isFinite(resolved.latitude) && Number.isFinite(resolved.longitude);
      if (hasCoordinates) setCenter([resolved.latitude, resolved.longitude]);
      setLivePosition(null);
      setLocationStatus(hasCoordinates ? 'manual' : 'manual-list');
      setSelectedLocationName(resolved.name);
      setSelectedLocationPlace(resolved.place || resolved.district || placeForSearch(resolved.name));
      setSelectedLocationState(resolved.state);
      setSelectedLocationDistrict(resolved.district || null);
      setSelectedLocationQueryDistrict(resolved.district || null);
      setLocationQuery(resolved.name);
      setLocationSuggestions([]);
      setLocationError(`Exact address could not be mapped. Showing care across ${resolved.name}.`);
      await fetchHospitals(
        hasCoordinates ? resolved.latitude : null,
        hasCoordinates ? resolved.longitude : null,
        resolved.state,
        resolved.place || resolved.district,
        resolved.district
      );
    } catch (searchError) {
      setLocationError(searchError.message || 'Unable to search hospital locations.');
    } finally {
      setLocationSearching(false);
    }
  };

  // Filter list by search query
  const filteredHospitals = hospitals.filter(h => 
    h.name.toLowerCase().includes(manualQuery.toLowerCase()) ||
    (h.departments && h.departments.some(d => d.toLowerCase().includes(manualQuery.toLowerCase())))
  );

  const visibleHospitals = filteredHospitals.slice(0, visibleHospitalCount);

  useEffect(() => {
    setVisibleHospitalCount(24);
  }, [manualQuery, selectedLocationName]);

  const selectedBrowseSpecialization = useMemo(
    () => specializations.find(spec => String(spec.id) === String(selectedSpecialization)) || null,
    [selectedSpecialization, specializations]
  );

  const browseHospitalDirectory = useMemo(() => {
    if (!selectedBrowseSpecialization) {
      return { hospitals: hospitals.slice(0, 20), usedFallback: false };
    }

    const specialtyName = selectedBrowseSpecialization.name;
    const aliases = specializationAliases[specialtyName] || [specialtyName.toLowerCase()];
    const matchingHospitals = hospitals.filter(hospital => {
      const departmentText = (hospital.departments || []).join(' ').toLowerCase();
      return aliases.some(alias => departmentText.includes(alias));
    });

    return matchingHospitals.length > 0
      ? { hospitals: matchingHospitals.slice(0, 20), usedFallback: false }
      : { hospitals: hospitals.slice(0, 20), usedFallback: true };
  }, [hospitals, selectedBrowseSpecialization]);

  // Submit symptoms to AI Classifier
  const handleSymptomSubmit = async (e) => {
    e.preventDefault();
    if (!symptomInput.trim()) return;
    setAiLoading(true);
    setAiError('');
    setAiResult(null);

    try {
      const [lat, lng] = ['granted', 'manual'].includes(locationStatus) ? center : [null, null];
      const res = await fetch(`${API_URL}/symptom-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          patientId: user?.id,
          symptomText: symptomInput,
          lat,
          lng,
          state: selectedLocationState,
          place: placeForSearch(selectedLocationPlace || selectedLocationName)
        })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error?.message || 'Symptom matching query failed');
      }

      const safeDoctors = productionSafe(data.doctors);
      const safeHospitals = productionSafe(data.hospitals);
      setAiResult({
        ...data,
        doctors: safeDoctors,
        hospitals: safeHospitals
      });

      enrichHospitalsWithGoogleRatings(safeHospitals)
        .then(enrichedHospitals => setAiResult(current => current
          ? { ...current, hospitals: productionSafe(enrichedHospitals) }
          : current
        ))
        .catch(() => {
          // Hospital recommendations remain visible when Google ratings are unavailable.
        });

      // Pan view to the nearest doctor's hospital if results exist
      if (data.doctors && data.doctors.length > 0) {
        const firstDoc = data.doctors[0];
        if (firstDoc.hospital && firstDoc.hospital.latitude && firstDoc.hospital.longitude) {
          setCenter([firstDoc.hospital.latitude, firstDoc.hospital.longitude]);
        }
      }
    } catch (err) {
      setAiError(err.message || 'Error processing symptom match');
    } finally {
      setAiLoading(false);
    }
  };

  // Map markers selection mapping
  const getMapMarkers = () => {
    if (activeTab === 'hospitals') {
      return filteredHospitals.map(h => ({
        id: h.id,
        name: h.name,
        address: h.address,
        latitude: h.latitude,
        longitude: h.longitude,
        distance: h.distance,
        doctors: h.doctors || [],
        ratingAvg: h.ratingAvg,
        ratingCount: h.ratingCount,
        googleRating: h.googleRating,
        type: 'hospital'
      }));
    }

    const markers = [];
    const seen = new Set();
    const doctorsForMarkers = activeTab === 'browse' ? browseDoctors : (aiResult?.doctors || []);
    if (doctorsForMarkers) {
      doctorsForMarkers.forEach(doc => {
        const h = doc.hospital;
        if (h && h.latitude && h.longitude && !seen.has(h.id)) {
          seen.add(h.id);
          markers.push({
            id: h.id,
            name: h.name,
            address: h.address,
            latitude: h.latitude,
            longitude: h.longitude,
            distance: doc.distance,
            type: 'doctor_hospital',
            doctorName: doc.fullName,
            specialization: activeTab === 'browse' ? doc.specialization : aiResult.specialization
          });
        }
      });
    }
    if (activeTab === 'symptoms') {
      (aiResult?.hospitals || []).forEach(hospital => {
        if (hospital.latitude && hospital.longitude && !seen.has(hospital.id)) {
          seen.add(hospital.id);
          markers.push({
            ...hospital,
            type: 'recommended_hospital',
            specialization: aiResult.specialization
          });
        }
      });
    }
    if (activeTab === 'browse') {
      communityProviders.forEach(provider => {
        if (provider.latitude && provider.longitude && !seen.has(provider.id)) {
          seen.add(provider.id);
          markers.push({
            ...provider,
            type: 'community_provider'
          });
        }
      });
      browseHospitalDirectory.hospitals.forEach(hospital => {
        if (hospital.latitude && hospital.longitude && !seen.has(hospital.id)) {
          seen.add(hospital.id);
          markers.push({
            ...hospital,
            type: 'browse_hospital',
            specialization: selectedBrowseSpecialization?.name || null
          });
        }
      });
    }
    return markers;
  };

  const mapMarkers = getMapMarkers();
  const mapCenter = locationStatus === 'granted' && livePosition
    ? livePosition
    : center;

  return (
    <div className="care-shell patient-dashboard flex flex-col justify-between">
      <div>
        <PatientPortalHeader />

        {/* Main Content Area */}
        <div className="min-h-[calc(100vh-140px)] lg:h-[calc(100vh-140px)] flex flex-col relative">
          <OutbreakAlert alerts={outbreakAlerts} />
          <div className="flex-1 min-h-0 relative">
          
          {/* Full-width patient workspace */}
          <main className="w-full h-full bg-care-neutral p-4 sm:p-6 overflow-y-auto">
            <div className="w-full max-w-7xl mx-auto">
              {/* Tab Selector */}
              <div className="care-segmented mb-6 w-full sm:w-fit">
                <button
                  onClick={() => setActiveTab('hospitals')}
                  className={`care-segment flex-1 ${activeTab === 'hospitals' ? 'care-segment-active' : ''}`}
                >
                  <MapPin className="w-4 h-4" />
                  <span>Nearby Facilities</span>
                </button>
                <button
                  onClick={() => setActiveTab('symptoms')}
                  className={`care-segment flex-1 ${activeTab === 'symptoms' ? 'care-segment-active' : ''}`}
                >
                  <Activity className="w-4 h-4" />
                  <span>AI Symptom Checker</span>
                </button>
                <button
                  onClick={() => setActiveTab('browse')}
                  className={`care-segment flex-1 ${activeTab === 'browse' ? 'care-segment-active' : ''}`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>Browse</span>
                </button>
              </div>

              {/* TAB 1: Hospitals discovery */}
              {activeTab === 'hospitals' && (
                <div className="care-tab-panel">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-care-heading flex items-center">
                      Explore Facilities
                    </h3>
                    {locationStatus === 'denied' && (
                      <span className="px-2 py-0.5 rounded-full bg-care-neutral border border-care-warning/20 text-[9px] text-care-warning font-semibold uppercase">
                        GPS Offline
                      </span>
                    )}
                  </div>

                  <div className="mb-6 p-4 care-surface space-y-3">
                    <div className="flex items-start">
                      <Compass className="w-4 h-4 text-care-primary mr-2 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-xs text-care-muted leading-relaxed">Search hospitals anywhere in India</span>
                        <span className="block text-[10px] text-care-primary mt-0.5">Searching near: {selectedLocationName}</span>
                      </div>
                    </div>
                    <form onSubmit={handleLocationSearch} className="space-y-2">
                      <div className="relative">
                        <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-care-muted" />
                        <input
                          list="searchable-locations"
                          value={locationQuery}
                          onChange={event => {
                            setLocationQuery(event.target.value);
                            setLocationError('');
                          }}
                          placeholder="Area, neighbourhood, landmark, or address"
                          className="patient-input w-full rounded-lg py-2.5 pl-10 pr-3 text-sm"
                        />
                        <datalist id="searchable-locations">
                          {locationOptions.map(location => (
                            <option
                              key={location.name}
                              value={location.name}
                              label={location.type ? `${location.type} - ${location.hospitalCount || 0} facilities` : undefined}
                            />
                          ))}
                        </datalist>
                      </div>
                      {locationError && <p className="text-[10px] text-care-danger">{locationError}</p>}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="submit"
                          disabled={locationSearching}
                          className="py-2.5 px-3 bg-care-primary hover:bg-care-primary-hover text-care-surface rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 inline-flex items-center justify-center"
                        >
                          {locationSearching && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                          {locationSearching ? 'Searching...' : 'Search location'}
                        </button>
                        <button
                          type="button"
                          onClick={requestLocation}
                          className="patient-button-secondary py-2.5 px-3 rounded-lg text-xs font-semibold border transition-colors inline-flex items-center justify-center"
                        >
                          <Navigation className="w-3.5 h-3.5 mr-1.5" /> Use my location
                        </button>
                      </div>
                    </form>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {searchableLocations
                        .filter((_, index) => [0, 19, 22, 26].includes(index))
                        .map(location => (
                        <button
                          key={location.name}
                          type="button"
                          onClick={() => selectSearchLocation(location)}
                          className="patient-chip px-2.5 py-1.5 border rounded-md text-[10px] font-semibold"
                        >
                          {location.name.split(',')[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Geolocation Fallbacks */}
                  {locationStatus === 'denied' && (
                    <div className="mb-6 p-4 care-surface space-y-3">
                      <div className="flex items-start">
                        <Compass className="w-4 h-4 text-care-warning mr-2 mt-0.5 shrink-0" />
                        <span className="text-xs text-care-muted leading-relaxed">
                          GPS offline. Search for any supported Indian city above instead.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Search bar */}
                  {error && (
                    <div className="mb-4 p-3 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg flex items-start text-xs">
                      <ShieldAlert className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                  <div className="relative mb-6">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-care-muted" />
                    <input
                      type="text"
                      placeholder="Search hospital or department..."
                      value={manualQuery}
                      onChange={(e) => setManualQuery(e.target.value)}
                      className="patient-input w-full rounded-lg py-2.5 pl-10 pr-4 text-sm"
                    />
                  </div>

                  {/* List results */}
                  <div className="space-y-4">
                    <span className="block text-xs font-semibold text-care-muted uppercase mb-2">Hospital Directory ({filteredHospitals.length})</span>
                    {loading ? (
                      <CardSkeleton count={6} />
                    ) : filteredHospitals.length === 0 ? (
                      <div className="py-12 text-center text-care-muted text-sm border border-care-border rounded-lg">
                        No facilities found matching details.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {visibleHospitals.map(h => (
                        <Card key={h.id} hoverable className="flex h-fit flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start mb-2 gap-2">
                              <h4 className="font-bold text-care-heading text-sm hover:text-care-primary-hover transition-colors leading-tight">
                                <Link to={`/patient/hospital/${h.id}`}>{h.name}</Link>
                              </h4>
                              {h.distance !== null && (
                                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-care-primary-subtle border border-care-primary/20 text-care-primary rounded-full shrink-0">
                                  {h.distance.toFixed(1)} km
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-care-muted mb-3 truncate">{h.address}</p>
                            <HospitalRatingSummary
                              ratingAvg={h.ratingAvg}
                              ratingCount={h.ratingCount}
                              googleRating={h.googleRating}
                              className="mb-3"
                            />
                            <HospitalOperatingHours operatingHours={h.operatingHours} compact className="mb-3" />
                            <div className="flex flex-wrap items-center gap-1.5 mb-3">
                              {h.hospitalType && (
                                <Badge variant="info">{h.hospitalType}</Badge>
                              )}
                              {h.sourceDataset?.startsWith('data.gov.in') && (
                                <Badge variant="success">Government directory</Badge>
                              )}
                              <Badge variant="info">
                                {hospitalDoctorCount(h)} {hospitalDoctorCount(h) === 1 ? 'doctor' : 'doctors'} listed
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-1 mb-4">
                              {h.departments?.slice(0, 3).map((d, i) => (
                                <span key={i} className="text-[9px] px-2 py-0.5 rounded-md bg-care-neutral border border-care-border text-care-muted">
                                  {d}
                                </span>
                              ))}
                              {h.departments?.length > 3 && (
                                <span className="text-[9px] px-2 py-0.5 rounded-md bg-care-neutral text-care-muted font-bold">
                                  +{h.departments.length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                          <Link
                            to={`/patient/hospital/${h.id}`}
                            className={buttonStyles({ block: true, size: 'sm' })}
                          >
                            View Facility Profile
                          </Link>
                        </Card>
                        ))}
                      </div>
                    )}
                    {!loading && visibleHospitalCount < filteredHospitals.length && (
                      <div className="flex items-center justify-between gap-4 border-t border-care-border pt-4">
                        <span className="text-xs care-muted">
                          Showing {visibleHospitals.length} of {filteredHospitals.length} facilities
                        </span>
                        <button
                          type="button"
                          onClick={() => setVisibleHospitalCount(count => count + 24)}
                          className="care-button-secondary"
                        >
                          Show more
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: AI Symptom Checker */}
              {activeTab === 'symptoms' && (
                <div className="care-tab-panel space-y-6">
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-care-heading">AI Symptom Finder</h3>
                    <p className="text-xs text-care-muted leading-relaxed">
                      Describe your physical symptoms in detail. The triage engine will recommend specialists and evaluate urgency.
                    </p>
                  </div>

                  <form onSubmit={handleSymptomSubmit} className="space-y-3">
                    <textarea
                      required
                      rows={3}
                      value={symptomInput}
                      onChange={(e) => setSymptomInput(e.target.value)}
                      placeholder="Describe symptoms (e.g. skin rash for 2 days, or chest pain...)"
                      className="patient-input w-full rounded-lg p-3 text-sm resize-none"
                    />

                    <div>
                      <span className="mb-2 block text-xs font-semibold text-care-muted">Try an example</span>
                      <div className="flex flex-wrap gap-2">
                        {exampleSymptoms.map(example => (
                          <button
                            key={example}
                            type="button"
                            onClick={() => {
                              setSymptomInput(example);
                              setAiError('');
                            }}
                            className="patient-chip rounded-md border px-3 py-2 text-xs font-semibold"
                          >
                            {example}
                          </button>
                        ))}
                      </div>
                    </div>

                    {aiError && (
                      <div className="p-3 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg text-xs flex items-start">
                        <ShieldAlert className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                        <span>{aiError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={aiLoading}
                      className={buttonStyles({ block: true })}
                    >
                      {aiLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Matching Specialty...</span>
                        </>
                      ) : (
                        <>
                          <Stethoscope className="w-4 h-4" />
                          <span>Analyze Symptoms</span>
                        </>
                      )}
                    </button>
                  </form>

                  {!aiResult && (
                    <Card className="mt-2">
                      <h4 className="text-base font-bold text-care-heading">How it works</h4>
                      <div className="mt-5 grid gap-5 sm:grid-cols-3">
                        {[
                          { icon: ClipboardList, step: '1', title: 'Describe symptoms', text: 'Include duration, severity, and where you feel discomfort.' },
                          { icon: UserRoundSearch, step: '2', title: 'Match the right care', text: 'Swasthya Sarthi maps your description to a verified specialty.' },
                          { icon: CheckCircle2, step: '3', title: 'Choose a provider', text: 'Review nearby doctors and hospitals before booking.' }
                        ].map(item => (
                          <div key={item.step} className="flex gap-3 sm:block">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-care-primary bg-care-primary-subtle text-care-primary-hover">
                              {React.createElement(item.icon, { className: 'h-5 w-5' })}
                            </span>
                            <div className="sm:mt-3">
                              <span className="text-[11px] font-bold text-care-primary-hover">STEP {item.step}</span>
                              <h5 className="mt-1 text-sm font-bold text-care-heading">{item.title}</h5>
                              <p className="mt-1 text-xs leading-5 text-care-muted">{item.text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* AI Output triage results */}
                  {aiResult && (
                    <div className="space-y-5 pt-4 border-t border-care-border">
                      
                      {/* 1. Clarification Block */}
                      {aiResult.clarificationNeeded && (
                        <div className="p-4 bg-care-neutral border border-care-warning/20 rounded-lg space-y-2">
                          <div className="flex items-center space-x-2 text-care-warning">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <h4 className="font-bold text-xs uppercase">Clarification Needed</h4>
                          </div>
                          <p className="text-xs text-care-muted leading-relaxed">
                            {aiResult.message}
                          </p>
                        </div>
                      )}

                      {/* 2. Emergency Redirection Block */}
                      {aiResult.emergencyRedirect && (
                        <div className="p-4 bg-care-neutral border border-care-danger/35 rounded-lg space-y-3 animate-pulse">
                          <div className="flex items-center space-x-2 text-care-danger">
                            <ShieldAlert className="w-5 h-5 shrink-0" />
                            <h4 className="font-bold text-xs uppercase">Emergency Triage Alert</h4>
                          </div>
                          <p className="text-xs text-care-muted font-medium leading-relaxed">
                            Based on your description, this requires immediate medical attention. Please do not wait for a routine appointment.
                          </p>
                          <div className="p-3 bg-care-danger/40 rounded-lg text-xs text-care-danger border border-care-danger/30">
                            <strong>Matched specialty:</strong> {aiResult.specialization}<br/>
                            <strong>Recommendation:</strong> Proceed immediately to the nearest ER or call 911/emergency services.
                          </div>
                        </div>
                      )}

                      {/* 3. Doctors results (Success classification) */}
                      {!aiResult.clarificationNeeded && !aiResult.emergencyRedirect && (
                        <div className="space-y-4">
                          <div className="p-4 bg-care-primary-subtle border border-care-success/20 rounded-lg space-y-2">
                            <h4 className="font-bold text-xs text-care-success uppercase">AI Classification Results</h4>
                            <div className="text-xs space-y-1 text-care-muted">
                              <div><strong>Specialty Matched:</strong> {aiResult.specialization}</div>
                              {aiResult.carePathway && aiResult.carePathway !== aiResult.specialization && (
                                <div><strong>Recommended Care:</strong> {aiResult.carePathway}</div>
                              )}
                              <div><strong>Urgency Priority:</strong> <span className="capitalize">{aiResult.urgency?.replace('_', ' ')}</span></div>
                              <div><strong>Confidence Score:</strong> {(aiResult.confidence * 100).toFixed(0)}%</div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <span className="block text-xs font-semibold text-care-muted uppercase">
                              {aiResult.hospitalOnly ? 'Doctor Directory' : 'Recommended Doctors'} ({aiResult.doctors?.length || 0})
                            </span>
                            
                            {aiResult.doctors?.length === 0 ? (
                              <div className="p-4 text-xs text-care-muted border border-care-border rounded-lg">
                                {aiResult.hospitalOnly
                                  ? `This condition should be evaluated through a ${aiResult.carePathway} department. Suitable hospitals are listed below.`
                                  : `No source-verified ${aiResult.specialization} profile is available yet. Suitable hospitals are listed below.`}
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                              {aiResult.doctors.map(doc => (
                                <Card key={doc.id} hoverable className="space-y-3">
                                  <div className="flex items-start gap-3">
                                    <Avatar name={doc.fullName} id={doc.id} src={doc.profilePictureUrl} />
                                    <div className="min-w-0 flex-1">
                                    <div className="flex justify-between items-start mb-1 gap-2">
                                      <h5 className="font-bold text-care-heading text-sm leading-tight">{doc.fullName}</h5>
                                      {doc.distance !== null && (
                                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-care-primary-subtle border border-care-primary/20 text-care-primary rounded-full shrink-0">
                                          {doc.distance.toFixed(1)} km
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-care-muted font-medium">
                                      {doc.hospital?.name || 'Affiliated Hospital'}
                                    </div>
                                    </div>
                                  </div>

                                  {doc.yearsExperience != null && (
                                    <div className="text-[10px] text-care-muted pt-1">
                                      <span className="flex items-center"><Award className="w-3.5 h-3.5 mr-1" /> {doc.yearsExperience} yrs experience</span>
                                    </div>
                                  )}

                                  <PublicAvailability availability={doc.hospital?.publicAvailability} />

                                  <Link
                                    to={`/patient/doctor/${doc.id}`}
                                    className={buttonStyles({ block: true, size: 'sm' })}
                                  >
                                    View Doctor Profile
                                  </Link>
                                </Card>
                              ))}
                              </div>
                            )}
                          </div>

                          <div className="space-y-3">
                            <span className="block text-xs font-semibold text-care-muted uppercase">
                              Suitable Hospitals ({aiResult.hospitals?.length || 0})
                            </span>
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                            {(aiResult.hospitals || []).map(hospital => (
                              <Card key={hospital.id} hoverable>
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <h5 className="font-bold text-care-heading text-sm flex items-center">
                                      <Building2 className="w-4 h-4 mr-1.5 text-care-primary shrink-0" />
                                      {hospital.name}
                                    </h5>
                                    <p className="mt-1 truncate text-xs text-care-muted" title={hospital.address}>{hospital.address}</p>
                                    <HospitalRatingSummary
                                      ratingAvg={hospital.ratingAvg}
                                      ratingCount={hospital.ratingCount}
                                      googleRating={hospital.googleRating}
                                      className="mt-2"
                                    />
                                    <HospitalOperatingHours operatingHours={hospital.operatingHours} compact className="mt-2" />
                                  </div>
                                  {hospital.distance !== null && (
                                    <span className="text-[10px] font-mono text-care-primary shrink-0">
                                      {hospital.distance.toFixed(1)} km
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center justify-between mt-3">
                                  <span className="text-[10px] text-care-muted">
                                    {hospital.hasVerifiedDoctor
                                      ? 'Verified matching doctor'
                                      : hospital.matchType === 'specialty_department'
                                        ? `${aiResult.carePathway || aiResult.specialization} department listed`
                                        : `Nearby assessment and referral option; confirm ${aiResult.specialization} availability`}
                                  </span>
                                  <Link
                                    to={`/patient/hospital/${hospital.id}`}
                                    className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                                  >
                                    View hospital
                                  </Link>
                                </div>
                              </Card>
                            ))}
                            </div>
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              )}

              {activeTab === 'browse' && (
                <div className="care-tab-panel space-y-7">
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-care-heading">Browse Care Nearby</h3>
                    <p className="text-xs text-care-muted leading-relaxed">
                      Verified doctor profiles and hospitals near {selectedLocationName}.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-care-muted uppercase mb-1">Specialization</label>
                      <select
                        value={selectedSpecialization}
                        onChange={(e) => setSelectedSpecialization(e.target.value)}
                        className="patient-input w-full rounded-lg py-2.5 px-3 text-xs"
                      >
                        <option value="all">All specializations</option>
                        {specializations.map(spec => (
                          <option key={spec.id} value={spec.id}>{spec.name}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={fetchBrowseDoctors}
                      disabled={browseLoading}
                      className={buttonStyles({ block: true })}
                    >
                      {browseLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Searching...</span>
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4" />
                          <span>Search Nearby</span>
                        </>
                      )}
                    </button>
                  </div>

                  {browseError && (
                    <div className="p-3 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg text-xs flex items-start">
                      <ShieldAlert className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                      <span>{browseError}</span>
                    </div>
                  )}

                  <div className="space-y-3">
                    <span className="block text-xs font-semibold text-care-muted uppercase">
                      Bookable on Swasthya Sarthi ({bookableDoctors.length})
                    </span>

                    {browseLoading ? (
                      <CardSkeleton count={2} />
                    ) : bookableDoctors.length === 0 ? (
                      <div className="p-4 text-xs text-care-muted border border-care-border rounded-lg leading-relaxed">
                        No Swasthya Sarthi doctor has published appointment slots near this location yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      {bookableDoctors.map(doc => (
                        <Card key={doc.id} hoverable padding="lg" className="flex flex-col justify-between">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <Avatar name={doc.fullName} id={doc.id} src={doc.profilePictureUrl} />
                              <div className="min-w-0">
                                <h5 className="truncate text-base font-bold text-care-heading">{doc.fullName}</h5>
                                <p className="mt-1 text-xs font-semibold text-care-primary-hover">{doc.specialization}</p>
                                <p className="mt-1 truncate text-xs text-care-muted">{doc.hospital?.name}</p>
                                <DoctorRatingSummary
                                  ratingAvg={doc.ratingAvg}
                                  ratingCount={doc.ratingCount}
                                  className="mt-2"
                                />
                              </div>
                            </div>
                            {Number.isFinite(doc.distance) && (
                              <span className="text-[10px] font-mono text-care-primary shrink-0">
                                {doc.distance.toFixed(1)} km
                              </span>
                            )}
                          </div>
                          <Link
                            to={`/patient/doctor/${doc.id}`}
                            className={buttonStyles({ block: true, className: 'mt-5' })}
                          >
                            <CalendarPlus className="w-3.5 h-3.5" />
                            Book Appointment
                          </Link>
                        </Card>
                      ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <span className="block text-xs font-semibold text-care-muted uppercase">
                      Verified Named Doctors ({browseDoctors.length})
                    </span>

                    {browseLoading ? (
                      <CardSkeleton count={4} />
                    ) : browseDoctors.length === 0 ? (
                      <div className="p-4 text-xs text-care-muted border border-care-border rounded-lg leading-relaxed">
                        No source-verified named doctor profiles are published near {selectedLocationName} yet.
                        Check nearby hospitals below while Swasthya Sarthi adds hospital-roster verified doctors for this area.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      {browseDoctors.map(doc => (
                        <Card key={doc.id} hoverable padding="lg" className="flex flex-col justify-between">
                          <div className="flex items-start gap-3">
                            <Avatar name={doc.fullName} id={doc.id} src={doc.profilePictureUrl} />
                            <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-start justify-between gap-2">
                              <h5 className="text-base font-bold leading-tight text-care-heading">{doc.fullName}</h5>
                              {Number.isFinite(doc.distance) && (
                                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-care-primary-subtle border border-care-primary/20 text-care-primary rounded-full shrink-0">
                                  {doc.distance.toFixed(1)} km
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-care-success font-semibold">{doc.specialization}</div>
                            <div className="text-[10px] text-care-muted mt-0.5">{doc.hospital?.name || 'Affiliated Clinic'}</div>
                            <DoctorRatingSummary
                              ratingAvg={doc.ratingAvg}
                              ratingCount={doc.ratingCount}
                              className="mt-2"
                            />
                            </div>
                          </div>

                          {doc.yearsExperience && (
                            <div className="flex items-center text-[10px] text-care-muted">
                              <Award className="w-3.5 h-3.5 mr-1" />
                              {doc.yearsExperience} years experience
                            </div>
                          )}

                          <PublicAvailability availability={doc.hospital?.publicAvailability} />

                          <Link
                            to={`/patient/doctor/${doc.id}`}
                            className={buttonStyles({ block: true, className: 'mt-5' })}
                          >
                            View Doctor Profile
                          </Link>
                        </Card>
                      ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <span className="block text-xs font-semibold text-care-muted uppercase">
                      Community-Mapped Named Providers ({communityProviders.length})
                    </span>

                    <div className="p-3 bg-care-primary-subtle border border-care-primary/20 text-care-primary-subtle rounded-lg text-[11px] leading-relaxed">
                      Public OpenStreetMap listings near {selectedLocationName}. These names are not verified
                      hospital affiliations; confirm specialty, credentials, and availability directly.
                    </div>

                    {communityProviderError ? (
                      <div className="p-3 border border-care-warning/20 text-care-warning rounded-lg text-xs">
                        {communityProviderError}
                      </div>
                    ) : browseLoading ? (
                      <div className="py-6 flex justify-center text-care-muted">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                    ) : communityProviders.length === 0 ? (
                      <div className="p-4 text-xs text-care-muted border border-care-border rounded-lg">
                        No named community provider records were found for this area.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      {communityProviders.map(provider => (
                        <Card key={provider.id} hoverable padding="lg" className="flex flex-col justify-between gap-3">
                          <div className="flex items-start justify-between gap-2">
                            <h5 className="font-bold text-care-heading text-sm leading-tight">{provider.name}</h5>
                            {Number.isFinite(provider.distance) && (
                              <span className="text-[10px] font-mono font-semibold text-care-primary shrink-0">
                                {provider.distance.toFixed(1)} km
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-care-success font-semibold">{provider.providerType}</p>
                          <p className="truncate text-xs leading-relaxed text-care-muted" title={provider.address}>{provider.address}</p>
                          {provider.specialties?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {provider.specialties.map(specialty => (
                                <span key={specialty} className="patient-chip px-1.5 py-0.5 border rounded text-[9px]">
                                  {specialty}
                                </span>
                              ))}
                            </div>
                          )}
                          <a
                            href={provider.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={buttonStyles({ variant: 'secondary', block: true })}
                          >
                            View Map Source
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </Card>
                      ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <span className="block text-xs font-semibold text-care-muted uppercase">
                      Nearby Hospitals ({browseHospitalDirectory.hospitals.length})
                    </span>

                    {browseHospitalDirectory.usedFallback && selectedBrowseSpecialization && (
                      <div className="p-3 bg-care-neutral border border-care-warning/20 text-care-warning rounded-lg text-[11px] leading-relaxed">
                        These facilities do not publish complete {selectedBrowseSpecialization.name} department
                        metadata. They are shown by proximity; confirm the specialty directly with the hospital.
                      </div>
                    )}

                    {browseHospitalDirectory.hospitals.length === 0 ? (
                      <div className="p-4 text-xs text-care-muted border border-care-border rounded-lg">
                        No hospitals were found for this location.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      {browseHospitalDirectory.hospitals.map(hospital => (
                        <Card key={hospital.id} hoverable padding="lg" className="flex flex-col justify-between gap-3">
                          <div className="flex items-start justify-between gap-2">
                            <h5 className="font-bold text-care-heading text-sm leading-tight">{hospital.name}</h5>
                            {Number.isFinite(hospital.distance) && (
                              <span className="text-[10px] font-mono font-semibold text-care-primary shrink-0">
                                {hospital.distance.toFixed(1)} km
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs leading-relaxed text-care-muted" title={hospital.address}>{hospital.address}</p>
                          <HospitalRatingSummary
                            ratingAvg={hospital.ratingAvg}
                            ratingCount={hospital.ratingCount}
                            googleRating={hospital.googleRating}
                          />
                          <HospitalOperatingHours operatingHours={hospital.operatingHours} compact />
                          {hospital.departments?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {hospital.departments.slice(0, 3).map(department => (
                                <span key={department} className="patient-chip px-1.5 py-0.5 border rounded text-[9px]">
                                  {department}
                                </span>
                              ))}
                            </div>
                          )}
                          <Badge variant="info" className="w-fit">
                            {hospitalDoctorCount(hospital)} {hospitalDoctorCount(hospital) === 1 ? 'doctor' : 'doctors'} listed
                          </Badge>
                          <Link
                            to={`/patient/hospital/${hospital.id}`}
                            className={buttonStyles({ block: true })}
                          >
                            View Hospital
                          </Link>
                        </Card>
                      ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Quick GPS prompt toggle */}
            {locationStatus === 'denied' && (
              <button
                onClick={requestLocation}
                className="mt-6 py-2 w-full bg-care-neutral hover:bg-care-neutral border border-care-border text-care-muted text-xs font-semibold rounded-lg transition-all inline-flex items-center justify-center space-x-1.5"
              >
                <Navigation className="w-3.5 h-3.5 text-care-primary" />
                <span>Retry Browser GPS</span>
              </button>
            )}
          </main>

          {/* Full-screen map overlay */}
          {mapOpen && (
          <div
            className="fixed inset-0 z-50 bg-care-neutral flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Live healthcare map"
          >
            <div className="absolute left-4 right-4 top-4 z-[1000] flex min-h-14 items-center justify-between gap-4 rounded-lg border border-care-border bg-care-surface px-4 py-2 shadow-xl sm:left-6 sm:right-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMapOpen(false)}
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-care-border bg-care-surface px-3 text-xs font-semibold text-care-heading transition-colors hover:bg-care-neutral"
                  aria-label="Back to nearby facilities"
                >
                  <ArrowLeft className="h-4 w-4 text-care-primary" />
                  <span className="hidden sm:inline">Back to facilities</span>
                </button>
                <div className="min-w-0">
                  <h2 className="font-bold text-care-heading">Healthcare Map</h2>
                  <p className="truncate text-xs text-care-muted">
                    {locationStatus === 'granted'
                      ? 'Live GPS location'
                      : `Search center: ${selectedLocationName}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={`hidden md:inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${
                    outbreakAlerts.length > 0
                      ? 'border-care-warning bg-care-warning/10 text-care-warning'
                      : outbreakStatus === 'error'
                        ? 'border-care-danger bg-care-surface text-care-danger'
                        : 'border-care-border bg-care-surface text-care-success'
                  }`}
                  role="status"
                >
                  <ShieldAlert className="h-4 w-4" />
                  {outbreakAlerts.length > 0
                    ? `${outbreakAlerts.length} health notice${outbreakAlerts.length === 1 ? '' : 's'}`
                    : outbreakStatus === 'loading'
                      ? 'Checking health notices'
                      : outbreakStatus === 'error'
                        ? 'Notice check unavailable'
                        : 'No active notices nearby'}
                </div>
                <button
                  type="button"
                  onClick={() => setMapFocusVersion(version => version + 1)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-care-border bg-care-surface px-3 text-xs font-semibold text-care-heading transition-colors hover:bg-care-neutral"
                  title="Recenter map"
                >
                  <Crosshair className="h-4 w-4 text-care-primary" />
                  <span className="hidden sm:inline">Recenter</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMapOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-care-border bg-care-surface text-care-heading transition-colors hover:bg-care-neutral"
                  title="Close map"
                  aria-label="Close map"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          <section className="flex-1 min-h-0 bg-care-neutral relative">
            <MapContainer
              center={mapCenter}
              zoom={11}
              className="w-full h-full z-10"
              zoomControl={false}
            >
              <ZoomControl position="bottomright" />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              {/* User Location Marker */}
              {['granted', 'manual'].includes(locationStatus) && (
                <Marker position={mapCenter} icon={userIcon}>
                  <Popup>
                    <div className="text-care-heading font-sans text-xs">
                      <strong>{locationStatus === 'granted' ? 'You are here' : `Search center: ${selectedLocationName}`}</strong>
                    </div>
                  </Popup>
                </Marker>
              )}

              {outbreakAlerts.map(alert => (
                Number.isFinite(alert.area?.latitude) && Number.isFinite(alert.area?.longitude) && (
                  <Circle
                    key={`outbreak-${alert.id}`}
                    center={[alert.area.latitude, alert.area.longitude]}
                    radius={Math.max(1, Number(alert.area.radiusKm)) * 1000}
                    pathOptions={{
                      color: 'var(--color-warning-accent)',
                      fillColor: 'var(--color-warning-accent)',
                      fillOpacity: 0.12,
                      opacity: 0.8,
                      weight: 2
                    }}
                  >
                    <Popup>
                      <div className="max-w-64 font-sans text-xs text-care-body">
                        <strong className="block text-sm text-care-heading">{alert.headline}</strong>
                        <span className="mt-1 block text-care-muted">{alert.matchedArea}</span>
                        <span className="mt-2 block">{alert.summary}</span>
                        <a
                          href={alert.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center font-semibold text-care-primary-hover"
                        >
                          Official notice <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </div>
                    </Popup>
                  </Circle>
                )
              ))}

              {/* Render every loaded facility individually so its name is always available. */}
              {mapMarkers.map(m => (
                m.latitude && m.longitude && (
                  <Marker
                    key={m.id}
                    position={[m.latitude, m.longitude]}
                    icon={mapFacilityIcon}
                    title={m.name}
                  >
                    <Tooltip direction="right" opacity={1} className="care-map-facility-tooltip">
                      {m.name}
                    </Tooltip>
                    <Popup>
                      <div className="text-care-heading font-sans text-xs">
                        <strong className="block text-sm mb-1">{m.name}</strong>
                        <span className="block mb-2 text-care-muted">{m.address}</span>
                        {Number.isFinite(m.distance) && (
                          <span className="block font-semibold mb-2 text-care-heading font-mono text-[10px]">
                            Distance: {m.distance.toFixed(1)} km away
                          </span>
                        )}
                        {m.type === 'hospital' && (
                          <HospitalRatingSummary
                            ratingAvg={m.ratingAvg}
                            ratingCount={m.ratingCount}
                            googleRating={m.googleRating}
                            className="mb-2"
                          />
                        )}
                        {m.type === 'hospital' && (
                          <div className="mb-2 max-h-40 overflow-y-auto border-y border-care-border py-2">
                            <span className="block font-semibold text-care-body mb-1">
                              Verified doctors ({m.doctors.length})
                            </span>
                            {m.doctors.length === 0 ? (
                              <span className="block text-care-muted">No verified public roster yet.</span>
                            ) : (
                              <div className="space-y-1.5">
                                {m.doctors.map(doctor => (
                                  <Link
                                    key={doctor.id}
                                    to={`/patient/doctor/${doctor.id}`}
                                    className="block rounded bg-care-primary-subtle border border-care-primary px-2 py-1 hover:bg-care-primary-subtle"
                                  >
                                    <span className="block font-semibold text-care-primary-hover">{doctor.fullName}</span>
                                    <span className="flex items-center text-care-muted">
                                      {doctor.specialization}
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {m.type === 'doctor_hospital' && (
                          <div className="p-2 bg-care-primary-subtle rounded border border-care-primary text-[10px] mb-2 font-sans">
                            <span className="block font-semibold text-care-primary-hover">Specialist Practicing Here:</span>
                            <span className="block text-care-heading font-medium">{m.doctorName} ({m.specialization})</span>
                          </div>
                        )}
                        {m.type === 'recommended_hospital' && (
                          <div className="p-2 bg-care-primary-subtle rounded border border-care-border text-[10px] mb-2">
                            Recommended for {m.specialization}
                          </div>
                        )}
                        {m.type === 'browse_hospital' && (
                          <div className="p-2 bg-care-primary-subtle rounded border border-care-border text-[10px] mb-2">
                            Nearby hospital directory listing
                          </div>
                        )}
                        {m.type === 'community_provider' && (
                          <div className="p-2 bg-care-primary-subtle rounded border border-care-border text-[10px] mb-2">
                            Community-mapped healthcare provider. Confirm details directly.
                          </div>
                        )}
                        {m.type === 'community_provider' ? (
                          <a
                            href={m.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 bg-care-primary hover:bg-care-primary-hover text-care-surface rounded text-[10px] font-semibold text-center block transition-colors mt-1"
                          >
                            View OpenStreetMap Source
                          </a>
                        ) : (
                          <Link
                            to={`/patient/hospital/${m.id}`}
                            className="px-3 py-1.5 bg-care-primary hover:bg-care-primary-hover text-care-surface rounded text-[10px] font-semibold text-center block transition-colors mt-1"
                          >
                            Visit Facility Profile
                          </Link>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                )
              ))}

              <ChangeMapView
                center={mapCenter}
                focusVersion={mapFocusVersion}
              />
            </MapContainer>
            <div className="absolute bottom-6 left-4 z-20 space-y-2 rounded-lg border border-care-border bg-care-surface/95 px-3 py-2 text-xs text-care-body shadow-xl">
              <span className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${locationStatus === 'granted' ? 'bg-care-success animate-pulse' : 'bg-care-primary'}`} />
                {locationStatus === 'granted'
                  ? 'Live location active'
                  : selectedLocationName}
              </span>
              <span className="flex items-center gap-2 text-care-muted">
                <img src="/google-map-red-pin.png" alt="" className="h-6 w-4 object-contain" />
                Hover for the facility name; select a pin for details
              </span>
              {outbreakAlerts.length > 0 && (
                <span className="flex items-center gap-2 text-care-warning">
                  <span className="h-3 w-3 rounded-full border-2 border-care-warning bg-care-warning/20" />
                  Amber area: official public-health notice
                </span>
              )}
            </div>
          </section>
          </div>
          )}

          {/* Compact live-map launcher */}
          {!mapOpen && (
            <button
              type="button"
              onClick={() => setMapOpen(true)}
              className="fixed bottom-5 right-4 z-40 inline-flex h-16 w-16 items-center justify-center bg-transparent transition-transform hover:-translate-y-1 hover:scale-105 focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-care-primary/60 sm:bottom-7 sm:right-6"
              aria-label="Open live map"
              title="Open live map"
            >
              <img
                src="/google-maps-icon.png"
                alt=""
                className="h-16 w-16 object-contain drop-shadow-xl"
                draggable="false"
              />
            </button>
          )}

          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-care-border bg-care-surface py-4 text-center text-xs text-care-muted">
        &copy; 2026 Swasthya Sarthi Platform. AI Diagnostic & Location Node.
      </footer>
    </div>
  );
}
