import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Calendar, MapPin, AlertTriangle, Loader2, Siren, Star, X, Repeat2, Ban, CalendarPlus } from 'lucide-react';
import { Avatar, Badge, Card, CardSkeleton, StatusBadge, buttonStyles } from '../../../shared/ui';
import { productionSafe } from '../../../lib/developmentFixtures';
import PatientPortalHeader from '../../../shared/PatientPortalHeader';
import PortalBackButton from '../../../shared/PortalBackButton';
import { API_URL } from '../../../lib/api';

export default function AppointmentHistory() {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [appointments, setAppointments] = useState([]);
  const [selectedReviewApp, setSelectedReviewApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('upcoming'); // 'upcoming' or 'past'
  const [selectedCancelApp, setSelectedCancelApp] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/appointments/patient`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to load booking history');
      }
      setAppointments(productionSafe(data.appointments));
    } catch (err) {
      setError(err.message || 'Error loading appointments');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Form states for rating and review
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!selectedReviewApp) return;

    if (rating < 1 || rating > 5) {
      setSubmitError('Please select a rating between 1 and 5 stars');
      return;
    }

    setSubmitLoading(true);
    setSubmitError('');

    try {
      const res = await fetch(`${API_URL}/appointments/${selectedReviewApp.id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          rating,
          reviewText
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to submit review');
      }
      setSelectedReviewApp(null);
      setRating(5);
      setReviewText('');
      fetchHistory();
    } catch (err) {
      setSubmitError(err.message || 'Error submitting review');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleCancelAppointment = async () => {
    if (!selectedCancelApp) return;
    setCancelLoading(true);
    setCancelError('');

    try {
      const res = await fetch(`${API_URL}/appointments/${selectedCancelApp.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'cancelled' })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to cancel appointment');
      }
      setSelectedCancelApp(null);
      await fetchHistory();
    } catch (err) {
      setCancelError(err.message || 'Unable to cancel this appointment');
    } finally {
      setCancelLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchHistory();
    }
  }, [token, fetchHistory]);

  const activeStatuses = new Set(['booked', 'confirmed']);
  const upcomingList = appointments.filter(app => activeStatuses.has(app.status) && new Date(app.appointmentTime) >= new Date());
  const pastList = appointments.filter(app => !upcomingList.includes(app));

  const filteredList = filter === 'upcoming' ? upcomingList : pastList;

  // Format date helper
  const formatDateTime = (isoString) => {
    const d = new Date(isoString);
    const date = d.toLocaleDateString([], { dateStyle: 'full' });
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return { date, time };
  };

  return (
    <div className="portal-theme min-h-screen bg-care-neutral text-care-body font-sans flex flex-col justify-between">
      <div>
        <PatientPortalHeader />

        {/* Main Content */}
        <main className="max-w-3xl mx-auto px-6 py-12">
          <PortalBackButton label="Back to patient home" className="mb-5" />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
            <div>
              <h1 className="flex items-center text-3xl font-extrabold text-care-heading">
                <Calendar className="w-8 h-8 mr-3 text-care-success shrink-0" /> My Appointments
              </h1>
              <p className="text-sm text-care-muted leading-relaxed mt-1">
                Track your active clinic schedules and review histories.
              </p>
            </div>

            {/* Filter Toggle tabs */}
            <div className="care-segmented self-start sm:self-center">
              <button
                onClick={() => setFilter('upcoming')}
                className={`care-segment ${filter === 'upcoming' ? 'care-segment-active' : ''}`}
              >
                Upcoming ({upcomingList.length})
              </button>
              <button
                onClick={() => setFilter('past')}
                className={`care-segment ${filter === 'past' ? 'care-segment-active' : ''}`}
              >
                History ({pastList.length})
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg flex items-start text-xs">
              <AlertTriangle className="w-5 h-5 mr-3 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <CardSkeleton count={2} />
          ) : filteredList.length === 0 ? (
            <Card className="flex flex-col items-center py-14 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-care-primary bg-care-primary-subtle text-care-primary-hover">
                <CalendarPlus className="h-7 w-7" />
              </span>
              <h2 className="mt-4 text-lg font-bold text-care-heading">
                {filter === 'upcoming' ? 'No upcoming appointments' : 'No appointment history yet'}
              </h2>
              <p className="mt-2 max-w-sm text-sm text-care-muted">
                {filter === 'upcoming' ? 'Find a nearby doctor and reserve a convenient in-person visit.' : 'Completed and cancelled appointments will appear here.'}
              </p>
              {filter === 'upcoming' && (
                <button onClick={() => navigate('/patient/dashboard')} className={buttonStyles({ className: 'mt-5' })}>
                  <CalendarPlus className="h-4 w-4" /> Book your next appointment
                </button>
              )}
            </Card>
          ) : (
            <div className="space-y-5">
              {filteredList.map(app => {
                const { date, time } = formatDateTime(app.appointmentTime);
                return (
                  <Card key={app.id} hoverable padding="lg">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      
                      <div className="space-y-3.5">
                        <div className="flex items-start gap-3">
                          <Avatar name={app.doctor?.fullName} id={app.doctor?.id} size="sm" />
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-extrabold text-care-surface text-base leading-snug">{app.doctor?.fullName}</h4>
                              {app.appointmentType === 'emergency' && (
                                <Badge variant="danger" icon={Siren}>Emergency</Badge>
                              )}
                            </div>
                            <span className="text-xs font-semibold text-care-success">{app.doctor?.specialization}</span>
                          </div>
                        </div>

                        <div className="space-y-1.5 pl-0.5">
                          <div className="flex items-center text-care-muted text-xs">
                            <MapPin className="w-3.5 h-3.5 mr-2 text-care-muted shrink-0" />
                            <span>{app.hospital?.name}</span>
                          </div>
                          <div className="flex max-w-xl items-center pl-5 text-[11px] text-care-muted">
                            <span className="truncate" title={app.hospital?.address}>{app.hospital?.address}</span>
                          </div>
                        </div>

                        {app.symptomQuery && (
                          <div className="p-3 bg-care-neutral rounded-lg border border-care-border text-xs text-care-muted leading-relaxed max-w-xl italic">
                            " {app.symptomQuery} "
                          </div>
                        )}

                        {app.notes && (
                          <div className="p-4 bg-care-neutral border border-care-border rounded-lg space-y-3 max-w-xl">
                            <div>
                              <span className="block text-[10px] font-bold text-care-muted uppercase mb-1">Clinical Notes</span>
                              <p className="text-xs text-care-muted leading-relaxed whitespace-pre-line">{app.notes.notes}</p>
                            </div>
                            {app.notes.prescription && (
                              <div className="border-t border-care-border pt-3">
                                <span className="block text-[10px] font-bold text-care-muted uppercase mb-1">Rx / Prescription</span>
                                <p className="text-xs text-care-success leading-relaxed font-mono whitespace-pre-line">{app.notes.prescription}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {app.review && (
                          <div className="p-3.5 bg-care-neutral border border-care-warning rounded-lg max-w-xl space-y-1">
                            <div className="flex items-center text-xs font-semibold text-care-warning">
                              <Star className="w-3.5 h-3.5 fill-care-warning text-care-warning mr-1.5 shrink-0" />
                              <span>Your Rating: {app.review.rating} / 5</span>
                            </div>
                            {app.review.reviewText && (
                              <p className="text-[11px] text-care-muted leading-relaxed italic">
                                "{app.review.reviewText}"
                              </p>
                            )}
                          </div>
                        )}

                        {app.status === 'completed' && !app.review && (
                          <button
                            onClick={() => setSelectedReviewApp(app)}
                            className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                          >
                            <Star className="w-3.5 h-3.5 text-care-warning fill-care-warning mr-1.5 shrink-0" />
                            <span>Rate this Doctor</span>
                          </button>
                        )}

                        {app.doctor?.id && (
                          <button
                            onClick={() => navigate(`/patient/doctor/${app.doctor.id}`)}
                            className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'ml-2' })}
                          >
                            <Repeat2 className="w-3.5 h-3.5 text-care-success mr-1.5 shrink-0" />
                            <span>Rebook</span>
                          </button>
                        )}
                        {app.status === 'booked' && (
                          <button
                            onClick={() => {
                              setCancelError('');
                              setSelectedCancelApp(app);
                            }}
                            className={buttonStyles({ variant: 'danger', size: 'sm', className: 'ml-2' })}
                          >
                            <Ban className="w-3.5 h-3.5 mr-1.5" />
                            Cancel
                          </button>
                        )}
                      </div>

                      {/* Right info details */}
                      <div className="flex flex-col items-end gap-3 shrink-0 self-end md:self-start">
                        <StatusBadge status={app.status} />

                        <div className="text-right">
                          <span className="block text-sm font-extrabold text-care-muted">{time}</span>
                          <span className="block text-[10px] font-semibold text-care-muted uppercase mt-0.5">{date}</span>
                        </div>
                      </div>

                    </div>
                  </Card>
                );
              })}
              {filter === 'upcoming' && upcomingList.length <= 1 && (
                <Card className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="font-bold text-care-heading">Plan ahead for your next visit</h3>
                    <p className="mt-1 text-sm text-care-muted">Browse verified doctors and physical appointment slots near you.</p>
                  </div>
                  <button onClick={() => navigate('/patient/dashboard')} className={buttonStyles()}>
                    <CalendarPlus className="h-4 w-4" /> Book appointment
                  </button>
                </Card>
              )}
            </div>
          )}
        </main>
      </div>

      {selectedReviewApp && (
        <div className="fixed inset-0 z-50 bg-care-neutral/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-md care-surface-raised p-6 md:p-8 shadow-2xl relative">
            <button
              onClick={() => setSelectedReviewApp(null)}
              disabled={submitLoading}
              className="absolute top-4 right-4 text-care-muted hover:text-care-surface transition-colors disabled:opacity-40"
            >
              <X className="w-5 h-5" />
            </button>

            <form onSubmit={handleReviewSubmit} className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-care-heading mb-2">Rate Practitioner</h3>
                <p className="text-xs text-care-muted leading-relaxed">
                  How was your in-person appointment with <strong>{selectedReviewApp.doctor?.fullName}</strong>?
                </p>
              </div>

              {/* Interactive stars */}
              <div className="space-y-2">
                <span className="block text-[10px] font-semibold text-care-muted uppercase">Select Rating</span>
                <div className="flex space-x-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="p-1 rounded-lg hover:bg-care-neutral transition-colors"
                    >
                      <Star
                        className={`w-8 h-8 transition-colors ${
                          star <= rating
                            ? 'text-care-warning fill-care-warning'
                            : 'text-care-muted'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Review Comment text */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-care-muted uppercase">Review comments (Optional)</label>
                <textarea
                  rows={3}
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Share details of your experience (e.g. communication, friendliness, professionalism)..."
                  className="w-full bg-care-neutral border border-care-border rounded-lg p-3 text-care-body placeholder:text-care-muted focus:outline-none focus:border-care-primary text-xs resize-none transition-colors"
                />
              </div>

              {submitError && (
                <div className="p-3 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg text-xs">
                  {submitError}
                </div>
              )}

              <div className="flex space-x-3 pt-1">
                <button
                  type="button"
                  disabled={submitLoading}
                  onClick={() => setSelectedReviewApp(null)}
                  className="flex-1 py-2.5 bg-care-neutral hover:bg-care-neutral text-care-surface rounded-lg text-xs font-medium border border-care-border transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="flex-1 py-2.5 bg-care-primary hover:bg-care-primary-hover text-care-surface rounded-lg text-xs font-semibold shadow-lg shadow-care-primary/20 transition-all flex items-center justify-center space-x-2"
                >
                  {submitLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>Submit Review</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedCancelApp && (
        <div className="fixed inset-0 z-50 bg-care-neutral/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-md care-surface-raised p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-care-surface">Cancel appointment?</h3>
                <p className="text-xs text-care-muted mt-2 leading-relaxed">
                  This releases your slot with {selectedCancelApp.doctor?.fullName} and notifies the clinic.
                </p>
              </div>
              <button
                onClick={() => setSelectedCancelApp(null)}
                disabled={cancelLoading}
                className="p-1 text-care-muted hover:text-care-surface disabled:opacity-40"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {cancelError && (
              <div className="mt-4 p-3 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg text-xs">
                {cancelError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                onClick={() => setSelectedCancelApp(null)}
                disabled={cancelLoading}
                className="py-2.5 bg-care-neutral hover:bg-care-neutral text-care-surface rounded-lg text-xs font-semibold disabled:opacity-40"
              >
                Keep Appointment
              </button>
              <button
                onClick={handleCancelAppointment}
                disabled={cancelLoading}
                className="py-2.5 bg-care-danger hover:bg-care-danger text-care-surface rounded-lg text-xs font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {cancelLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full border-t border-care-border bg-care-neutral py-4 text-center text-xs text-care-muted">
        &copy; 2026 Swasthya Sarthi Platform. Verified Appointment Record.
      </footer>
    </div>
  );
}
