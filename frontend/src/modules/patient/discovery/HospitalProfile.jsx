import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  ArrowLeft,
  Stethoscope,
  MapPin,
  ShieldAlert,
  Award,
  ExternalLink,
  Loader2,
  ShieldCheck,
  CalendarPlus,
  Phone,
  Globe2
} from 'lucide-react';
import PublicAvailability from '../../../shared/PublicAvailability';
import HospitalOperatingHours from '../../../shared/HospitalOperatingHours';
import {
  HospitalRatingSummary,
} from '../../../shared/HospitalRating';
import { enrichHospitalsWithGoogleRatings } from '../../../lib/googleHospitalRatings';
import { Avatar, Badge, Card, buttonStyles } from '../../../shared/ui';
import { assertProductionSafe, productionSafe } from '../../../lib/developmentFixtures';
import PatientPortalHeader from '../../../shared/PatientPortalHeader';
import PortalBackButton from '../../../shared/PortalBackButton';
import { API_URL } from '../../../lib/api';

export default function HospitalProfile({ publicView = false }) {
  const { id } = useParams();
  const { token } = useAuth();

  const [hospital, setHospital] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [bookableDoctors, setBookableDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch(`${API_URL}/hospitals/${id}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error?.message || 'Failed to fetch hospital details');
        }

        if (!assertProductionSafe(data.hospital)) throw new Error('Facility record not found');
        setHospital(data.hospital);
        setDoctors(productionSafe(data.doctors));
        setBookableDoctors(productionSafe(data.bookableDoctors));
        enrichHospitalsWithGoogleRatings([data.hospital], 1)
          .then(([enrichedHospital]) => {
            if (!enrichedHospital) return;
            setHospital(current => ({
              ...current,
              ...enrichedHospital,
              ratingAvg: current?.ratingAvg ?? enrichedHospital.ratingAvg,
              ratingCount: current?.ratingCount ?? enrichedHospital.ratingCount,
            }));
          })
          .catch(() => {
            // Facility details remain available without Google Places enrichment.
          });
      } catch (err) {
        setError(err.message || 'Error loading profile');
      } finally {
        setLoading(false);
      }
    }
    if (id && (token || publicView)) {
      fetchProfile();
    }
  }, [id, publicView, token]);

  if (loading) {
    return (
      <div className="portal-theme min-h-screen bg-care-neutral text-care-body flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-10 h-10 animate-spin text-care-primary mb-4" />
        <span className="text-care-muted text-sm">Retrieving facility directory...</span>
      </div>
    );
  }

  if (error || !hospital) {
    return (
      <div className="portal-theme min-h-screen bg-care-neutral text-care-body flex flex-col items-center justify-center font-sans p-6">
        <div className="p-3 bg-care-neutral text-care-danger rounded-lg border border-care-danger/20 mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold mb-2">Failed to Load Profile</h3>
        <p className="text-care-muted text-sm mb-6">{error || 'Facility record not found.'}</p>
        <Link to="/patient/dashboard" className="px-6 py-2.5 bg-care-neutral hover:bg-care-neutral text-care-surface rounded-lg border border-care-border transition-all text-sm">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const publicDoctors = doctors.filter(doctor => !bookableDoctors.some(item => item.id === doctor.id));

  return (
    <div className="portal-theme min-h-screen bg-care-neutral text-care-body font-sans flex flex-col justify-between">
      <div>
        {publicView ? (
          <header className="sticky top-0 z-20 border-b border-care-border bg-care-neutral/80 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
              <Link to="/" className="inline-flex items-center text-sm text-care-muted transition-colors hover:text-care-surface">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Swasthya Sarthi
              </Link>
              {hospital.verificationStatus === 'verified' && (
                <div className="flex items-center space-x-2 text-xs text-care-success">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Official source verified</span>
                </div>
              )}
            </div>
          </header>
        ) : (
          <PatientPortalHeader />
        )}

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-6 py-12">
          {!publicView && (
            <PortalBackButton label="Back to facilities" className="mb-5" />
          )}

          {/* Hospital Header card */}
          <Card padding="lg" className="mb-8 overflow-hidden">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
              <div className="min-w-0 flex-1">
                <h1 className="mb-2 text-3xl font-extrabold text-care-heading">{hospital.name}</h1>
                <div className="flex items-center text-care-muted text-sm">
                  <MapPin className="w-4 h-4 mr-1.5 shrink-0 text-care-muted" />
                  <span>{hospital.address || 'Address unlisted'}</span>
                </div>
                {hospital.verificationSourceUrl && (
                  <a
                    href={hospital.verificationSourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center text-xs text-care-success hover:text-care-success mt-3"
                  >
                    View facility source <ExternalLink className="w-3.5 h-3.5 ml-1" />
                  </a>
                )}
                <HospitalRatingSummary
                  ratingAvg={hospital.ratingAvg}
                  ratingCount={hospital.ratingCount}
                  googleRating={hospital.googleRating}
                  className="mt-3"
                  inverse
                />
              </div>
            </div>

            {/* Departments */}
            <div className="mb-6">
              <span className="block text-xs font-semibold text-care-muted uppercase mb-2">Available Departments</span>
              <div className="flex min-h-7 flex-wrap items-center gap-2">
                {hospital.departments && hospital.departments.length > 0 ? (
                  hospital.departments.map((dept, i) => (
                    <Badge key={i} variant="info">{dept}</Badge>
                  ))
                ) : (
                  <span className="text-xs text-care-muted">Department details have not been published by this facility.</span>
                )}
              </div>
            </div>

            {/* Timings */}
            <div className="pt-6 border-t border-care-border/65">
              <span className="block text-xs font-semibold text-care-muted uppercase mb-3">Operating Hours</span>
              <HospitalOperatingHours operatingHours={hospital.operatingHours} />
            </div>
          </Card>

          {/* Swasthya Sarthi Doctors */}
          <div className="space-y-6 mb-10">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-care-primary-subtle text-care-primary rounded-lg border border-care-primary/20">
                <CalendarPlus className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold">Book an Appointment</h3>
            </div>

            {bookableDoctors.length === 0 ? (
              <Card className="py-8 text-center">
                <p className="text-care-muted text-sm font-semibold">
                  In-app appointment slots are not available for this facility.
                </p>
                <p className="text-care-muted text-xs leading-relaxed mt-2">
                  {doctors.length > 0
                    ? 'Use a doctor’s official booking link below to continue on the hospital website.'
                    : 'Contact the facility directly to confirm doctors, availability, and appointment times.'}
                </p>
                <div className="flex flex-wrap justify-center gap-3 mt-5">
                  {(hospital.phone || hospital.mobile) && (
                    <a
                      href={`tel:${String(hospital.phone || hospital.mobile).replace(/[^\d+]/g, '')}`}
                      className={buttonStyles({ size: 'sm' })}
                    >
                      <Phone className="w-4 h-4" />
                      Call Facility
                    </a>
                  )}
                  {hospital.website && (
                    <a
                      href={hospital.website}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                    >
                      <Globe2 className="w-4 h-4" />
                      Facility Website
                    </a>
                  )}
                  {!hospital.phone && !hospital.mobile && !hospital.website && hospital.verificationSourceUrl && (
                    <a
                      href={hospital.verificationSourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                    >
                      <ExternalLink className="w-4 h-4" />
                      View Directory Source
                    </a>
                  )}
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {bookableDoctors.map(doctor => (
                  <Card key={doctor.id} hoverable padding="lg">
                    <div className="flex items-center gap-3">
                      <Avatar name={doctor.fullName} id={doctor.id} src={doctor.profilePictureUrl} />
                      <div>
                        <h4 className="font-bold text-care-body text-lg">{doctor.fullName}</h4>
                        <p className="mt-1 text-xs font-semibold text-care-primary-hover">{doctor.specialization}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-care-muted mt-4 mb-5">
                      {doctor.yearsExperience > 0 && (
                        <span>{doctor.yearsExperience} years experience</span>
                      )}
                      {doctor.consultationFee > 0 && (
                        <span>INR {doctor.consultationFee}</span>
                      )}
                    </div>
                    <Link
                      to={publicView ? `/doctor/${doctor.id}` : `/patient/doctor/${doctor.id}`}
                      className={buttonStyles({ block: true })}
                    >
                      <CalendarPlus className="w-4 h-4" />
                      View Slots
                    </Link>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Public directory doctors */}
          <div className="space-y-6">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-care-primary-subtle text-care-success rounded-lg border border-care-success/20">
                <Stethoscope className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold">Verified Public Directory</h3>
            </div>

            {publicDoctors.length === 0 ? (
              <div className="py-16 text-center border border-care-border bg-care-neutral/10 rounded-lg text-care-muted text-sm">
                No source-verified public doctor roster is available for this facility yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {publicDoctors.map(doctor => (
                  <Card key={doctor.id} hoverable padding="lg" className="flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-3">
                            <Avatar name={doctor.fullName} id={doctor.id} src={doctor.profilePictureUrl} size="sm" />
                            <h4 className="font-bold text-care-body text-lg mb-1">{doctor.fullName}</h4>
                          </div>
                          <span className="text-xs font-semibold text-care-success">{doctor.specialization}</span>
                        </div>
                        <Badge variant="success">Verified</Badge>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-care-muted">
                        {doctor.yearsExperience != null && (
                          <span className="flex items-center">
                            <Award className="w-3.5 h-3.5 mr-1 text-care-muted" />
                            {doctor.yearsExperience} years experience
                          </span>
                        )}
                        {doctor.credentials && <span>{doctor.credentials}</span>}
                      </div>
                      <p className="text-xs text-care-muted mb-6">
                        Fees, schedules, and appointment availability are confirmed by the hospital.
                      </p>
                      <PublicAvailability availability={doctor.publicAvailability} />
                    </div>

                    <div className="grid gap-2 mt-auto">
                      {doctor.officialBookingUrl && (
                        <a
                          href={doctor.officialBookingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonStyles({ block: true })}
                        >
                          Book on Official Website <CalendarPlus className="w-4 h-4 ml-2" />
                        </a>
                      )}
                      <Link
                        to={publicView ? `/doctor/${doctor.id}` : `/patient/doctor/${doctor.id}`}
                        className={buttonStyles({ variant: 'secondary', block: true })}
                      >
                        View Doctor Profile
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-care-border bg-care-neutral py-4 text-center text-xs text-care-muted">
        &copy; 2026 Swasthya Sarthi Platform. Verified Healthcare Facility Node.
      </footer>
    </div>
  );
}
