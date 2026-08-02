import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Award, CalendarCheck2, CalendarOff, Clock, Loader2, MapPin, ShieldCheck } from 'lucide-react';
import PublicHeader from './PublicHeader';
import PublicAvailability from '../../shared/PublicAvailability';
import { Avatar, Badge, Card, buttonStyles } from '../../shared/ui';
import { DoctorRatingSummary } from '../../shared/HospitalRating';
import { assertProductionSafe } from '../../lib/developmentFixtures';
import { API_URL } from '../../lib/api';

function rollingDates() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return {
      value: [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'),
      weekday: date.toLocaleDateString([], { weekday: 'short' }),
      day: date.getDate(),
    };
  });
}

export default function PublicDoctorProfile() {
  const { doctorId } = useParams();
  const [doctor, setDoctor] = useState(null);
  const [dates] = useState(rollingDates);
  const [selectedDate, setSelectedDate] = useState(() => rollingDates()[0].value);
  const [slots, setSlots] = useState([]);
  const [availabilityInfo, setAvailabilityInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/doctors/${doctorId}`)
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Doctor not found');
        if (!assertProductionSafe(data.doctor)) throw new Error('Doctor not found');
        setDoctor(data.doctor);
      })
      .catch(err => setError(err.message || 'Could not load doctor'))
      .finally(() => setLoading(false));
  }, [doctorId]);

  useEffect(() => {
    setSlotsLoading(true);
    fetch(`${API_URL}/doctors/${doctorId}/available-slots?date=${selectedDate}`)
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Could not load availability');
        setSlots(data.slots || []);
        setAvailabilityInfo({ status: data.availabilityStatus, message: data.availabilityMessage });
      })
      .catch(() => {
        setSlots([]);
        setAvailabilityInfo(null);
      })
      .finally(() => setSlotsLoading(false));
  }, [doctorId, selectedDate]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center gap-3 bg-care-neutral text-care-muted"><Loader2 className="h-6 w-6 animate-spin text-care-primary" /> Loading doctor profile...</div>;
  }

  if (!doctor || error) {
    return <div className="min-h-screen bg-care-neutral"><PublicHeader /><div className="mx-auto max-w-3xl px-5 py-24 text-center"><h1 className="text-2xl font-bold text-care-heading">Doctor unavailable</h1><p className="mt-3 text-care-muted">{error}</p></div></div>;
  }

  return (
    <div className="min-h-screen bg-care-neutral text-care-body">
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        <Card as="section" padding="lg">
          <div className="flex flex-col gap-5 sm:flex-row">
            <Avatar name={doctor.fullName} id={doctor.id} src={doctor.profilePictureUrl} size="lg" />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold text-care-heading sm:text-3xl">{doctor.fullName}</h1><Badge variant={doctor.directoryOnly ? 'info' : 'success'}>{doctor.directoryOnly ? 'Verified directory' : 'CareSync active'}</Badge></div>
              <p className="mt-2 font-semibold text-care-primary-hover">{doctor.specialization}</p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-care-muted">
                <span className="inline-flex items-center gap-2"><Award className="h-4 w-4 text-care-muted" /> {doctor.yearsExperience || 0} years experience</span>
                <DoctorRatingSummary ratingAvg={doctor.ratingAvg} ratingCount={doctor.ratingCount} />
                {doctor.licenseNo && <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-care-muted" /> Registration {doctor.licenseNo}</span>}
              </div>
              {doctor.bio && <p className="mt-5 max-w-3xl text-sm leading-6 text-care-muted">{doctor.bio}</p>}
            </div>
            <div className="rounded-lg bg-care-neutral p-4 sm:min-w-44"><span className="text-xs text-care-muted">In-person visit fee</span><strong className="mt-1 block text-lg text-care-heading">{doctor.consultationFee > 0 ? `INR ${doctor.consultationFee}` : 'Confirm with hospital'}</strong></div>
          </div>
        </Card>

        {doctor.directoryOnly && doctor.hospitals?.length > 0 && (
          <Card as="section" padding="lg" className="mt-6">
            <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-care-primary-hover" /><div><h2 className="text-xl font-bold text-care-heading">Hospitals and OPD details</h2><p className="mt-1 text-sm text-care-muted">This public profile is kept inside CareSync and linked to verified hospital-directory sources.</p></div></div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {doctor.hospitals.map(hospital => (
                <div key={hospital.associationId || hospital.id} className="rounded-lg border border-care-border bg-care-neutral p-4">
                  <h3 className="font-bold text-care-heading">{hospital.name}</h3>
                  <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-care-muted"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {[hospital.address, hospital.district, hospital.state, hospital.pincode].filter(Boolean).join(', ')}</p>
                  {hospital.departmentName && <Badge variant="info" className="mt-3">{hospital.departmentName}</Badge>}
                  <div className="mt-4"><PublicAvailability availability={hospital.publicAvailability} /></div>
                  <Link to={`/hospital/${hospital.id}`} className={buttonStyles({ block: true, size: 'sm', className: 'mt-4' })}>View facility profile</Link>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card as="section" padding="lg" className="mt-6">
          <div className="flex items-center gap-3"><CalendarCheck2 className="h-6 w-6 text-care-primary-hover" /><div><h2 className="text-xl font-bold text-care-heading">In-person appointments</h2><p className="mt-1 text-sm text-care-muted">Choose a day and visit the hospital or clinic shown with the selected time. CareSync does not provide video consultations.</p></div></div>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
            {dates.map(date => <button key={date.value} type="button" onClick={() => setSelectedDate(date.value)} className={`flex min-w-16 shrink-0 flex-col items-center rounded-lg border px-3 py-3 ${selectedDate === date.value ? 'border-care-primary bg-care-primary-subtle text-care-primary-hover' : 'border-care-border text-care-muted hover:border-care-border'}`}><span className="text-[11px] font-semibold">{date.weekday}</span><strong className="mt-1">{date.day}</strong></button>)}
          </div>
          <div className="mt-5 border-t border-care-border pt-5">
            {availabilityInfo?.status && availabilityInfo.status !== 'available' && (
              <div className={`mb-4 flex items-start gap-3 rounded-lg border p-4 ${availabilityInfo.status.includes('leave') ? 'border-care-warning bg-care-surface text-care-warning' : 'border-care-border bg-care-neutral text-care-body'}`}>
                <CalendarOff className="mt-0.5 h-5 w-5 shrink-0" />
                <div><strong className="text-sm">{availabilityInfo.status === 'on_leave' ? 'Doctor on leave' : availabilityInfo.status === 'partially_on_leave' ? 'Limited hours due to leave' : 'No open slots'}</strong><p className="mt-1 text-xs leading-5">{availabilityInfo.message}</p></div>
              </div>
            )}
            {slotsLoading ? (
              <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-care-muted"><Loader2 className="h-5 w-5 animate-spin text-care-primary" /> Checking schedules...</div>
            ) : slots.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {slots.map(slot => (
                  <Card key={`${slot.time}-${slot.hospitalId}`} hoverable padding="sm">
                    <strong className="inline-flex items-center gap-2 text-care-heading"><Clock className="h-4 w-4 text-care-primary-hover" /> {new Date(slot.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                    <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-care-muted"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {slot.hospitalName}</p>
                    <Link to="/login/patient" state={{ returnTo: `/doctor/${doctorId}` }} className={buttonStyles({ block: true, size: 'sm', className: 'mt-4' })}>Sign in to reserve</Link>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-care-border p-8 text-center text-sm text-care-muted">{availabilityInfo?.message || 'No published slots for this date. Select another day or contact the clinic.'}</div>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
