import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { UserPlus, Check, X, AlertCircle, Loader2, Mail, Shield, Calendar, BarChart3, Users, ClipboardCheck, UserCog, Phone, Save } from 'lucide-react';
import ScheduleOverview from './schedule-overview/ScheduleOverview';
import AnalyticsView from './analytics/AnalyticsView';
import DoctorManagement from './doctor-management/DoctorManagement';
import PortalHeader from '../../shared/PortalHeader';
import ProfilePhotoUploader from '../../shared/ProfilePhotoUploader';
import Badge from '../../shared/ui/Badge';
import { API_URL } from '../../lib/api';

export default function AdminDashboard() {
  const { user, token, logout, updateAdminProfile, uploadProfilePhoto, removeProfilePhoto } = useAuth();
  
  const [activeTab, setActiveTab] = useState('onboarding'); // 'onboarding', 'schedule', 'analytics'
  const [pendingDoctors, setPendingDoctors] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ fullName: '', phone: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const openProfileEditor = () => {
    setProfileForm({ fullName: user?.full_name || '', phone: user?.phone || '' });
    setProfileError('');
    setProfileSuccess('');
    setProfileOpen(true);
  };

  const handleProfileSubmit = async event => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError('');
    setProfileSuccess('');
    try {
      await updateAdminProfile(profileForm);
      setProfileSuccess('Your administrator profile has been updated.');
    } catch (profileUpdateError) {
      setProfileError(profileUpdateError.message || 'Could not update your profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  // Fetch pending doctors
  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/hospitals/${user.hospital_id}/doctors/pending`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to fetch pending list');
      }
      setPendingDoctors(data.doctors || []);
    } catch (err) {
      setError(err.message || 'Failed to load pending doctors');
    } finally {
      setLoading(false);
    }
  }, [user?.hospital_id, token]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/hospitals/${user.hospital_id}/summary`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to fetch dashboard summary');
      }
      setSummary(data);
    } catch (err) {
      console.warn('Failed to load hospital dashboard summary:', err);
    }
  }, [user?.hospital_id, token]);

  useEffect(() => {
    if (user?.hospital_id) {
      fetchPending();
      fetchSummary();
    }
  }, [user?.hospital_id, fetchPending, fetchSummary]);

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    setInviteLoading(true);

    try {
      const res = await fetch(`${API_URL}/admin/hospitals/${user.hospital_id}/doctors/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email: inviteEmail })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to send invitation');
      }

      setInviteSuccess('Doctor invited successfully!');
      setInviteEmail('');
      fetchPending();
    } catch (err) {
      setInviteError(err.message || 'Invitation failed');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleAction = async (doctorId, action) => {
    setError('');
    try {
      const res = await fetch(`${API_URL}/admin/hospitals/${user.hospital_id}/doctors/${doctorId}/${action}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || `Failed to ${action} doctor`);
      }

      // Remove from state list
      setPendingDoctors(prev => prev.filter(doc => doc.id !== doctorId));
    } catch (err) {
      setError(err.message || `Failed to perform action`);
    }
  };

  return (
    <div className="care-shell portal-dashboard flex flex-col justify-between">
      <div>
        <PortalHeader
          role="Hospital portal"
          userLabel={user?.full_name || 'Hospital administrator'}
          onLogout={logout}
          context={<Badge variant="neutral" icon={Shield} className="hidden sm:inline-flex">Oversight mode</Badge>}
          profile={{
            id: user?.id,
            name: user?.full_name || 'Hospital administrator',
            label: 'Hospital administrator',
            email: user?.email,
            phone: user?.phone,
            organization: user?.hospital_name || 'Assigned hospital',
            avatarUrl: user?.avatar_url
          }}
          onEditProfile={openProfileEditor}
        />

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-7 sm:py-10">
          {/* Welcome Box */}
          <div className="portal-page-header">
            <span className="care-eyebrow">Hospital operations</span>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-care-heading">Hospital operations</h1>
            <p className="care-muted max-w-2xl leading-relaxed mt-2 mb-5">
              Review clinic onboarding, doctor schedules, and physical appointment activity across the hospital.
            </p>
            <div className="flex flex-wrap gap-2">
              <div className="px-3 py-2 bg-care-surface text-xs font-semibold rounded-lg text-care-muted border border-care-border">
                Role: Hospital Admin
              </div>
              <div className="px-3 py-2 bg-care-surface text-xs font-semibold rounded-lg text-care-muted border border-care-border">
                Hospital ID: {user?.hospital_id}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="care-surface p-6 flex items-center justify-between">
              <div>
                <span className="block text-xs font-semibold text-care-muted uppercase">Booked Patients</span>
                <span className="block text-3xl font-black text-care-heading mt-1">{summary?.totalBookedPatients ?? 0}</span>
                <span className="block text-[10px] text-care-muted mt-1">{summary?.totalBookedAppointments ?? 0} booked appointments</span>
              </div>
              <div className="p-3 bg-care-primary-subtle text-care-primary border border-care-primary/20 rounded-lg">
                <Users className="w-6 h-6" />
              </div>
            </div>

            <div className="care-surface p-6 flex items-center justify-between">
              <div>
                <span className="block text-xs font-semibold text-care-muted uppercase">Upcoming Bookings</span>
                <span className="block text-3xl font-black text-care-heading mt-1">{summary?.upcomingBooked ?? 0}</span>
                <span className="block text-[10px] text-care-muted mt-1">Awaiting in-person visit</span>
              </div>
              <div className="p-3 bg-care-primary-subtle text-care-success border border-care-success/20 rounded-lg">
                <Calendar className="w-6 h-6" />
              </div>
            </div>

            <div className="care-surface p-6 flex items-center justify-between">
              <div>
                <span className="block text-xs font-semibold text-care-muted uppercase">Active Doctors</span>
                <span className="block text-3xl font-black text-care-heading mt-1">{summary?.activeDoctors ?? 0}</span>
                <span className="block text-[10px] text-care-muted mt-1">{summary?.pendingDoctors ?? 0} pending onboarding</span>
              </div>
              <div className="p-3 bg-care-primary-subtle text-care-primary border border-care-primary/20 rounded-lg">
                <ClipboardCheck className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Navigation Tab strip */}
          <div className="care-segmented mb-8">
            <button
              onClick={() => setActiveTab('onboarding')}
              className={`care-segment ${activeTab === 'onboarding' ? 'care-segment-active' : ''}`}
            >
              Onboarding Registry
            </button>
            <button
              onClick={() => setActiveTab('schedule')}
              className={`care-segment ${activeTab === 'schedule' ? 'care-segment-active' : ''}`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Schedule Oversight</span>
            </button>
            <button
              onClick={() => setActiveTab('doctors')}
              className={`care-segment ${activeTab === 'doctors' ? 'care-segment-active' : ''}`}
            >
              <UserCog className="w-3.5 h-3.5" />
              <span>Doctor Profiles</span>
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`care-segment ${activeTab === 'analytics' ? 'care-segment-active' : ''}`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Analytics Board</span>
            </button>
          </div>

          {/* Tab contents */}
          {activeTab === 'onboarding' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Invite Panel */}
              <div className="care-surface p-6 h-fit">
                <div className="flex items-center space-x-2.5 mb-4">
                  <div className="p-2 bg-care-primary-subtle text-care-primary rounded-lg border border-care-primary/20">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold">Invite Practitioner</h3>
                </div>
                <p className="text-xs text-care-muted mb-6 leading-relaxed">
                  Send an invitation to a registered practitioner to request affiliation with your hospital.
                </p>

                {inviteError && (
                  <div className="mb-4 p-3 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg flex items-start text-xs">
                    <AlertCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                    <span>{inviteError}</span>
                  </div>
                )}

                {inviteSuccess && (
                  <div className="mb-4 p-3 bg-care-primary-subtle border border-care-success/20 text-care-success rounded-lg flex items-start text-xs">
                    <Check className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                    <span>{inviteSuccess}</span>
                  </div>
                )}

                <form onSubmit={handleInvite} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Doctor Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 w-4.5 h-4.5 text-care-muted" />
                      <input
                        type="email"
                        required
                        placeholder="dr.smith@example.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="care-input pl-10 text-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={inviteLoading}
                    className="w-full py-2.5 bg-care-primary hover:bg-care-primary-hover text-care-surface font-semibold rounded-lg transition-all shadow-lg active:scale-95 disabled:opacity-50 text-xs flex items-center justify-center space-x-2"
                  >
                    {inviteLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Inviting...</span>
                      </>
                    ) : (
                      <span>Send Invitation</span>
                    )}
                  </button>
                </form>
              </div>

              {/* Pending Approvals List */}
              <div className="lg:col-span-2 care-surface p-6">
                <h3 className="text-lg font-bold mb-6">Onboarding Requests</h3>

                {error && (
                  <div className="mb-4 p-3 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg flex items-start text-xs">
                    <AlertCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {loading ? (
                  <div className="py-12 flex flex-col items-center justify-center text-care-muted">
                    <Loader2 className="w-8 h-8 animate-spin mb-3 text-care-primary" />
                    <span className="text-sm">Fetching pending practitioner profiles...</span>
                  </div>
                ) : pendingDoctors.length === 0 ? (
                  <div className="portal-empty-state">
                    No pending onboarding requests found for your hospital.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingDoctors.map(doctor => (
                      <div key={doctor.id} className="care-card care-card-hover p-5">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                          <div className="space-y-1.5">
                            <h4 className="font-bold text-care-body text-base leading-tight">{doctor.fullName}</h4>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-care-muted">
                              <span className="text-care-primary-hover font-semibold">{doctor.specialization}</span>
                              <span>Lic: {doctor.licenseNo}</span>
                              <span>{doctor.yearsExperience} Years Exp</span>
                            </div>
                            {doctor.bio && (
                              <p className="text-xs text-care-muted mt-2 italic leading-relaxed">
                                "{doctor.bio}"
                              </p>
                            )}
                            <div className="text-xs text-care-muted mt-1 font-mono">
                              Contact: {doctor.email} {doctor.phone && `| ${doctor.phone}`}
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 shrink-0 self-end md:self-start">
                            <button
                              onClick={() => handleAction(doctor.id, 'reject')}
                              className="p-2 bg-care-neutral hover:bg-care-primary-hover text-care-danger hover:text-care-surface rounded-lg border border-care-danger/20 hover:border-transparent transition-all"
                              title="Reject Request"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleAction(doctor.id, 'approve')}
                              className="p-2 bg-care-primary-subtle hover:bg-care-primary-hover text-care-success hover:text-care-surface rounded-lg border border-care-success/20 hover:border-transparent transition-all"
                              title="Approve & Activate"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'schedule' && (
            <ScheduleOverview hospitalId={user.hospital_id} token={token} />
          )}

          {activeTab === 'doctors' && (
            <DoctorManagement hospitalId={user.hospital_id} token={token} />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView hospitalId={user.hospital_id} token={token} />
          )}

        </main>
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-care-border bg-care-neutral py-4 text-center text-xs text-care-muted">
        &copy; 2026 Swasthya Sarthi Platform. Secure Administration Node.
      </footer>

      {profileOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-care-heading/45 p-4" role="dialog" aria-modal="true" aria-labelledby="admin-profile-title">
          <div className="w-full max-w-xl rounded-lg border border-care-border bg-care-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-care-border px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-care-primary-subtle text-care-primary-hover">
                  <UserCog className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="admin-profile-title" className="text-xl font-bold text-care-heading">Edit administrator profile</h2>
                  <p className="text-sm text-care-muted">Update your personal hospital account details.</p>
                </div>
              </div>
              <button type="button" onClick={() => setProfileOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-care-muted transition-colors hover:bg-care-neutral hover:text-care-heading" aria-label="Close profile editor">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleProfileSubmit} className="space-y-5 p-6">
              {profileError && <p className="rounded-lg border border-care-danger/25 bg-care-danger/10 px-4 py-3 text-sm font-medium text-care-danger">{profileError}</p>}
              {profileSuccess && <p className="rounded-lg border border-care-success/25 bg-care-primary-subtle px-4 py-3 text-sm font-medium text-care-success">{profileSuccess}</p>}

              <ProfilePhotoUploader user={user} onUpload={uploadProfilePhoto} onRemove={removeProfilePhoto} />

              <label className="block space-y-1.5 text-sm font-semibold text-care-heading">
                Full name
                <input required minLength={2} maxLength={100} value={profileForm.fullName} onChange={event => setProfileForm(current => ({ ...current, fullName: event.target.value }))} className="care-input font-normal" />
              </label>
              <label className="block space-y-1.5 text-sm font-semibold text-care-heading">
                Email address
                <span className="relative block">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-care-muted" />
                  <input disabled value={user?.email || ''} className="w-full cursor-not-allowed rounded-lg border border-care-border bg-care-neutral py-2.5 pl-10 pr-3 font-normal text-care-muted" />
                </span>
              </label>
              <label className="block space-y-1.5 text-sm font-semibold text-care-heading">
                Phone number
                <span className="relative block">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-care-muted" />
                  <input type="tel" placeholder="+91 98765 43210" value={profileForm.phone} onChange={event => setProfileForm(current => ({ ...current, phone: event.target.value }))} className="care-input pl-10 font-normal" />
                </span>
              </label>

              <div className="rounded-lg border border-care-border bg-care-neutral px-4 py-3">
                <span className="block text-xs font-semibold uppercase text-care-muted">Assigned hospital</span>
                <span className="mt-1 block font-semibold text-care-heading">{user?.hospital_name || 'Hospital assignment unavailable'}</span>
                {user?.hospital_address && <span className="mt-1 block truncate text-xs text-care-muted">{user.hospital_address}</span>}
              </div>

              <div className="flex justify-end gap-3 border-t border-care-border pt-5">
                <button type="button" onClick={() => setProfileOpen(false)} className="min-h-10 rounded-lg border border-care-border bg-care-surface px-4 text-sm font-semibold text-care-heading transition-colors hover:bg-care-neutral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-care-primary">Cancel</button>
                <button type="submit" disabled={profileSaving} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-care-primary px-4 text-sm font-semibold text-care-surface transition-colors hover:bg-care-primary-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-care-primary focus-visible:ring-offset-2">
                  {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {profileSaving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
