import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertTriangle, Filter, CheckCircle, Plus, Siren, Trash2 } from 'lucide-react';
import { StatusBadge } from '../../../shared/ui/Badge';
import { API_URL } from '../../../lib/api';

export default function ScheduleOverview({ hospitalId, token }) {
  const [appointments, setAppointments] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [activeDoctors, setActiveDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [subTab, setSubTab] = useState('appointments'); // 'appointments' or 'availability'
  const [selectedDoctor, setSelectedDoctor] = useState('all');
  const [confirmingId, setConfirmingId] = useState(null);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState('');
  const [newAvailability, setNewAvailability] = useState({
    doctorId: '',
    dayOfWeek: '1',
    startTime: '09:00',
    endTime: '17:00',
    slotDurationMinutes: '15'
  });

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/admin/hospitals/${hospitalId}/schedule`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to load hospital schedule');
      }
      setAppointments(data.appointments || []);
      setAvailability(data.availability || []);

      const doctorsRes = await fetch(`${API_URL}/admin/hospitals/${hospitalId}/doctors/active`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const doctorsData = await doctorsRes.json();
      if (doctorsRes.ok) {
        setActiveDoctors(doctorsData.doctors || []);
        if (doctorsData.doctors?.length > 0) {
          setNewAvailability(prev => prev.doctorId ? prev : { ...prev, doctorId: doctorsData.doctors[0].id });
        }
      }
    } catch (err) {
      setError(err.message || 'Error fetching schedules');
    } finally {
      setLoading(false);
    }
  }, [hospitalId, token]);

  useEffect(() => {
    if (hospitalId && token) {
      fetchSchedule();
    }
  }, [hospitalId, token, fetchSchedule]);

  // Extract list of unique doctors for the filter dropdown
  const uniqueDoctors = Array.from(new Set(appointments.map(a => JSON.stringify(a.doctor)).filter(Boolean))).map(str => JSON.parse(str));

  // Filter appointments
  const filteredAppointments = selectedDoctor === 'all' 
    ? appointments 
    : appointments.filter(a => a.doctor?.id === selectedDoctor);

  const handleConfirmAppointment = async (appointmentId) => {
    setConfirmingId(appointmentId);
    setConfirmMessage('');
    try {
      const res = await fetch(`${API_URL}/admin/hospitals/${hospitalId}/appointments/${appointmentId}/confirm`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to confirm appointment');
      }
      setConfirmMessage('Confirmation sent to patient.');
      setAppointments(current => current.map(appointment =>
        appointment.id === appointmentId
          ? { ...appointment, confirmationSent: true, confirmedAt: data.confirmedAt || new Date().toISOString() }
          : appointment
      ));
    } catch (err) {
      setConfirmMessage(err.message || 'Unable to confirm appointment.');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleDeleteAvailability = async (availabilityId) => {
    setAvailabilityMessage('');
    try {
      const res = await fetch(`${API_URL}/admin/hospitals/${hospitalId}/availability/${availabilityId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to remove availability');
      }
      setAvailability(current => current.filter(item => item.id !== availabilityId));
      setAvailabilityMessage('Availability block removed.');
    } catch (err) {
      setAvailabilityMessage(err.message || 'Unable to remove availability.');
    }
  };

  const daysOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const handleAddAvailability = async (e) => {
    e.preventDefault();
    if (!newAvailability.doctorId) {
      setAvailabilityMessage('Select an active doctor before adding hours.');
      return;
    }

    setAvailabilitySaving(true);
    setAvailabilityMessage('');
    try {
      const res = await fetch(`${API_URL}/admin/hospitals/${hospitalId}/doctors/${newAvailability.doctorId}/availability`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          dayOfWeek: newAvailability.dayOfWeek,
          startTime: `${newAvailability.startTime}:00`,
          endTime: `${newAvailability.endTime}:00`,
          slotDurationMinutes: newAvailability.slotDurationMinutes
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to add availability');
      }
      setAvailabilityMessage('Availability block added.');
      fetchSchedule();
    } catch (err) {
      setAvailabilityMessage(err.message || 'Failed to add availability.');
    } finally {
      setAvailabilitySaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-care-muted">
        <Loader2 className="w-8 h-8 animate-spin text-care-success mb-3" />
        <span className="text-sm">Fetching hospital schedules...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg text-xs flex items-start">
        <AlertTriangle className="w-5 h-5 mr-3 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Subtab selection */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-care-border pb-4">
        <div className="care-segmented">
          <button
            onClick={() => setSubTab('appointments')}
            className={`care-segment text-xs ${subTab === 'appointments' ? 'care-segment-active' : ''}`}
          >
            Upcoming In-Person Appointments ({appointments.length})
          </button>
          <button
            onClick={() => setSubTab('availability')}
            className={`care-segment text-xs ${subTab === 'availability' ? 'care-segment-active' : ''}`}
          >
            Doctor Weekly Slots ({availability.length})
          </button>
        </div>

        {/* Doctor filter (only for appointments tab) */}
        {subTab === 'appointments' && uniqueDoctors.length > 0 && (
          <div className="flex items-center space-x-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-care-muted" />
            <span className="text-care-muted font-medium">Filter Doctor:</span>
            <select
              value={selectedDoctor}
              onChange={(e) => setSelectedDoctor(e.target.value)}
              className="bg-care-neutral border border-care-border rounded-lg py-1 px-3 text-care-body focus:outline-none focus:border-care-primary text-xs transition-colors"
            >
              <option value="all">All Practitioners</option>
              {uniqueDoctors.map(doc => (
                <option key={doc.id} value={doc.id}>{doc.fullName}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* RENDER TAB 1: Upcoming Appointments */}
      {subTab === 'appointments' && (
        <div className="care-surface overflow-hidden">
          {confirmMessage && (
            <div className="px-6 py-3 bg-care-primary-subtle border-b border-care-success/20 text-care-success text-xs">
              {confirmMessage}
            </div>
          )}
          {filteredAppointments.length === 0 ? (
            <div className="portal-empty-state m-5">
              No upcoming appointments scheduled.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-care-muted">
                <thead className="bg-care-neutral border-b border-care-border text-care-muted uppercase text-[10px] font-bold">
                  <tr>
                    <th className="px-6 py-4">Appointment Time</th>
                    <th className="px-6 py-4">Patient Details</th>
                    <th className="px-6 py-4">Assigned Doctor</th>
                    <th className="px-6 py-4">Symptom Summary</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Confirm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-care-border">
                  {filteredAppointments.map(app => {
                    const localTime = new Date(app.appointmentTime).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    });
                    return (
                      <tr key={app.id} className="hover:bg-care-neutral/20 transition-colors">
                        <td className="px-6 py-4 font-mono font-medium text-care-muted">{localTime}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-care-body">{app.patient?.fullName}</span>
                            {app.appointmentType === 'emergency' && (
                              <span className="inline-flex items-center gap-1 rounded-md border border-care-danger bg-care-surface px-2 py-1 text-[9px] font-bold uppercase text-care-danger">
                                <Siren className="h-3 w-3" /> Emergency
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-care-muted mt-0.5">{app.patient?.email}</div>
                        </td>
                        <td className="px-6 py-4 text-care-muted font-semibold">{app.doctor?.fullName}</td>
                        <td className="px-6 py-4 text-care-muted italic max-w-xs truncate">
                          {app.symptomQuery ? `"${app.symptomQuery}"` : 'None'}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={app.status} />
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleConfirmAppointment(app.id)}
                            disabled={confirmingId === app.id || app.status !== 'booked' || app.confirmationSent}
                            className="p-2 bg-care-primary-subtle hover:bg-care-primary-hover text-care-success hover:text-care-surface border border-care-success/20 hover:border-transparent rounded-lg transition-all disabled:opacity-40 disabled:hover:bg-care-primary-subtle disabled:hover:text-care-success"
                            title={app.confirmationSent ? 'Confirmation sent' : 'Send Confirmation'}
                          >
                            {confirmingId === app.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* RENDER TAB 2: Weekly Availabilities */}
      {subTab === 'availability' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={handleAddAvailability} className="care-surface p-6 h-fit space-y-4">
            <div className="flex items-center space-x-2">
              <Plus className="w-4 h-4 text-care-success" />
              <h3 className="text-sm font-bold text-care-body">Add Doctor Hours</h3>
            </div>

            {availabilityMessage && (
              <div className="p-3 bg-care-surface border border-care-border rounded-lg text-xs text-care-muted">
                {availabilityMessage}
              </div>
            )}

            <div>
              <label className="block text-[10px] font-semibold text-care-muted uppercase mb-1">Doctor</label>
              <select
                required
                value={newAvailability.doctorId}
                onChange={(e) => setNewAvailability({ ...newAvailability, doctorId: e.target.value })}
                className="w-full bg-care-neutral border border-care-border rounded-lg py-2.5 px-3 text-care-body focus:outline-none focus:border-care-primary text-xs"
              >
                {activeDoctors.map(doc => (
                  <option key={doc.id} value={doc.id}>{doc.fullName} - {doc.specialization}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-care-muted uppercase mb-1">Day</label>
              <select
                value={newAvailability.dayOfWeek}
                onChange={(e) => setNewAvailability({ ...newAvailability, dayOfWeek: e.target.value })}
                className="w-full bg-care-neutral border border-care-border rounded-lg py-2.5 px-3 text-care-body focus:outline-none focus:border-care-primary text-xs"
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
              <input
                type="time"
                required
                value={newAvailability.startTime}
                onChange={(e) => setNewAvailability({ ...newAvailability, startTime: e.target.value })}
                className="w-full bg-care-neutral border border-care-border rounded-lg py-2.5 px-3 text-care-body focus:outline-none focus:border-care-primary text-xs"
              />
              <input
                type="time"
                required
                value={newAvailability.endTime}
                onChange={(e) => setNewAvailability({ ...newAvailability, endTime: e.target.value })}
                className="w-full bg-care-neutral border border-care-border rounded-lg py-2.5 px-3 text-care-body focus:outline-none focus:border-care-primary text-xs"
              />
            </div>

            <select
              value={newAvailability.slotDurationMinutes}
              onChange={(e) => setNewAvailability({ ...newAvailability, slotDurationMinutes: e.target.value })}
              className="w-full bg-care-neutral border border-care-border rounded-lg py-2.5 px-3 text-care-body focus:outline-none focus:border-care-primary text-xs"
            >
              <option value="15">15 minute slots</option>
              <option value="30">30 minute slots</option>
              <option value="45">45 minute slots</option>
              <option value="60">60 minute slots</option>
            </select>

            <button
              type="submit"
              disabled={availabilitySaving || activeDoctors.length === 0}
              className="w-full py-2.5 bg-care-primary hover:bg-care-primary-hover text-care-surface text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {availabilitySaving ? 'Saving...' : 'Save Availability'}
            </button>
          </form>

          <div className="lg:col-span-2 care-surface overflow-hidden">
            {availability.length === 0 ? (
              <div className="portal-empty-state m-5">
                No weekly recurring available hours configured.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-care-muted">
                  <thead className="bg-care-neutral border-b border-care-border text-care-muted uppercase text-[10px] font-bold">
                    <tr>
                      <th className="px-6 py-4">Practitioner</th>
                      <th className="px-6 py-4">Day of Week</th>
                      <th className="px-6 py-4">Available Hours</th>
                      <th className="px-6 py-4">Slot Size</th>
                      <th className="px-6 py-4 text-right">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-care-border">
                    {availability.map(avail => (
                      <tr key={avail.id} className="hover:bg-care-neutral/20 transition-colors">
                        <td className="px-6 py-4 font-semibold text-care-muted">{avail.doctorName}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded bg-care-primary-subtle text-care-success font-bold font-mono text-[10px]">
                            {daysOfWeekNames[avail.dayOfWeek]}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono font-medium text-care-muted">
                          {avail.startTime.slice(0, 5)} - {avail.endTime.slice(0, 5)}
                        </td>
                        <td className="px-6 py-4 text-care-muted">{avail.slotDurationMinutes} minutes</td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleDeleteAvailability(avail.id)}
                            className="p-2 bg-care-neutral hover:bg-care-primary-hover text-care-danger hover:text-care-surface border border-care-danger/20 rounded-lg transition-colors"
                            title="Remove availability"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
