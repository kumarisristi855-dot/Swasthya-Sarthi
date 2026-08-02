import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { CheckCircle, Clock, User, ShieldAlert, Loader2, Trash2, Plus, CalendarRange, MapPin, RefreshCw, Moon, BookOpen, Siren, X } from 'lucide-react';
import ConsultationNotes from './consultation/ConsultationNotes';
import PortalHeader from '../../shared/PortalHeader';
import ProfilePhotoUploader from '../../shared/ProfilePhotoUploader';
import { StatusBadge } from '../../shared/ui/Badge';
import { API_URL } from '../../lib/api';
import { useTranslation } from 'react-i18next';

function toLocalDateTimeInput(date) {
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function DoctorDashboard() {
  const { t } = useTranslation(['doctor-portal', 'common']);
  const { user, token, logout, uploadProfilePhoto, removeProfilePhoto } = useAuth();
  
  const [activeTab, setActiveTab] = useState('queue'); // 'queue', 'availability', 'timeoff'
  
  // State for appointments
  const [selectedConsult, setSelectedConsult] = useState(null);
  const [patientHistory, setPatientHistory] = useState(null);
  const [patientHistoryLoading, setPatientHistoryLoading] = useState(false);
  const [patientHistoryError, setPatientHistoryError] = useState('');
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState('');

  // State for availability
  const [availability, setAvailability] = useState([]);
  const [availLoading, setAvailLoading] = useState(true);
  const [availError, setAvailError] = useState('');
  
  // State for time-offs
  const [timeOffs, setTimeOffs] = useState([]);
  const [timeOffLoading, setTimeOffLoading] = useState(true);
  const [timeOffError, setTimeOffError] = useState('');
  
  // State for affiliated hospitals (for dropdown)
  const [affiliates, setAffiliates] = useState([]);
  const [affiliatesError, setAffiliatesError] = useState('');

  // Form states for adding availability
  const [newAvail, setNewAvail] = useState({
    hospitalId: '',
    dayOfWeek: '1', // Monday default
    startTime: '09:00',
    endTime: '17:00',
    slotDurationMinutes: '15'
  });
  const [availSubmitLoading, setAvailSubmitLoading] = useState(false);

  // Form states for adding time-off
  const [newTimeOff, setNewTimeOff] = useState({
    startDatetime: '',
    endDatetime: '',
    reason: ''
  });
  const [timeOffSubmitLoading, setTimeOffSubmitLoading] = useState(false);
  const [emergencyLeaveOpen, setEmergencyLeaveOpen] = useState(false);
  const [emergencyLeaveEnd, setEmergencyLeaveEnd] = useState('');
  const [emergencyLeaveReason, setEmergencyLeaveReason] = useState('Urgent personal matter');
  const [emergencyLeaveLoading, setEmergencyLeaveLoading] = useState(false);
  const [emergencyLeaveError, setEmergencyLeaveError] = useState('');
  const [emergencyLeaveMessage, setEmergencyLeaveMessage] = useState('');
  const [endLeaveOpen, setEndLeaveOpen] = useState(false);
  const [endLeaveLoading, setEndLeaveLoading] = useState(false);
  const [endLeaveError, setEndLeaveError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);

  const daysOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // 1. Fetch Today's Queue
  const fetchQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueError('');
    try {
      const res = await fetch(`${API_URL}/doctors/${user.id}/appointments/today`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to fetch appointments queue');
      }
      setQueue(data.appointments || []);
    } catch (err) {
      setQueueError(err.message || 'Error fetching queue');
    } finally {
      setQueueLoading(false);
    }
  }, [user?.id, token]);

  // 2. Fetch Availability Rules
  const fetchAvailability = useCallback(async () => {
    setAvailLoading(true);
    setAvailError('');
    try {
      const res = await fetch(`${API_URL}/doctors/${user.id}/availability`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to fetch weekly slots');
      }
      setAvailability(data.availability || []);
    } catch (err) {
      setAvailError(err.message || 'Error fetching slots list');
    } finally {
      setAvailLoading(false);
    }
  }, [user?.id, token]);

  // 3. Fetch Time-off Rules
  const fetchTimeOffs = useCallback(async () => {
    setTimeOffLoading(true);
    setTimeOffError('');
    try {
      const res = await fetch(`${API_URL}/doctors/${user.id}/time-off`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to fetch time-offs list');
      }
      setTimeOffs(data.timeOff || []);
    } catch (err) {
      setTimeOffError(err.message || 'Error loading blocked slots');
    } finally {
      setTimeOffLoading(false);
    }
  }, [user?.id, token]);

  // 4. Fetch Accepted Hospital Affiliations
  const fetchAffiliations = useCallback(async () => {
    setAffiliatesError('');
    try {
      const res = await fetch(`${API_URL}/doctors/${user.id}/hospitals`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to load hospital affiliations');
      }

      const list = data.hospitals || [];

      setAffiliates(list);
      if (list.length > 0) {
        setNewAvail(prev => ({ ...prev, hospitalId: list[0].id }));
      }
    } catch (err) {
      console.error('Failed to load doctor affiliations:', err);
      setAffiliatesError('Failed to load affiliated clinics dropdown');
    }
  }, [user?.id, token]);

  useEffect(() => {
    if (user?.id && token) {
      fetchQueue();
      fetchAvailability();
      fetchTimeOffs();
      fetchAffiliations();
    }
  }, [user, token, fetchQueue, fetchAvailability, fetchTimeOffs, fetchAffiliations]);

  // Handle Availability Rule Submission
  const handleAvailSubmit = async (e) => {
    e.preventDefault();
    if (!newAvail.hospitalId) {
      setAvailError('Please select a hospital affiliation first');
      return;
    }
    setAvailSubmitLoading(true);
    setAvailError('');
    try {
      const res = await fetch(`${API_URL}/doctors/${user.id}/availability`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          hospitalId: newAvail.hospitalId,
          dayOfWeek: newAvail.dayOfWeek,
          startTime: `${newAvail.startTime}:00`,
          endTime: `${newAvail.endTime}:00`,
          slotDurationMinutes: newAvail.slotDurationMinutes
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to submit availability block');
      }
      
      fetchAvailability();
    } catch (err) {
      setAvailError(err.message || 'Error saving availability');
    } finally {
      setAvailSubmitLoading(false);
    }
  };

  // Handle Delete Availability Rule
  const handleAvailDelete = async (availId) => {
    setAvailError('');
    try {
      const res = await fetch(`${API_URL}/doctors/${user.id}/availability/${availId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to delete availability');
      }
      
      setAvailability(prev => prev.filter(a => a.id !== availId));
    } catch (err) {
      setAvailError(err.message || 'Error deleting slot rule');
    }
  };

  // Handle Time-off Submission
  const handleTimeOffSubmit = async (e) => {
    e.preventDefault();
    const start = new Date(newTimeOff.startDatetime);
    const end = new Date(newTimeOff.endDatetime);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start.getTime() >= end.getTime()
    ) {
      setTimeOffError('Choose a valid time range with the end after the start');
      return;
    }
    setTimeOffSubmitLoading(true);
    setTimeOffError('');

    try {
      const res = await fetch(`${API_URL}/doctors/${user.id}/time-off`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          startDatetime: start.toISOString(),
          endDatetime: end.toISOString(),
          reason: newTimeOff.reason
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to add time-off block');
      }

      setNewTimeOff({ startDatetime: '', endDatetime: '', reason: '' });
      fetchTimeOffs();
    } catch (err) {
      setTimeOffError(err.message || 'Error blocking slots');
    } finally {
      setTimeOffSubmitLoading(false);
    }
  };

  // Handle Delete Time-off Block
  const handleTimeOffDelete = async (timeOffId) => {
    setTimeOffError('');
    try {
      const res = await fetch(`${API_URL}/doctors/${user.id}/time-off/${timeOffId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to delete time-off range');
      }
      
      setTimeOffs(prev => prev.filter(t => t.id !== timeOffId));
    } catch (err) {
      setTimeOffError(err.message || 'Error removing leave block');
    }
  };

  const openEmergencyLeave = () => {
    setEmergencyLeaveEnd(toLocalDateTimeInput(new Date(Date.now() + 2 * 60 * 60 * 1000)));
    setEmergencyLeaveReason('Urgent personal matter');
    setEmergencyLeaveError('');
    setEmergencyLeaveOpen(true);
  };

  const handleEmergencyLeave = async (event) => {
    event.preventDefault();
    const end = new Date(emergencyLeaveEnd);
    if (Number.isNaN(end.getTime())) {
      setEmergencyLeaveError('Choose when the emergency leave should end.');
      return;
    }

    setEmergencyLeaveLoading(true);
    setEmergencyLeaveError('');
    try {
      const response = await fetch(`${API_URL}/doctors/${user.id}/emergency-leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          endDatetime: end.toISOString(),
          reason: emergencyLeaveReason
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Failed to apply emergency leave');

      setEmergencyLeaveMessage(data.message);
      setEmergencyLeaveOpen(false);
      await Promise.all([fetchTimeOffs(), fetchQueue()]);
    } catch (err) {
      setEmergencyLeaveError(err.message || 'Failed to apply emergency leave');
    } finally {
      setEmergencyLeaveLoading(false);
    }
  };

  const handleEndLeaveNow = async () => {
    if (!activeLeave) return;
    setEndLeaveLoading(true);
    setEndLeaveError('');
    try {
      const response = await fetch(`${API_URL}/doctors/${user.id}/time-off/${activeLeave.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Failed to end leave');

      setEmergencyLeaveMessage('Leave ended. Your remaining published appointment slots are available again.');
      setEndLeaveOpen(false);
      await fetchTimeOffs();
    } catch (err) {
      setEndLeaveError(err.message || 'Failed to end leave');
    } finally {
      setEndLeaveLoading(false);
    }
  };

  // Format single slot time
  const formatSlotTime = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Compute counters
  const totalPatientsCount = queue.length;
  const remainingPatientsCount = queue.filter(q => q.status === 'booked').length;
  const activeLeave = timeOffs.find(block => {
    const now = Date.now();
    return new Date(block.start_datetime).getTime() <= now && new Date(block.end_datetime).getTime() > now;
  });

  const fetchPatientHistory = async (patient) => {
    setPatientHistoryLoading(true);
    setPatientHistoryError('');
    setPatientHistory({ patient, history: [] });
    try {
      const res = await fetch(`${API_URL}/doctors/${user.id}/patients/${patient.id}/history`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to fetch patient history');
      }
      setPatientHistory({ patient, history: data.history || [] });
    } catch (err) {
      setPatientHistoryError(err.message || 'Failed to fetch patient history');
    } finally {
      setPatientHistoryLoading(false);
    }
  };

  return (
    <div className="care-shell portal-dashboard flex flex-col justify-between">
      <div>
        <PortalHeader
          role={t('doctor-portal:portalRole')}
          userLabel={`Dr. ${user?.full_name || ''}`}
          onLogout={logout}
          profile={{
            id: user?.id,
            name: `Dr. ${user?.full_name || t('doctor-portal:doctorFallback')}`,
            label: t('doctor-portal:profile'),
            email: user?.email,
            phone: user?.phone,
            organization: affiliates[0]?.name || t('doctor-portal:affiliatedNetwork'),
            avatarUrl: user?.avatar_url
          }}
          onEditProfile={() => setProfileOpen(true)}
        />

        {/* Dashboard Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-7 sm:py-10">
          <div className="portal-page-header">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <span className="care-eyebrow">{t('doctor-portal:clinicalWorkspace')}</span>
                <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-care-heading">{t('doctor-portal:careScheduleTitle')}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-care-muted">{t('doctor-portal:careScheduleCopy')}</p>
              </div>
              <button
                type="button"
                onClick={openEmergencyLeave}
                disabled={Boolean(activeLeave)}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-care-danger bg-care-surface px-4 text-sm font-semibold text-care-danger shadow-sm transition-colors hover:bg-care-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Siren className="h-4 w-4" /> {activeLeave ? t('doctor-portal:currentlyOnLeave') : t('doctor-portal:emergencyLeave')}
              </button>
            </div>
            {emergencyLeaveMessage && (
              <div className="care-alert-success mt-4 max-w-2xl">{emergencyLeaveMessage}</div>
            )}
            {activeLeave && (
              <div className="care-alert-warning mt-4 flex max-w-2xl flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                <Moon className="mt-0.5 h-5 w-5 shrink-0 text-care-warning" />
                <div>
                  <strong className="block text-sm">{t('doctor-portal:markedOnLeave')}</strong>
                  <p className="mt-1 text-xs leading-5">Until {new Date(activeLeave.end_datetime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}{activeLeave.reason ? ` · ${activeLeave.reason}` : ''}</p>
                </div>
                </div>
                <button type="button" onClick={() => { setEndLeaveError(''); setEndLeaveOpen(true); }} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-care-warning bg-care-surface px-3 text-xs font-semibold text-care-warning hover:bg-care-surface">
                  <X className="h-3.5 w-3.5" /> {t('doctor-portal:endLeaveNow')}
                </button>
              </div>
            )}
          </div>
          
          {/* Navigation Tab strip */}
          <div className="care-segmented mb-8">
            <button
              onClick={() => setActiveTab('queue')}
              className={`care-segment ${activeTab === 'queue' ? 'care-segment-active' : ''}`}
            >
              <User className="w-4 h-4" />
              <span>{t('doctor-portal:todayAppointments')}</span>
            </button>
            <button
              onClick={() => setActiveTab('availability')}
              className={`care-segment ${activeTab === 'availability' ? 'care-segment-active' : ''}`}
            >
              <Clock className="w-4 h-4" />
              <span>{t('doctor-portal:weeklyAvailability')}</span>
            </button>
            <button
              onClick={() => setActiveTab('timeoff')}
              className={`care-segment ${activeTab === 'timeoff' ? 'care-segment-active' : ''}`}
            >
              <Moon className="w-4 h-4" />
              <span>{t('doctor-portal:blockedLeave')}</span>
            </button>
          </div>

          {/* TAB 1: Today's Queue */}
          {activeTab === 'queue' && (
            <div className="space-y-8">
              {/* Counters cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="care-surface p-6 relative overflow-hidden flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-care-muted uppercase block">{t('doctor-portal:todayTotalPatients')}</span>
                    <span className="text-4xl font-black text-care-heading block">{totalPatientsCount}</span>
                  </div>
                  <div className="p-3 bg-care-primary-subtle text-care-success border border-care-success/20 rounded-lg">
                    <User className="w-6 h-6" />
                  </div>
                </div>

                <div className="care-surface p-6 relative overflow-hidden flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-care-muted uppercase block">{t('doctor-portal:remainingAppointments')}</span>
                    <span className="text-4xl font-black text-care-heading block">{remainingPatientsCount}</span>
                  </div>
                  <div className="p-3 bg-care-primary-subtle text-care-primary border border-care-primary/20 rounded-lg">
                    <Clock className="w-6 h-6" />
                  </div>
                </div>
              </div>

              {/* Physical appointment queue */}
              <div className="care-surface p-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="portal-panel-title text-lg font-bold">{t('doctor-portal:appointmentQueue')}</h3>
                    <p className="mt-1 text-xs text-care-muted">{t('doctor-portal:appointmentQueueCopy')}</p>
                  </div>
                  <button
                    onClick={fetchQueue}
                    className="care-button-ghost care-button-sm"
                    title={t('doctor-portal:refreshQueue')}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t('doctor-portal:refresh')}</span>
                  </button>
                </div>

                {queueError && (
                  <div className="p-3 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg text-xs flex items-start mb-6">
                    <ShieldAlert className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                    <span>{queueError}</span>
                  </div>
                )}

                {queueLoading ? (
                  <div className="py-16 flex flex-col items-center justify-center text-care-muted">
                    <Loader2 className="w-8 h-8 animate-spin text-care-success mb-3" />
                    <span className="text-sm">{t('doctor-portal:fetchingQueue')}</span>
                  </div>
                ) : queue.length === 0 ? (
                  <div className="portal-empty-state">
                    {t('doctor-portal:noAppointmentsToday')}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {queue.map(app => (
                      <div key={app.id} className="care-card care-card-hover p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-bold text-care-body text-base">{app.patient?.fullName || t('doctor-portal:anonymousPatient')}</h4>
                            {app.appointmentType === 'emergency' && (
                              <span className="inline-flex items-center gap-1 rounded-md border border-care-danger bg-care-surface px-2 py-1 text-[10px] font-bold uppercase text-care-danger">
                                <Siren className="h-3 w-3" /> {t('doctor-portal:emergencyPriority')}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-care-muted">
                            <span className="flex items-center"><MapPin className="w-3.5 h-3.5 mr-1" /> {app.hospital?.name}</span>
                            <span>Contact: {app.patient?.email}</span>
                          </div>
                          {app.symptomQuery && (
                            <p className="text-xs text-care-muted mt-2 bg-care-neutral/50 p-2.5 rounded-lg italic leading-relaxed">
                              " {app.symptomQuery} "
                            </p>
                          )}
                        </div>

                        <div className="flex items-center space-x-6 shrink-0 self-end md:self-center">
                          <div className="text-right">
                            <span className="block text-sm font-extrabold text-care-muted">{formatSlotTime(app.appointmentTime)}</span>
                            <span className="block text-[9px] font-semibold text-care-muted uppercase mt-0.5">{t('doctor-portal:today')}</span>
                          </div>
                          
                          {app.status === 'booked' ? (
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => fetchPatientHistory(app.patient)}
                                disabled={!app.patient?.id}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-care-border bg-care-surface text-care-muted hover:border-care-primary hover:bg-care-primary-subtle hover:text-care-heading"
                                title={t('doctor-portal:patientHistory')}
                              >
                                <BookOpen className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setSelectedConsult(app)}
                                className="py-1.5 px-3 bg-care-primary hover:bg-care-primary-hover text-care-surface text-xs font-semibold rounded-lg shadow-md shadow-care-primary/10 active:scale-95 transition-all"
                              >
                                {t('doctor-portal:recordVisit')}
                              </button>
                            </div>
                          ) : (
                            <StatusBadge status={app.status} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Weekly Availability */}
          {activeTab === 'availability' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Form to add availability */}
              <div className="care-surface p-6 h-fit">
                <div className="flex items-center space-x-2.5 mb-4">
                  <div className="p-2 bg-care-primary-subtle text-care-success rounded-lg border border-care-success/20">
                    <Plus className="w-5 h-5" />
                  </div>
                  <h3 className="portal-panel-title text-lg font-bold">Add Schedule Block</h3>
                </div>

                {availError && (
                  <div className="p-3 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg text-xs flex items-start mb-4">
                    <ShieldAlert className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                    <span>{availError}</span>
                  </div>
                )}

                {affiliatesError && (
                  <div className="p-3 bg-care-neutral border border-care-warning/20 text-care-warning rounded-lg text-xs mb-4">
                    {affiliatesError}
                  </div>
                )}

                {affiliates.length === 0 ? (
                  <div className="p-4 border border-care-border bg-care-neutral rounded-lg text-xs text-care-muted text-center leading-relaxed">
                    You have no accepted hospital affiliations. You must be accepted at a clinic before setting hours.
                  </div>
                ) : (
                  <form onSubmit={handleAvailSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Target Hospital</label>
                      <select
                        name="hospitalId"
                        required
                        value={newAvail.hospitalId}
                        onChange={(e) => setNewAvail({ ...newAvail, hospitalId: e.target.value })}
                        className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-4 text-care-body focus:outline-none focus:border-care-primary text-sm transition-colors"
                      >
                        {affiliates.map(h => (
                          <option key={h.id} value={h.id}>{h.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Day of Week</label>
                      <select
                        name="dayOfWeek"
                        required
                        value={newAvail.dayOfWeek}
                        onChange={(e) => setNewAvail({ ...newAvail, dayOfWeek: e.target.value })}
                        className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-4 text-care-body focus:outline-none focus:border-care-primary text-sm transition-colors"
                      >
                        <option value="1">Monday</option>
                        <option value="2">Tuesday</option>
                        <option value="3">Wednesday</option>
                        <option value="4">Thursday</option>
                        <option value="5">Friday</option>
                        <option value="6">Saturday</option>
                        <option value="0">Sunday</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Start Time</label>
                        <input
                          type="time"
                          required
                          value={newAvail.startTime}
                          onChange={(e) => setNewAvail({ ...newAvail, startTime: e.target.value })}
                          className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-4 text-care-body focus:outline-none focus:border-care-primary text-sm transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-care-muted uppercase mb-1">End Time</label>
                        <input
                          type="time"
                          required
                          value={newAvail.endTime}
                          onChange={(e) => setNewAvail({ ...newAvail, endTime: e.target.value })}
                          className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-4 text-care-body focus:outline-none focus:border-care-primary text-sm transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Slot Size (Minutes)</label>
                      <select
                        name="slotDurationMinutes"
                        required
                        value={newAvail.slotDurationMinutes}
                        onChange={(e) => setNewAvail({ ...newAvail, slotDurationMinutes: e.target.value })}
                        className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-4 text-care-body focus:outline-none focus:border-care-primary text-sm transition-colors"
                      >
                        <option value="15">15 Minutes</option>
                        <option value="30">30 Minutes</option>
                        <option value="45">45 Minutes</option>
                        <option value="60">60 Minutes</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={availSubmitLoading}
                      className="w-full py-2.5 bg-care-primary hover:bg-care-primary-hover text-care-surface font-medium rounded-lg transition-all shadow-lg shadow-care-primary/20 active:scale-95 disabled:opacity-50 text-sm flex items-center justify-center space-x-2"
                    >
                      {availSubmitLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Saving hours...</span>
                        </>
                      ) : (
                        <span>Save Weekly Blocks</span>
                      )}
                    </button>
                  </form>
                )}
              </div>

              {/* List of existing recurring availabilities */}
              <div className="lg:col-span-2 care-surface p-6">
                <h3 className="text-lg font-bold mb-6">Weekly Schedules</h3>

                {availLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center text-care-muted">
                    <Loader2 className="w-6 h-6 animate-spin text-care-success mb-2" />
                    <span className="text-xs">Fetching availability grids...</span>
                  </div>
                ) : availability.length === 0 ? (
                  <div className="portal-empty-state">
                    No recurring schedule hours configured. Available slots query will be empty.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {availability.map(avail => (
                      <div key={avail.id} className="care-card care-card-hover p-5 flex items-center justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center space-x-2">
                            <span className="px-2.5 py-0.5 rounded bg-care-primary-subtle text-care-success text-xs font-bold font-mono">
                              {daysOfWeekNames[avail.dayOfWeek]}
                            </span>
                            <span className="text-xs text-care-muted font-mono">
                              Slot: {avail.slotDurationMinutes} min
                            </span>
                          </div>
                          <div className="text-sm font-extrabold text-care-muted">
                            {avail.startTime.slice(0, 5)} - {avail.endTime.slice(0, 5)}
                          </div>
                          <div className="text-xs text-care-muted flex items-center">
                            <MapPin className="w-3.5 h-3.5 mr-1" />
                            {avail.hospitalName}
                          </div>
                        </div>

                        <button
                          onClick={() => handleAvailDelete(avail.id)}
                          className="p-2.5 bg-care-neutral hover:bg-care-neutral text-care-muted hover:text-care-danger border border-care-border hover:border-care-danger/20 rounded-lg transition-all"
                          title="Remove Block"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Blocked Leave (Time-Off) */}
          {activeTab === 'timeoff' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Add leave form */}
              <div className="care-surface p-6 h-fit">
                <div className="flex items-center space-x-2.5 mb-4">
                  <div className="p-2 bg-care-primary-subtle text-care-success rounded-lg border border-care-success/20">
                    <CalendarRange className="w-5 h-5" />
                  </div>
                  <h3 className="portal-panel-title text-lg font-bold">Block Leave / Break</h3>
                </div>

                {timeOffError && (
                  <div className="p-3 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg text-xs flex items-start mb-4">
                    <ShieldAlert className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                    <span>{timeOffError}</span>
                  </div>
                )}

                <form onSubmit={handleTimeOffSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Start Datetime</label>
                    <input
                      type="datetime-local"
                      required
                      value={newTimeOff.startDatetime}
                      onChange={(e) => setNewTimeOff({ ...newTimeOff, startDatetime: e.target.value })}
                      className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-4 text-care-body focus:outline-none focus:border-care-primary text-xs transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-care-muted uppercase mb-1">End Datetime</label>
                    <input
                      type="datetime-local"
                      required
                      value={newTimeOff.endDatetime}
                      onChange={(e) => setNewTimeOff({ ...newTimeOff, endDatetime: e.target.value })}
                      className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-4 text-care-body focus:outline-none focus:border-care-primary text-xs transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Reason / Note</label>
                    <input
                      type="text"
                      placeholder="e.g. Conference, Medical Leave"
                      value={newTimeOff.reason}
                      onChange={(e) => setNewTimeOff({ ...newTimeOff, reason: e.target.value })}
                      className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-4 text-care-body placeholder:text-care-muted focus:outline-none focus:border-care-primary text-xs transition-colors"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={timeOffSubmitLoading}
                    className="w-full py-2.5 bg-care-primary hover:bg-care-primary-hover text-care-surface font-medium rounded-lg transition-all shadow-lg shadow-care-primary/20 active:scale-95 disabled:opacity-50 text-sm flex items-center justify-center space-x-2"
                  >
                    {timeOffSubmitLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Blocking times...</span>
                      </>
                    ) : (
                      <span>Apply Time-Off Block</span>
                    )}
                  </button>
                </form>
              </div>

              {/* List of leave blocks */}
              <div className="lg:col-span-2 care-surface p-6">
                <h3 className="text-lg font-bold mb-6">Upcoming Time-Off Breaks</h3>

                {timeOffLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center text-care-muted">
                    <Loader2 className="w-6 h-6 animate-spin text-care-success mb-2" />
                    <span className="text-xs">Fetching leaves history...</span>
                  </div>
                ) : timeOffs.length === 0 ? (
                  <div className="portal-empty-state">
                    No time-off breaks scheduled. All recurring hours are active.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {timeOffs.map(to => {
                      const startText = new Date(to.start_datetime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                      const endText = new Date(to.end_datetime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                      return (
                        <div key={to.id} className="care-card care-card-hover p-5 flex items-center justify-between gap-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center space-x-2">
                              <span className="px-2.5 py-0.5 rounded bg-care-neutral text-care-danger text-[10px] font-bold uppercase font-mono">
                                Blocked Leave
                              </span>
                              {to.reason && (
                                <span className="text-xs text-care-muted italic">
                                  "{to.reason}"
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-bold text-care-muted leading-relaxed font-mono">
                              Start: {startText}
                            </div>
                            <div className="text-xs font-bold text-care-muted leading-relaxed font-mono">
                              End: {endText}
                            </div>
                          </div>

                          <button
                            onClick={() => handleTimeOffDelete(to.id)}
                            className="p-2.5 bg-care-neutral hover:bg-care-neutral text-care-muted hover:text-care-danger border border-care-border hover:border-care-danger/20 rounded-lg transition-all"
                            title="Remove Leave Block"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

        </main>
      </div>

      {endLeaveOpen && activeLeave && (
        <div
          className="care-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-leave-dialog-title"
        >
          <div className="care-surface-raised relative w-full max-w-md p-6 sm:p-8">
            <button type="button" onClick={() => setEndLeaveOpen(false)} disabled={endLeaveLoading} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-care-muted hover:bg-care-neutral hover:text-care-heading disabled:opacity-40" aria-label="Close end leave dialog">
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-start gap-3 pr-10">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-care-warning bg-care-surface text-care-warning"><Moon className="h-5 w-5" /></span>
              <div>
                <h2 id="end-leave-dialog-title" className="text-xl font-bold text-care-heading">End leave now?</h2>
                <p className="mt-1 text-sm leading-6 text-care-muted">Your remaining published slots will become bookable immediately.</p>
              </div>
            </div>
            <div className="mt-5 rounded-lg border border-care-border bg-care-neutral p-4 text-xs leading-5 text-care-muted">
              Appointments already cancelled during this leave will stay cancelled. Patients must book a new available slot.
            </div>
            {endLeaveError && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-care-danger bg-care-surface p-3 text-xs text-care-danger">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {endLeaveError}
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setEndLeaveOpen(false)} disabled={endLeaveLoading} className="care-button-secondary flex-1">Keep leave</button>
              <button type="button" onClick={handleEndLeaveNow} disabled={endLeaveLoading} className="care-button-primary flex-1">
                {endLeaveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {endLeaveLoading ? 'Ending...' : 'End leave now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {emergencyLeaveOpen && (
        <div
          className="care-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="emergency-leave-dialog-title"
        >
          <form onSubmit={handleEmergencyLeave} className="care-surface-raised relative w-full max-w-lg p-6 sm:p-8">
            <button
              type="button"
              onClick={() => setEmergencyLeaveOpen(false)}
              disabled={emergencyLeaveLoading}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-care-muted hover:bg-care-neutral hover:text-care-heading disabled:opacity-40"
              aria-label="Close emergency leave dialog"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-start gap-3 pr-10">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-care-danger bg-care-surface text-care-danger">
                <Siren className="h-5 w-5" />
              </span>
              <div>
                <h2 id="emergency-leave-dialog-title" className="text-xl font-bold text-care-heading">Start emergency leave</h2>
                <p className="mt-1 text-sm leading-6 text-care-muted">Your availability will be blocked immediately until the selected time.</p>
              </div>
            </div>

            <div className="care-alert-warning mt-6 p-4 text-xs leading-5">
              Booked appointments during this period will be cancelled. Each affected patient will receive an SMS and email asking them to rebook.
            </div>

            <div className="mt-6 space-y-2">
              <label htmlFor="emergency-leave-end" className="care-label">Leave ends</label>
              <input
                id="emergency-leave-end"
                type="datetime-local"
                required
                min={toLocalDateTimeInput(new Date(Date.now() + 5 * 60 * 1000))}
                max={toLocalDateTimeInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))}
                value={emergencyLeaveEnd}
                onChange={event => setEmergencyLeaveEnd(event.target.value)}
                className="care-input"
              />
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setEmergencyLeaveEnd(toLocalDateTimeInput(new Date(Date.now() + 2 * 60 * 60 * 1000)))} className="care-button-secondary min-h-9 px-2 py-1.5 text-xs">2 hours</button>
                <button type="button" onClick={() => { const end = new Date(); end.setHours(23, 59, 0, 0); setEmergencyLeaveEnd(toLocalDateTimeInput(end)); }} className="care-button-secondary min-h-9 px-2 py-1.5 text-xs">Rest of today</button>
                <button type="button" onClick={() => setEmergencyLeaveEnd(toLocalDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000)))} className="care-button-secondary min-h-9 px-2 py-1.5 text-xs">24 hours</button>
              </div>
            </div>

            <div className="mt-5">
              <label htmlFor="emergency-leave-reason" className="care-label">Reason</label>
              <input
                id="emergency-leave-reason"
                type="text"
                required
                minLength={3}
                maxLength={120}
                value={emergencyLeaveReason}
                onChange={event => setEmergencyLeaveReason(event.target.value)}
                className="care-input"
                placeholder="Short reason for the care team"
              />
            </div>

            {emergencyLeaveError && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-care-danger bg-care-surface p-3 text-xs text-care-danger">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {emergencyLeaveError}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setEmergencyLeaveOpen(false)} disabled={emergencyLeaveLoading} className="care-button-secondary flex-1">Keep schedule</button>
              <button type="submit" disabled={emergencyLeaveLoading} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-care-danger px-4 py-2.5 text-sm font-semibold text-care-surface hover:bg-care-danger disabled:opacity-50">
                {emergencyLeaveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Siren className="h-4 w-4" />}
                {emergencyLeaveLoading ? 'Applying...' : 'Start leave now'}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedConsult && (
        <ConsultationNotes
          appointment={selectedConsult}
          onClose={() => setSelectedConsult(null)}
          onComplete={fetchQueue}
        />
      )}

      {profileOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-care-heading/45 p-4" role="dialog" aria-modal="true" aria-labelledby="doctor-profile-title">
          <div className="w-full max-w-xl rounded-lg border border-care-border bg-care-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-care-border px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-care-primary-subtle text-care-primary-hover">
                  <User className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="doctor-profile-title" className="text-xl font-bold text-care-heading">{t('doctor-portal:profilePictureTitle')}</h2>
                  <p className="text-sm text-care-muted">{t('doctor-portal:profilePictureCopy')}</p>
                </div>
              </div>
              <button type="button" onClick={() => setProfileOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-care-muted transition-colors hover:bg-care-neutral hover:text-care-heading" aria-label={t('doctor-portal:closeProfileEditor')}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5 p-6">
              <ProfilePhotoUploader user={user} onUpload={uploadProfilePhoto} onRemove={removeProfilePhoto} />
              <div className="rounded-lg border border-care-border bg-care-neutral px-4 py-3">
                <span className="block text-xs font-semibold uppercase text-care-muted">{t('doctor-portal:signedInPractitioner')}</span>
                <span className="mt-1 block font-semibold text-care-heading">Dr. {user?.full_name || t('doctor-portal:doctorFallback')}</span>
                <span className="mt-1 block truncate text-xs text-care-muted">{user?.email || t('common:emailNotAvailable')}</span>
              </div>
              <div className="flex justify-end border-t border-care-border pt-5">
                <button type="button" onClick={() => setProfileOpen(false)} className="min-h-10 rounded-lg bg-care-primary px-4 text-sm font-semibold text-care-surface transition-colors hover:bg-care-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-care-primary focus-visible:ring-offset-2">{t('doctor-portal:done')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {patientHistory && (
        <div className="care-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="patient-history-title"
            className="w-full max-w-2xl max-h-[80vh] overflow-y-auto care-surface-raised p-6 md:p-8 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setPatientHistory(null)}
              aria-label={t('doctor-portal:closePatientHistory')}
              className="absolute top-4 right-4 text-care-muted hover:text-care-heading transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <h3 id="patient-history-title" className="text-xl font-bold text-care-heading">{t('doctor-portal:patientHistory')}</h3>
              <p className="text-xs text-care-muted mt-1">{patientHistory.patient?.fullName} · {patientHistory.patient?.email}</p>
            </div>

            {patientHistoryError && (
              <div className="p-3 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg text-xs mb-4">
                {patientHistoryError}
              </div>
            )}

            {patientHistoryLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-care-muted">
                <Loader2 className="w-6 h-6 animate-spin text-care-success mb-2" />
                <span className="text-xs">{t('doctor-portal:loadingHistory')}</span>
              </div>
            ) : patientHistory.history.length === 0 ? (
              <div className="py-12 text-center border border-care-border rounded-lg text-care-muted text-sm">
                {t('doctor-portal:noPreviousVisits')}
              </div>
            ) : (
              <div className="space-y-4">
                {patientHistory.history.map(item => (
                  <div key={item.id} className="bg-care-surface border border-care-border rounded-lg p-4 space-y-3">
                    <div className="flex justify-between gap-4 text-xs">
                      <div>
                        <div className="font-bold text-care-muted">
                          {new Date(item.appointmentTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                        <div className="text-care-muted mt-0.5">{item.hospital?.name}</div>
                      </div>
                      <span className="px-2 py-0.5 h-fit rounded bg-care-neutral border border-care-border text-[10px] uppercase font-bold text-care-muted">
                        {item.status}
                      </span>
                    </div>
                    {item.symptomQuery && (
                      <p className="text-xs text-care-muted italic">"{item.symptomQuery}"</p>
                    )}
                    {item.notes?.length > 0 && (
                      <div className="border-t border-care-border pt-3 text-xs text-care-muted space-y-2">
                        {item.notes.map((note, idx) => (
                          <div key={idx}>
                            {note.notes && <p className="whitespace-pre-line">{note.notes}</p>}
                            {note.prescription && <p className="text-care-success font-mono mt-1 whitespace-pre-line">Rx: {note.prescription}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full border-t border-care-border bg-care-neutral py-4 text-center text-xs text-care-muted">
        {t('doctor-portal:footer')}
      </footer>
    </div>
  );
}
