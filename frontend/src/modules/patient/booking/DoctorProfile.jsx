import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ArrowLeft, Award, Clock, AlertTriangle, CalendarOff, CheckCircle, Loader2, Siren, X, MapPin } from 'lucide-react';
import { Avatar, Badge, Card, buttonStyles } from '../../../shared/ui';
import { DoctorRatingSummary } from '../../../shared/HospitalRating';
import PublicAvailability from '../../../shared/PublicAvailability';
import { assertProductionSafe } from '../../../lib/developmentFixtures';
import PatientPortalHeader from '../../../shared/PatientPortalHeader';
import PortalBackButton from '../../../shared/PortalBackButton';
import { API_URL } from '../../../lib/api';

export default function DoctorProfile({ publicView = false }) {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [doctor, setDoctor] = useState(null);
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [availabilityInfo, setAvailabilityInfo] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Booking confirmation modal state
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [symptomText, setSymptomText] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [appointmentType, setAppointmentType] = useState('routine');

  // 1. Generate rolling 7 days strip
  useEffect(() => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      const weekday = date.toLocaleDateString([], { weekday: 'short' });
      const dayNum = date.getDate();
      list.push({ dateStr, weekday, dayNum });
    }
    setDates(list);
    if (list.length > 0) {
      setSelectedDate(list[0].dateStr);
    }
  }, []);

  // 2. Fetch doctor profile details
  useEffect(() => {
    async function fetchDoctor() {
      try {
        const res = await fetch(`${API_URL}/doctors/${doctorId}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error?.message || 'Doctor profile not found');
        }
        if (!assertProductionSafe(data.doctor)) throw new Error('Doctor profile not found');
        setDoctor(data.doctor);
      } catch (err) {
        setError(err.message || 'Failed to load doctor profile');
      } finally {
        setProfileLoading(false);
      }
    }
    if (doctorId && (token || publicView)) {
      fetchDoctor();
    }
  }, [doctorId, publicView, token]);

  // 3. Fetch slots whenever selectedDate or doctorId changes
  useEffect(() => {
    async function fetchSlots() {
      if (!selectedDate) return;
      setSlotsLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_URL}/doctors/${doctorId}/available-slots?date=${selectedDate}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.message || 'Failed to load slots');
        }
        setSlots(data.slots || []);
        setAvailabilityInfo({
          status: data.availabilityStatus || (data.slots?.length ? 'available' : 'fully_booked'),
          message: data.availabilityMessage || '',
          leavePeriods: data.leavePeriods || []
        });
      } catch (err) {
        setError(err.message || 'Error fetching availability');
        setAvailabilityInfo(null);
      } finally {
        setSlotsLoading(false);
      }
    }
    if (doctorId && (token || publicView) && selectedDate) {
      fetchSlots();
    }
  }, [doctorId, publicView, selectedDate, token]);

  // 4. Handle Slot Booking Submission
  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSlot) return;
    if (!token) {
      navigate('/login/patient', { state: { returnTo: `/doctor/${doctorId}` } });
      return;
    }
    setBookingLoading(true);
    setBookingError('');

    try {
      const res = await fetch(`${API_URL}/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          doctorId: doctor.id,
          hospitalId: selectedSlot.hospitalId,
          appointmentTime: selectedSlot.time,
          symptomQuery: symptomText,
          appointmentType,
          visitType: 'in_person'
        })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to book slot');
      }

      setBookingSuccess(true);
    } catch (err) {
      setBookingError(err.message || 'An error occurred during booking');
    } finally {
      setBookingLoading(false);
    }
  };

  if (profileLoading) {
    return (
      <div className="portal-theme min-h-screen bg-care-neutral text-care-body flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-10 h-10 animate-spin text-care-success mb-4" />
        <span className="text-care-muted text-sm">Checking in-person appointment schedules...</span>
      </div>
    );
  }

  if (error && !doctor) {
    return (
      <div className="portal-theme min-h-screen bg-care-neutral text-care-body flex flex-col items-center justify-center p-6 font-sans">
        <div className="p-3 bg-care-neutral text-care-danger border border-care-danger/20 rounded-lg mb-4">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold mb-2">Failed to load doctor</h3>
        <p className="text-care-muted text-sm mb-6">{error}</p>
        <button onClick={() => navigate(-1)} className="px-6 py-2.5 bg-care-neutral hover:bg-care-neutral text-care-surface rounded-lg border border-care-border transition-all text-sm">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="portal-theme min-h-screen bg-care-neutral text-care-body font-sans flex flex-col justify-between relative">
      <div>
        {publicView ? (
          <header className="sticky top-0 z-20 border-b border-care-border bg-care-neutral/80 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
              <Link to="/" className="inline-flex items-center text-sm text-care-muted transition-colors hover:text-care-surface">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Swasthya Sarthi
              </Link>
              <Link to="/login/patient" className="text-xs font-semibold text-care-success transition-colors hover:text-care-success">
                Patient sign in
              </Link>
            </div>
          </header>
        ) : (
          <PatientPortalHeader />
        )}

        {/* Main content */}
        <main className="max-w-4xl mx-auto px-6 py-12">
          {!publicView && <PortalBackButton label="Back to doctors" className="mb-5" />}
          
          {/* Doctor Bio Card */}
          <Card padding="lg" className="mb-8 flex flex-col gap-6 overflow-hidden md:flex-row">
            <Avatar name={doctor.fullName} id={doctor.id} src={doctor.profilePictureUrl} size="lg" />

            <div className="space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-extrabold text-care-heading md:text-3xl">{doctor.fullName}</h1>
                  {doctor.directoryOnly && <Badge variant="info">Verified directory</Badge>}
                </div>
                <span className="text-sm font-semibold text-care-success uppercase block mt-1">{doctor.specialization}</span>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-care-muted">
                {doctor.yearsExperience != null && (
                  <span className="flex items-center"><Award className="w-4 h-4 mr-1.5 text-care-muted" /> {doctor.yearsExperience} Years Experience</span>
                )}
                <DoctorRatingSummary ratingAvg={doctor.ratingAvg} ratingCount={doctor.ratingCount} />
                {doctor.licenseNo && (
                  <span className="flex items-center"><Clock className="w-4 h-4 mr-1.5 text-care-muted" /> Lic: {doctor.licenseNo}</span>
                )}
                <span className="font-semibold text-care-muted">
                  {doctor.consultationFee > 0
                    ? `In-person visit fee: INR ${doctor.consultationFee}`
                    : 'Visit fee set by hospital'}
                </span>
              </div>

              {doctor.bio && (
                <p className="text-sm text-care-muted italic leading-relaxed border-t border-care-border/60 pt-4">
                  "{doctor.bio}"
                </p>
              )}
            </div>
          </Card>

          {doctor.directoryOnly && doctor.hospitals?.length > 0 && (
            <Card padding="lg" className="mb-8">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-care-heading">Hospitals and OPD details</h2>
                <p className="mt-1 text-xs leading-5 text-care-muted">
                  This profile opens inside Swasthya Sarthi and is linked to verified hospital-directory sources.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {doctor.hospitals.map(hospital => (
                  <div key={hospital.associationId || hospital.id} className="rounded-lg border border-care-border bg-care-neutral p-4">
                    <h3 className="font-bold text-care-heading">{hospital.name}</h3>
                    <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-care-muted">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {[hospital.address, hospital.district, hospital.state, hospital.pincode].filter(Boolean).join(', ')}
                    </p>
                    {hospital.departmentName && <Badge variant="info" className="mt-3">{hospital.departmentName}</Badge>}
                    <div className="mt-4"><PublicAvailability availability={hospital.publicAvailability} /></div>
                    <Link to={`/patient/hospital/${hospital.id}`} className={buttonStyles({ block: true, size: 'sm', className: 'mt-4' })}>View facility profile</Link>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Booking Slots Area */}
          <Card padding="lg">
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-care-primary bg-care-primary-subtle p-4 text-care-primary-hover">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-care-primary-hover" />
              <div>
                <strong className="block text-sm">In-person hospital or clinic appointment</strong>
                <p className="mt-1 text-xs leading-5 text-care-primary-hover">Swasthya Sarthi reserves the appointment only. You must visit the facility shown with your selected time; no video or online consultation is provided.</p>
              </div>
            </div>
            <div className="flex flex-col gap-4 border-b border-care-border pb-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold">Select Date & Time</h3>
                <p className="mt-1 text-xs text-care-muted">Choose the appointment priority before selecting a slot.</p>
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-care-border bg-care-neutral p-1" aria-label="Appointment priority">
                <button
                  type="button"
                  onClick={() => setAppointmentType('routine')}
                  className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors ${appointmentType === 'routine' ? 'bg-care-surface text-care-primary-hover shadow-sm ring-1 ring-care-primary' : 'text-care-muted hover:text-care-heading'}`}
                >
                  Routine
                </button>
                <button
                  type="button"
                  onClick={() => setAppointmentType('emergency')}
                  className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${appointmentType === 'emergency' ? 'bg-care-surface text-care-danger shadow-sm ring-1 ring-care-danger' : 'text-care-muted hover:text-care-danger'}`}
                >
                  <Siren className="h-3.5 w-3.5" /> Emergency
                </button>
              </div>
            </div>

            {appointmentType === 'emergency' && (
              <div className="mt-5 rounded-lg border border-care-danger bg-care-surface p-4 text-sm text-care-danger">
                <div className="flex items-start gap-3">
                  <Siren className="mt-0.5 h-5 w-5 shrink-0 text-care-danger" />
                  <div>
                    <strong className="block">Emergency priority appointment</strong>
                    <p className="mt-1 text-xs leading-5 text-care-danger">This highlights your booking to the care team but does not dispatch emergency services. For life-threatening symptoms, call 112 or go to the nearest emergency department now.</p>
                    {slots.length > 0 && (
                      <button type="button" onClick={() => setSelectedSlot(slots[0])} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg bg-care-danger px-3 text-xs font-semibold text-care-surface hover:bg-care-danger">
                        <Clock className="h-3.5 w-3.5" /> Choose earliest available slot
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Dates rolling selection strip */}
            <div className="mt-6 flex space-x-2 overflow-x-auto pb-4 mb-6 scrollbar-thin md:space-x-3">
              {dates.map((d) => (
                <button
                  key={d.dateStr}
                  onClick={() => setSelectedDate(d.dateStr)}
                  className={`flex flex-col items-center justify-center min-w-[64px] py-3.5 px-3 rounded-lg border text-center transition-all shrink-0 ${selectedDate === d.dateStr ? 'bg-care-primary border-care-primary text-care-surface shadow-lg shadow-care-primary/25 scale-105' : 'bg-care-neutral border-care-border text-care-muted hover:border-care-primary hover:text-care-heading'}`}
                >
                  <span className="text-[10px] uppercase font-bold mb-1">{d.weekday}</span>
                  <span className="text-base font-extrabold">{d.dayNum}</span>
                </button>
              ))}
            </div>

            {/* Times slots grid */}
            <div>
              <span className="block text-xs font-semibold text-care-muted uppercase mb-4">Available In-Person Appointment Times</span>

              {availabilityInfo?.status && availabilityInfo.status !== 'available' && (
                <div className={`mb-4 flex items-start gap-3 rounded-lg border p-4 text-sm ${availabilityInfo.status.includes('leave') ? 'border-care-warning bg-care-surface text-care-warning' : 'border-care-border bg-care-neutral text-care-body'}`}>
                  <CalendarOff className={`mt-0.5 h-5 w-5 shrink-0 ${availabilityInfo.status.includes('leave') ? 'text-care-warning' : 'text-care-muted'}`} />
                  <div>
                    <strong className="block">{availabilityInfo.status === 'on_leave' ? 'Doctor on leave' : availabilityInfo.status === 'partially_on_leave' ? 'Limited hours due to leave' : availabilityInfo.status === 'no_schedule' ? 'No clinic hours published' : 'Slots fully booked'}</strong>
                    <p className="mt-1 text-xs leading-5">{availabilityInfo.message}</p>
                  </div>
                </div>
              )}

              {slotsLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-care-muted">
                  <Loader2 className="w-6 h-6 animate-spin text-care-success mb-2" />
                  <span className="text-xs">Checking available timings...</span>
                </div>
              ) : slots.length === 0 ? (
                <div className="py-12 text-center text-care-muted text-sm border-2 border-dashed border-care-border rounded-lg">
                  {availabilityInfo?.message || 'No in-person appointment times are available on this date.'}
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {slots.map((slot, index) => {
                    const localTime = new Date(slot.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    return (
                      <button
                        key={index}
                        onClick={() => {
                          setSelectedSlot(slot);
                          setBookingError('');
                        }}
                        className="py-2.5 px-3 bg-care-neutral hover:bg-care-neutral border border-care-border hover:border-care-border text-care-muted font-mono font-medium rounded-lg text-center text-xs transition-colors active:scale-95"
                      >
                        {localTime}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </main>
      </div>

      {/* Booking confirmation drawer modal */}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 bg-care-neutral/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-md care-surface-raised p-6 md:p-8 shadow-2xl relative">
            <button
              onClick={() => {
                if (!bookingSuccess) setSelectedSlot(null);
              }}
              className="absolute top-4 right-4 text-care-muted hover:text-care-surface transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {!bookingSuccess ? (
              <form onSubmit={handleBookingSubmit} className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-care-surface mb-2">Confirm Appointment</h3>
                  <p className="text-xs text-care-muted leading-relaxed">
                    Review and confirm details to complete your reservation.
                  </p>
                </div>

                <div className="p-4 bg-care-neutral border border-care-border rounded-lg space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <strong>Priority:</strong>
                    <Badge variant={appointmentType === 'emergency' ? 'danger' : 'success'}>{appointmentType}</Badge>
                  </div>
                  <div><strong>Practitioner:</strong> {doctor.fullName}</div>
                  <div><strong>Specialty:</strong> {doctor.specialization}</div>
                  <div><strong>Visit type:</strong> In-person at the facility</div>
                  <div><strong>Appointment date:</strong> {new Date(selectedSlot.time).toLocaleDateString([], { dateStyle: 'full' })}</div>
                  <div><strong>Time:</strong> {new Date(selectedSlot.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  <div className="flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-care-muted" />
                    <span>
                      <strong>Location:</strong> {selectedSlot.hospitalName}
                      {selectedSlot.hospitalAddress ? `, ${selectedSlot.hospitalAddress}` : ''}
                    </span>
                  </div>
                  <div>
                    <strong>Fee:</strong>{' '}
                    {doctor.consultationFee > 0 ? `INR ${doctor.consultationFee}` : 'Confirm with clinic'}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-care-muted uppercase">
                    Symptoms / Notes {appointmentType === 'emergency' ? '(Required)' : '(Optional)'}
                  </label>
                  <textarea
                    rows={2}
                    required={appointmentType === 'emergency'}
                    value={symptomText}
                    onChange={(e) => setSymptomText(e.target.value)}
                    placeholder="Briefly describe what you are experiencing..."
                    className="w-full bg-care-neutral border border-care-border rounded-lg p-3 text-care-body placeholder:text-care-muted focus:outline-none focus:border-care-primary text-xs resize-none transition-colors"
                  />
                </div>

                {bookingError && (
                  <div className="p-3 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg text-xs flex items-start">
                    <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                    <span>{bookingError}</span>
                  </div>
                )}

                <div className="flex space-x-3">
                  <button
                    type="button"
                    disabled={bookingLoading}
                    onClick={() => setSelectedSlot(null)}
                    className={buttonStyles({ variant: 'secondary', className: 'flex-1' })}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={bookingLoading || (appointmentType === 'emergency' && symptomText.trim().length < 5)}
                    className={buttonStyles({ className: 'flex-1' })}
                  >
                    {bookingLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Booking...</span>
                      </>
                    ) : (
                      <span>{token ? 'Confirm Booking' : 'Sign in to book'}</span>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center space-y-6 py-4">
                <div className="w-12 h-12 bg-care-primary-subtle border border-care-success/20 text-care-success rounded-full flex items-center justify-center mx-auto shadow-lg shadow-care-primary/10">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-xl font-bold text-care-surface">Booking Confirmed!</h3>
                  <p className="text-xs text-care-muted leading-relaxed px-4">
                    Your {appointmentType === 'emergency' ? 'emergency priority ' : ''}appointment with {doctor.fullName} has been successfully recorded in our schedules.
                  </p>
                </div>
                <div className="flex flex-col gap-2 pt-2">
                  <Link
                    to="/patient/appointments"
                    className={buttonStyles({ block: true })}
                  >
                    View My Appointments
                  </Link>
                  <button
                    onClick={() => {
                      setSelectedSlot(null);
                      setBookingSuccess(false);
                      setSymptomText('');
                      setAppointmentType('routine');
                      // Refresh slots list
                      setSelectedDate('');
                      setTimeout(() => setSelectedDate(dates[0]?.dateStr), 10);
                    }}
                    className={buttonStyles({ variant: 'secondary', block: true })}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full border-t border-care-border bg-care-neutral py-4 text-center text-xs text-care-muted">
        &copy; 2026 Swasthya Sarthi Platform. Secure Scheduling Node.
      </footer>
    </div>
  );
}
