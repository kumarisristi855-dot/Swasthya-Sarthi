import React, { useEffect, useState } from 'react';
import { useLocation, useParams, Link } from 'react-router-dom';
import {
  Building2,
  CalendarPlus,
  ExternalLink,
  Globe2,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import PublicHeader from './PublicHeader';
import PublicAvailability from '../../shared/PublicAvailability';
import HospitalOperatingHours from '../../shared/HospitalOperatingHours';
import { DoctorRatingSummary, HospitalRatingSummary } from '../../shared/HospitalRating';
import { enrichHospitalsWithGoogleRatings } from '../../lib/googleHospitalRatings';
import { Avatar, Badge, Card, buttonStyles } from '../../shared/ui';
import { assertProductionSafe, productionSafe } from '../../lib/developmentFixtures';
import { API_URL } from '../../lib/api';

export default function PublicHospitalProfile() {
  const { id } = useParams();
  const location = useLocation();
  const linkedHospital = location.state?.hospital;
  const [hospital, setHospital] = useState(() => linkedHospital || null);
  const [doctors, setDoctors] = useState([]);
  const [bookableDoctors, setBookableDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/hospitals/${id}`)
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Facility not found');
        if (!assertProductionSafe(data.hospital)) throw new Error('Facility not found');
        setHospital(data.hospital);
        setDoctors(productionSafe(data.doctors || []));
        setBookableDoctors(productionSafe(data.bookableDoctors || []));
        enrichHospitalsWithGoogleRatings([data.hospital], 1)
          .then(([enrichedHospital]) => setHospital(enrichedHospital || data.hospital))
          .catch(() => {
            // Facility details remain available without Google Places enrichment.
          });
      })
      .catch(err => {
        if (linkedHospital && assertProductionSafe(linkedHospital)) {
          setHospital(linkedHospital);
          setDoctors(productionSafe(linkedHospital.doctors || []));
          setBookableDoctors(productionSafe(linkedHospital.bookableDoctors || []));
          return;
        }
        setError(err.message || 'Could not load facility');
      })
      .finally(() => setLoading(false));
  }, [id, linkedHospital]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center gap-3 bg-care-neutral text-care-muted"><Loader2 className="h-6 w-6 animate-spin text-care-primary" /> Loading facility information...</div>;
  }

  if (!hospital || error) {
    return (
      <div className="min-h-screen bg-care-neutral">
        <PublicHeader />
        <div className="mx-auto max-w-3xl px-5 py-24 text-center"><h1 className="text-2xl font-bold text-care-heading">Facility unavailable</h1><p className="mt-3 text-care-muted">{error}</p></div>
      </div>
    );
  }

  const publicDoctors = doctors.filter(doctor => !bookableDoctors.some(item => item.id === doctor.id));

  return (
    <div className="min-h-screen bg-care-neutral text-care-body">
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <Card as="section" padding="lg">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
            <div className="flex gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-care-primary-subtle text-care-heading"><Building2 className="h-6 w-6" /></span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold text-care-heading sm:text-3xl">{hospital.name}</h1>
                  <Badge variant={hospital.verificationStatus === 'verified' ? 'success' : 'info'}>{hospital.verificationStatus === 'verified' ? 'Verified' : 'Public directory'}</Badge>
                </div>
                <p className="mt-3 flex items-start gap-2 text-sm text-care-muted"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-care-primary-hover" /> {hospital.address || [hospital.district, hospital.state].filter(Boolean).join(', ')}</p>
                <HospitalRatingSummary
                  ratingAvg={hospital.ratingAvg}
                  ratingCount={hospital.ratingCount}
                  googleRating={hospital.googleRating}
                  className="mt-3"
                />
                <HospitalOperatingHours operatingHours={hospital.operatingHours} compact className="mt-3" />
                {hospital.verificationSourceUrl && <a href={hospital.verificationSourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-care-primary-hover">View directory source <ExternalLink className="h-3.5 w-3.5" /></a>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(hospital.phone || hospital.mobile) && <a href={`tel:${String(hospital.phone || hospital.mobile).replace(/[^\d+]/g, '')}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-care-border px-4 text-sm font-semibold text-care-heading"><Phone className="h-4 w-4" /> Call facility</a>}
              {hospital.website && <a href={hospital.website} target="_blank" rel="noreferrer" className={buttonStyles()}><Globe2 className="h-4 w-4" /> Website</a>}
            </div>
          </div>

          <div className="mt-8 grid gap-6 border-t border-care-border pt-6 md:grid-cols-2">
            <div>
              <h2 className="text-xs font-bold text-care-muted">DEPARTMENTS AND SERVICES</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {hospital.departments?.length ? hospital.departments.map(department => <Badge key={department} variant="info">{department}</Badge>) : <span className="text-sm text-care-muted">Department information has not been published.</span>}
              </div>
            </div>
            <div>
              <h2 className="text-xs font-bold text-care-muted">DIRECTORY INFORMATION</h2>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-care-muted">Facility type</dt><dd className="mt-1 font-semibold">{hospital.hospital_type || hospital.hospitalType || 'Healthcare facility'}</dd></div>
                <div><dt className="text-xs text-care-muted">Location</dt><dd className="mt-1 font-semibold">{hospital.district || hospital.city || 'Not listed'}, {hospital.state}</dd></div>
              </dl>
            </div>
          </div>
        </Card>

        <section className="mt-10">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div><span className="text-xs font-bold text-care-primary-hover">CARE TEAM</span><h2 className="mt-2 text-2xl font-bold text-care-heading">Doctors at this facility</h2></div>
            <span className="hidden items-center gap-2 text-xs text-care-muted sm:inline-flex"><ShieldCheck className="h-4 w-4 text-care-primary-hover" /> Verification status shown per doctor</span>
          </div>

          {bookableDoctors.length || publicDoctors.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {bookableDoctors.map(doctor => (
                <Card as="article" key={doctor.id} hoverable>
                  <div className="flex items-start gap-4"><Avatar name={doctor.fullName} id={doctor.id} src={doctor.profilePictureUrl} /><div><h3 className="font-bold text-care-heading">{doctor.fullName}</h3><p className="mt-1 text-sm font-semibold text-care-primary-hover">{doctor.specialization}</p><DoctorRatingSummary ratingAvg={doctor.ratingAvg} ratingCount={doctor.ratingCount} className="mt-2" /><p className="mt-2 text-xs text-care-muted">{doctor.yearsExperience || 0} years experience {doctor.consultationFee > 0 ? ` | INR ${doctor.consultationFee}` : ''}</p></div></div>
                  <Link to={`/doctor/${doctor.id}`} className={buttonStyles({ block: true, className: 'mt-5' })}><CalendarPlus className="h-4 w-4" /> View availability</Link>
                </Card>
              ))}
              {publicDoctors.map(doctor => (
                <Card as="article" key={doctor.id} hoverable>
                  <div className="flex items-start gap-4"><Avatar name={doctor.fullName} id={doctor.id} src={doctor.profilePictureUrl} /><div><h3 className="font-bold text-care-heading">{doctor.fullName}</h3><p className="mt-1 text-sm font-semibold text-care-primary-hover">{doctor.specialization}</p><DoctorRatingSummary ratingAvg={doctor.ratingAvg} ratingCount={doctor.ratingCount} className="mt-2" /><Badge variant="success" className="mt-2">Verified</Badge></div></div>
                  <div className="mt-4"><PublicAvailability availability={doctor.publicAvailability} /></div>
                  <Link to={`/doctor/${doctor.id}`} className={buttonStyles({ variant: 'secondary', block: true, className: 'mt-4' })}>View doctor profile</Link>
                  {doctor.officialBookingUrl && <a href={doctor.officialBookingUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-care-heading text-sm font-semibold text-care-heading">Official booking page <ExternalLink className="h-4 w-4" /></a>}
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-care-border bg-care-surface p-10 text-center">
              <Stethoscope className="mx-auto h-7 w-7 text-care-muted" />
              <h3 className="mt-3 font-bold text-care-heading">Doctor roster not yet published</h3>
              <p className="mt-2 text-sm text-care-muted">Contact the facility directly to confirm departments, doctors, and appointment times.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
