import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  Building2,
  ExternalLink,
  MapPin,
  Navigation,
  Search
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import PublicAvailability from '../../../shared/PublicAvailability';
import { DoctorRatingSummary } from '../../../shared/HospitalRating';
import { Avatar, Card, CardSkeleton, buttonStyles } from '../../../shared/ui';
import { productionSafe } from '../../../lib/developmentFixtures';
import PatientPortalHeader from '../../../shared/PatientPortalHeader';
import PortalBackButton from '../../../shared/PortalBackButton';
import { LEGACY_LOCATION_KEY, patientLocationStorageKey } from '../../../lib/patientSession';
import { API_URL } from '../../../lib/api';

const districts = ['South Delhi', 'North Delhi', 'East Delhi', 'West Delhi', 'Central Delhi', 'New Delhi'];

function placeForSearch(value) {
  return String(value || '').split(',')[0].trim();
}

function readSavedLocation(userId) {
  try {
    const savedValue = window.localStorage.getItem(patientLocationStorageKey(userId)) ||
      window.sessionStorage.getItem(LEGACY_LOCATION_KEY);
    if (!savedValue) return null;

    const saved = JSON.parse(savedValue);
    if (!saved?.location && !saved?.locationLabel) return null;

    const latitude = Number(saved.coordinates?.latitude);
    const longitude = Number(saved.coordinates?.longitude);
    const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

    return {
      place: placeForSearch(saved.location || saved.locationLabel),
      label: String(saved.locationLabel || saved.location || 'Selected location'),
      status: String(saved.locationStatus || 'manual'),
      state: saved.state ? String(saved.state) : null,
      district: saved.queryDistrict || saved.district || null,
      coordinates: hasCoordinates ? { latitude, longitude } : null
    };
  } catch {
    return null;
  }
}

export default function DelhiDoctorDirectory() {
  const { token, user } = useAuth();
  const [doctors, setDoctors] = useState([]);
  const [specializations, setSpecializations] = useState([]);
  const [location, setLocation] = useState(() => readSavedLocation(user?.id));
  const [locationLoading, setLocationLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    q: '',
    specializationId: 'all',
    hospitalName: '',
    district: 'all',
    availableDay: 'all'
  });

  const isDelhiLocation = useMemo(() => {
    const locationText = [location?.place, location?.label, location?.state].filter(Boolean).join(' ').toLowerCase();
    return locationText.includes('delhi');
  }, [location]);

  const fetchSpecializations = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/specializations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) setSpecializations(data.specializations || []);
    } catch (fetchError) {
      console.warn('Unable to load specializations:', fetchError);
    }
  }, [token]);

  const fetchDoctors = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (location?.coordinates) {
        params.set('lat', location.coordinates.latitude);
        params.set('lng', location.coordinates.longitude);
        params.set('radius', '150');
      }
      if (location?.place) {
        params.set('place', location.place);
      }
      if (location?.state) params.set('state', location.state);
      if (filters.q) params.set('q', filters.q);
      if (filters.specializationId !== 'all') params.set('specializationId', filters.specializationId);
      if (filters.hospitalName) params.set('hospitalName', filters.hospitalName);
      if (isDelhiLocation && filters.district !== 'all') params.set('district', filters.district);
      if (filters.availableDay !== 'all') params.set('availableDay', filters.availableDay);

      const response = await fetch(`${API_URL}/directory/doctors?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Failed to load verified doctors');
      setDoctors(productionSafe(data.doctors || []));
    } catch (fetchError) {
      setError(fetchError.message || 'Failed to load the verified doctor directory');
    } finally {
      setLoading(false);
    }
  }, [filters, isDelhiLocation, location, token]);

  const useCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Location is not supported by this browser. Choose a location from the patient dashboard first.');
      return;
    }

    setLocationLoading(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async position => {
        const selectedCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        let resolved = null;
        try {
          const response = await fetch(
            `${API_URL}/geolocation/reverse?lat=${selectedCoordinates.latitude}&lng=${selectedCoordinates.longitude}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const data = await response.json();
          if (response.ok) resolved = data;
        } catch {
          // Coordinates are enough for the distance search.
        }

        const nextLocation = {
          place: resolved?.locality || resolved?.district || placeForSearch(resolved?.label) || 'Current location',
          label: resolved?.preciseLabel || resolved?.label || 'Current location',
          status: 'granted',
          state: resolved?.state || null,
          district: null,
          coordinates: selectedCoordinates
        };
        setFilters(current => ({ ...current, district: 'all' }));
        setLocation(nextLocation);
        window.localStorage.setItem(patientLocationStorageKey(user?.id), JSON.stringify({
          location: nextLocation.place,
          locationLabel: nextLocation.label,
          locationStatus: nextLocation.status,
          state: nextLocation.state,
          district: nextLocation.district,
          queryDistrict: null,
          coordinates: nextLocation.coordinates
        }));
        window.sessionStorage.removeItem(LEGACY_LOCATION_KEY);
        setLocationLoading(false);
      },
      () => {
        setLocationLoading(false);
        setError('Could not access your current location. Choose a location from the patient dashboard first.');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, [token, user?.id]);

  useEffect(() => {
    if (token) fetchSpecializations();
  }, [token, fetchSpecializations]);

  useEffect(() => {
    setLocation(readSavedLocation(user?.id));
  }, [user?.id]);

  useEffect(() => {
    if (token) fetchDoctors();
  }, [token, fetchDoctors]);

  useEffect(() => {
    if (!isDelhiLocation && filters.district !== 'all') {
      setFilters(current => ({ ...current, district: 'all' }));
    }
  }, [filters.district, isDelhiLocation]);

  const hospitalOptions = useMemo(() => {
    const names = new Set();
    doctors.forEach(doctor => doctor.hospitals.forEach(hospital => names.add(hospital.name)));
    return [...names].sort();
  }, [doctors]);

  const updateFilter = (key, value) => {
    setFilters(current => ({ ...current, [key]: value }));
  };

  return (
    <div className="portal-theme min-h-screen bg-care-neutral text-care-body font-sans">
      <PatientPortalHeader />

      <main className="max-w-7xl mx-auto w-full px-6 py-10">
        <PortalBackButton label="Back to patient home" className="mb-5" />
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-care-heading">Verified Doctors Near You</h1>
            <p className="text-sm text-care-muted mt-2 max-w-3xl">
            A public directory checked against hospital-owned pages. Published OPD hours are source-linked,
            but live appointment availability must still be confirmed on the hospital&apos;s official website.
            </p>
            <p className="mt-3 text-sm font-semibold text-care-body">
              Searching near: <span className="text-care-success">{location?.label || 'India'}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locationLoading}
            className={buttonStyles({ variant: 'secondary', size: 'sm' })}
          >
            <Navigation className="w-4 h-4 mr-1.5" />
            {locationLoading ? 'Locating...' : 'Use current location'}
          </button>
        </div>

        <section className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8">
          <Card as="aside" padding="lg" className="h-fit space-y-4">
            <div>
              <label className="block text-xs font-semibold text-care-muted mb-1.5">Doctor name</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-care-muted" />
                <input
                  value={filters.q}
                  onChange={event => updateFilter('q', event.target.value)}
                  placeholder="Search doctors"
                  className="w-full bg-care-neutral border border-care-border py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:border-care-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-care-muted mb-1.5">Specialization</label>
              <select
                value={filters.specializationId}
                onChange={event => updateFilter('specializationId', event.target.value)}
                className="w-full bg-care-neutral border border-care-border py-2.5 px-3 text-sm focus:outline-none focus:border-care-primary"
              >
                <option value="all">All specializations</option>
                {specializations.map(specialization => (
                  <option key={specialization.id} value={specialization.id}>{specialization.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-care-muted mb-1.5">Hospital</label>
              <input
                list="verified-location-hospitals"
                value={filters.hospitalName}
                onChange={event => updateFilter('hospitalName', event.target.value)}
                placeholder="Hospital name"
                className="w-full bg-care-neutral border border-care-border py-2.5 px-3 text-sm focus:outline-none focus:border-care-primary"
              />
              <datalist id="verified-location-hospitals">
                {hospitalOptions.map(name => <option key={name} value={name} />)}
              </datalist>
            </div>

            {isDelhiLocation && (
              <div>
                <label className="block text-xs font-semibold text-care-muted mb-1.5">Delhi district</label>
                <select
                  value={filters.district}
                  onChange={event => updateFilter('district', event.target.value)}
                  className="w-full bg-care-neutral border border-care-border py-2.5 px-3 text-sm focus:outline-none focus:border-care-primary"
                >
                  <option value="all">All districts</option>
                  {districts.map(district => <option key={district} value={district}>{district}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-care-muted mb-1.5">Published OPD day</label>
              <select
                value={filters.availableDay}
                onChange={event => updateFilter('availableDay', event.target.value)}
                className="w-full bg-care-neutral border border-care-border py-2.5 px-3 text-sm focus:outline-none focus:border-care-primary"
              >
                <option value="all">Any published day</option>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>
          </Card>

          <section className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-care-muted uppercase">Verified doctors ({doctors.length})</span>
              <button onClick={fetchDoctors} className="text-xs font-semibold text-care-success hover:text-care-success">
                Refresh
              </button>
            </div>

            {error && (
              <div className="p-4 bg-care-neutral border border-care-danger/30 text-care-danger text-sm">
                {error}
              </div>
            )}

            {loading ? (
              <CardSkeleton count={4} />
            ) : doctors.length === 0 && !error ? (
              <div className="border border-dashed border-care-border px-6 py-16 text-center text-sm text-care-muted">
                <h2 className="text-lg font-bold text-care-heading">No verified doctor roster is published here yet</h2>
                <p className="mx-auto mt-3 max-w-xl leading-6">
                  CareSync only shows named doctors after their hospital roster or official profile is source-verified.
                  We have not added source-verified doctor profiles for {location?.label || 'this location'} yet.
                </p>
                <Link
                  to="/patient/dashboard"
                  className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'mt-6' })}
                >
                  View nearby hospitals instead
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {doctors.map(doctor => (
                  <Card as="article" key={doctor.id} hoverable padding="lg">
                    <div className="flex items-start gap-4">
                      <Avatar name={doctor.fullName} id={doctor.id} src={doctor.profilePictureUrl} size="lg" />
                      <div className="min-w-0">
                        <h2 className="font-bold text-care-surface text-lg">{doctor.fullName}</h2>
                        <p className="text-sm font-semibold text-care-success mt-0.5">{doctor.specialization}</p>
                        <DoctorRatingSummary
                          ratingAvg={doctor.ratingAvg}
                          ratingCount={doctor.ratingCount}
                          className="mt-2"
                        />
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-care-muted">
                          {doctor.yearsExperience != null && (
                            <span className="flex items-center">
                              <Award className="w-3.5 h-3.5 mr-1" /> {doctor.yearsExperience} years
                            </span>
                          )}
                          {doctor.credentials && <span>{doctor.credentials}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      {doctor.hospitals.map(hospital => (
                        <div key={hospital.associationId} className="rounded-lg border border-care-border bg-care-neutral p-4">
                          <h3 className="text-sm font-bold text-care-body flex items-center">
                            <Building2 className="w-4 h-4 mr-1.5 text-care-muted" />
                            {hospital.name}
                          </h3>
                          <p className="text-xs text-care-muted mt-1.5 flex items-start">
                            <MapPin className="w-3.5 h-3.5 mr-1.5 mt-0.5 shrink-0" />
                            <span>{[hospital.address, hospital.district, hospital.pincode].filter(Boolean).join(', ')}</span>
                          </p>
                          <div className="mt-4">
                            <PublicAvailability availability={hospital.publicAvailability} />
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Link
                              to={`/patient/doctor/${doctor.id}`}
                              className={buttonStyles({ size: 'sm' })}
                            >
                              View profile
                            </Link>
                            {hospital.officialBookingUrl && (
                              <a
                                href={hospital.officialBookingUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                              >
                                Hospital booking <ExternalLink className="w-3.5 h-3.5 ml-1" />
                              </a>
                            )}
                          </div>
                          <p className="text-[11px] text-care-muted mt-3">
                            Verified from {doctor.sourceName}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}
