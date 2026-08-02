import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Copy, Loader2, Plus, Save, Stethoscope, X } from 'lucide-react';
import { API_URL } from '../../../lib/api';

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const initialManualDoctor = {
  fullName: '',
  email: '',
  phone: '',
  specializationId: '',
  licenseNo: '',
  yearsExperience: '0',
  consultationFee: '500',
  bio: '',
  workingDays: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '17:00',
  slotDurationMinutes: '30'
};

export default function DoctorManagement({ hospitalId, token }) {
  const [doctors, setDoctors] = useState([]);
  const [specializations, setSpecializations] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [form, setForm] = useState({
    specializationId: '',
    consultationFee: '',
    workingDays: [],
    startTime: '09:00',
    endTime: '17:00'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState(initialManualDoctor);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [doctorsRes, specializationsRes] = await Promise.all([
        fetch(`${API_URL}/admin/hospitals/${hospitalId}/doctors/active`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_URL}/specializations`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      const doctorsData = await doctorsRes.json();
      const specializationsData = await specializationsRes.json();
      if (!doctorsRes.ok) {
        throw new Error(doctorsData.error?.message || 'Failed to load active doctors');
      }
      if (!specializationsRes.ok) {
        throw new Error(specializationsData.error?.message || 'Failed to load specializations');
      }
      setDoctors(doctorsData.doctors || []);
      setSpecializations(specializationsData.specializations || []);
      setSelectedDoctorId(current => current || doctorsData.doctors?.[0]?.id || '');
    } catch (err) {
      setError(err.message || 'Unable to load doctor management');
    } finally {
      setLoading(false);
    }
  }, [hospitalId, token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const doctor = doctors.find(item => item.id === selectedDoctorId);
    if (!doctor) return;
    setForm({
      specializationId: String(doctor.specializationId || ''),
      consultationFee: String(doctor.consultationFee ?? ''),
      workingDays: doctor.workingDays || [],
      startTime: doctor.startTime?.slice(0, 5) || '09:00',
      endTime: doctor.endTime?.slice(0, 5) || '17:00'
    });
  }, [doctors, selectedDoctorId]);

  const toggleDay = day => {
    setForm(current => ({
      ...current,
      workingDays: current.workingDays.includes(day)
        ? current.workingDays.filter(item => item !== day)
        : [...current.workingDays, day].sort()
    }));
  };

  const saveProfile = async event => {
    event.preventDefault();
    if (!selectedDoctorId) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(
        `${API_URL}/admin/hospitals/${hospitalId}/doctors/${selectedDoctorId}/profile`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(form)
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to save doctor details');
      }
      await loadData();
      setMessage(data.message);
    } catch (err) {
      setError(err.message || 'Unable to save doctor details');
    } finally {
      setSaving(false);
    }
  };

  const toggleManualDay = day => {
    setManualForm(current => ({
      ...current,
      workingDays: current.workingDays.includes(day)
        ? current.workingDays.filter(item => item !== day)
        : [...current.workingDays, day].sort()
    }));
  };

  const createDoctor = async event => {
    event.preventDefault();
    setManualSaving(true);
    setManualError('');
    try {
      const response = await fetch(`${API_URL}/admin/hospitals/${hospitalId}/doctors/manual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(manualForm)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Failed to create doctor');

      setCreatedCredentials({
        fullName: data.doctor.fullName,
        email: data.doctor.email,
        password: data.temporaryPassword
      });
      setManualForm(initialManualDoctor);
      await loadData();
    } catch (err) {
      setManualError(err.message || 'Failed to create doctor');
    } finally {
      setManualSaving(false);
    }
  };

  const closeManualDialog = () => {
    setManualOpen(false);
    setManualError('');
    setCreatedCredentials(null);
  };

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center text-care-muted">
        <Loader2 className="w-7 h-7 animate-spin text-care-primary mb-3" />
        <span className="text-sm">Loading affiliated doctors...</span>
      </div>
    );
  }

  const selectedDoctor = doctors.find(doctor => doctor.id === selectedDoctorId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-care-heading">Hospital doctors</h2>
          <p className="mt-1 text-xs text-care-muted">Manage affiliated doctors or create a doctor account directly for this hospital.</p>
        </div>
        <button type="button" onClick={() => { setManualError(''); setCreatedCredentials(null); setManualOpen(true); }} className="care-button-primary shrink-0">
          <Plus className="h-4 w-4" /> Add doctor manually
        </button>
      </div>

      {doctors.length === 0 ? (
        <div className="portal-empty-state">
          No active doctors yet. Add one manually or invite a registered doctor from the onboarding registry.
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
      <aside className="border-r border-care-border lg:pr-6">
        <h3 className="text-xs font-semibold uppercase text-care-muted mb-3">Active Doctors</h3>
        <div className="space-y-2">
          {doctors.map(doctor => (
            <button
              key={doctor.id}
              onClick={() => {
                setSelectedDoctorId(doctor.id);
                setMessage('');
                setError('');
              }}
              className={`w-full p-3 text-left border rounded-lg transition-colors ${
                selectedDoctorId === doctor.id
                  ? 'bg-care-primary-subtle border-care-primary/40'
                  : 'bg-care-surface border-care-border hover:border-care-primary/40'
              }`}
            >
              <span className="block text-sm font-bold text-care-body">{doctor.fullName}</span>
              <span className="block text-[10px] text-care-muted mt-1">{doctor.specialization}</span>
            </button>
          ))}
        </div>
      </aside>

      <form onSubmit={saveProfile} className="max-w-2xl space-y-5">
        <div className="flex items-center gap-2">
          <Stethoscope className="w-5 h-5 text-care-primary" />
          <div>
            <h3 className="text-lg font-bold text-care-heading">{selectedDoctor?.fullName}</h3>
            <p className="text-xs text-care-muted">License: {selectedDoctor?.licenseNo || 'Not listed'}</p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg text-xs flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
        {message && (
          <div className="p-3 bg-care-primary-subtle border border-care-success/20 text-care-success rounded-lg text-xs flex gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="text-xs font-semibold text-care-muted">
            Specialization
            <select
              required
              value={form.specializationId}
              onChange={event => setForm({ ...form, specializationId: event.target.value })}
              className="mt-1.5 w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-3 text-care-body"
            >
              <option value="">Select specialization</option>
              {specializations.map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-care-muted">
            In-Person Visit Fee (INR)
            <input
              required
              min="0"
              step="1"
              type="number"
              value={form.consultationFee}
              onChange={event => setForm({ ...form, consultationFee: event.target.value })}
              className="mt-1.5 w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-3 text-care-body"
            />
          </label>
        </div>

        <div>
          <span className="block text-xs font-semibold text-care-muted mb-2">Working Days</span>
          <div className="grid grid-cols-7 gap-2">
            {days.map((label, day) => (
              <button
                key={label}
                type="button"
                onClick={() => toggleDay(day)}
                className={`h-10 border rounded-lg text-[10px] font-semibold ${
                  form.workingDays.includes(day)
                    ? 'bg-care-primary border-care-primary text-care-surface'
                    : 'bg-care-neutral border-care-border text-care-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="text-xs font-semibold text-care-muted">
            Clinic Start
            <input
              required
              type="time"
              value={form.startTime}
              onChange={event => setForm({ ...form, startTime: event.target.value })}
              className="mt-1.5 w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-3 text-care-body"
            />
          </label>
          <label className="text-xs font-semibold text-care-muted">
            Clinic End
            <input
              required
              type="time"
              value={form.endTime}
              onChange={event => setForm({ ...form, endTime: event.target.value })}
              className="mt-1.5 w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-3 text-care-body"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-care-primary hover:bg-care-primary-hover text-care-surface rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Doctor Details
        </button>
      </form>
      </div>
      )}

      {manualOpen && (
        <div
          className="care-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-doctor-dialog-title"
        >
          <div className="care-surface-raised relative max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6 sm:p-8">
            <button type="button" onClick={closeManualDialog} disabled={manualSaving} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-care-muted hover:bg-care-neutral hover:text-care-heading disabled:opacity-40" aria-label="Close add doctor dialog">
              <X className="h-5 w-5" />
            </button>

            {createdCredentials ? (
              <div>
                <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-care-primary bg-care-primary-subtle text-care-primary-hover"><CheckCircle className="h-5 w-5" /></span>
                <h2 id="manual-doctor-dialog-title" className="mt-4 text-xl font-bold text-care-heading">Doctor added successfully</h2>
                <p className="mt-2 text-sm leading-6 text-care-muted">Share these temporary credentials securely with {createdCredentials.fullName}. The password is shown only in this dialog.</p>
                <div className="mt-6 rounded-lg border border-care-border bg-care-neutral p-4 text-sm">
                  <div><span className="text-care-muted">Email</span><strong className="mt-1 block text-care-heading">{createdCredentials.email}</strong></div>
                  <div className="mt-4"><span className="text-care-muted">Temporary password</span><strong className="mt-1 block break-all font-mono text-care-heading">{createdCredentials.password}</strong></div>
                </div>
                <div className="mt-6 flex gap-3">
                  <button type="button" onClick={() => navigator.clipboard.writeText(`Doctor login\nEmail: ${createdCredentials.email}\nTemporary password: ${createdCredentials.password}\nSign in: http://127.0.0.1:5174/login/doctor`)} className="care-button-secondary flex-1"><Copy className="h-4 w-4" /> Copy credentials</button>
                  <button type="button" onClick={closeManualDialog} className="care-button-primary flex-1">Done</button>
                </div>
              </div>
            ) : (
              <form onSubmit={createDoctor}>
                <div className="pr-10">
                  <h2 id="manual-doctor-dialog-title" className="text-xl font-bold text-care-heading">Add doctor manually</h2>
                  <p className="mt-1 text-sm leading-6 text-care-muted">Creates an active doctor login, hospital affiliation, and initial in-person appointment schedule.</p>
                </div>

                {manualError && <div role="alert" className="mt-5 flex gap-2 rounded-lg border border-care-danger bg-care-surface p-3 text-xs text-care-danger"><AlertTriangle className="h-4 w-4 shrink-0" /> {manualError}</div>}

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <label className="care-label">Full name<input required minLength={3} value={manualForm.fullName} onChange={event => setManualForm({ ...manualForm, fullName: event.target.value })} className="care-input mt-1.5" placeholder="Dr. Full Name" /></label>
                  <label className="care-label">Email address<input required type="email" value={manualForm.email} onChange={event => setManualForm({ ...manualForm, email: event.target.value })} className="care-input mt-1.5" placeholder="doctor@hospital.com" /></label>
                  <label className="care-label">Phone number<input value={manualForm.phone} onChange={event => setManualForm({ ...manualForm, phone: event.target.value })} className="care-input mt-1.5" placeholder="+91..." /></label>
                  <label className="care-label">Medical registration number<input required minLength={3} value={manualForm.licenseNo} onChange={event => setManualForm({ ...manualForm, licenseNo: event.target.value })} className="care-input mt-1.5" placeholder="Registration number" /></label>
                  <label className="care-label">Specialization<select required value={manualForm.specializationId} onChange={event => setManualForm({ ...manualForm, specializationId: event.target.value })} className="care-input mt-1.5"><option value="">Select specialization</option>{specializations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label className="care-label">Years of experience<input required type="number" min="0" max="80" value={manualForm.yearsExperience} onChange={event => setManualForm({ ...manualForm, yearsExperience: event.target.value })} className="care-input mt-1.5" /></label>
                  <label className="care-label">In-person visit fee (INR)<input required type="number" min="0" value={manualForm.consultationFee} onChange={event => setManualForm({ ...manualForm, consultationFee: event.target.value })} className="care-input mt-1.5" /></label>
                  <label className="care-label">Appointment duration<select value={manualForm.slotDurationMinutes} onChange={event => setManualForm({ ...manualForm, slotDurationMinutes: event.target.value })} className="care-input mt-1.5">{[15, 30, 45, 60].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label>
                </div>

                <label className="care-label mt-4">Professional summary<textarea rows={2} value={manualForm.bio} onChange={event => setManualForm({ ...manualForm, bio: event.target.value })} className="care-input mt-1.5 resize-none" placeholder="Short clinical profile" /></label>

                <div className="mt-5">
                  <span className="care-label">Working days</span>
                  <div className="grid grid-cols-7 gap-2">{days.map((label, day) => <button key={label} type="button" onClick={() => toggleManualDay(day)} className={`h-10 rounded-lg border text-[10px] font-semibold ${manualForm.workingDays.includes(day) ? 'border-care-primary bg-care-primary-subtle text-care-primary-hover' : 'border-care-border bg-care-surface text-care-muted'}`}>{label}</button>)}</div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-4">
                  <label className="care-label">Clinic starts<input required type="time" value={manualForm.startTime} onChange={event => setManualForm({ ...manualForm, startTime: event.target.value })} className="care-input mt-1.5" /></label>
                  <label className="care-label">Clinic ends<input required type="time" value={manualForm.endTime} onChange={event => setManualForm({ ...manualForm, endTime: event.target.value })} className="care-input mt-1.5" /></label>
                </div>

                <div className="mt-7 flex gap-3">
                  <button type="button" onClick={closeManualDialog} disabled={manualSaving} className="care-button-secondary flex-1">Cancel</button>
                  <button type="submit" disabled={manualSaving || manualForm.workingDays.length === 0} className="care-button-primary flex-1">{manualSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{manualSaving ? 'Creating...' : 'Create doctor'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
