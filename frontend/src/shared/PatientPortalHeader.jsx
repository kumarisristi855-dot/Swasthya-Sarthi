import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  CalendarDays,
  ChevronDown,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../modules/auth/AuthContext';
import Avatar from './ui/Avatar';
import Button from './ui/Button';
import LanguageSwitcher from '../i18n/LanguageSwitcher';
import { useTranslation } from 'react-i18next';

const emptyForm = {
  fullName: '',
  phone: '',
  dateOfBirth: '',
  gender: '',
  allergies: '',
  chronicConditions: '',
};

function valueList(value) {
  return Array.isArray(value)
    ? value.filter(item => item != null && String(item).toLowerCase() !== 'null').join(', ')
    : '';
}

export default function PatientPortalHeader() {
  const { t } = useTranslation(['common', 'nav']);
  const { pathname } = useLocation();
  const { user, logout, updatePatientProfile } = useAuth();
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const handlePointerDown = event => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setEditOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const navLinkClass = path => [
    'inline-flex h-10 items-center whitespace-nowrap text-sm font-semibold transition-colors',
    pathname === path
      ? 'text-care-primary-hover'
      : 'text-care-body hover:text-care-primary-hover',
  ].join(' ');

  const openEditor = () => {
    setForm({
      fullName: user?.full_name || '',
      phone: user?.phone || '',
      dateOfBirth: String(user?.date_of_birth || '').slice(0, 10),
      gender: user?.gender || '',
      allergies: valueList(user?.allergies),
      chronicConditions: valueList(user?.chronic_conditions),
    });
    setError('');
    setSuccess('');
    setMenuOpen(false);
    setEditOpen(true);
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updatePatientProfile(form);
      setSuccess('Your profile has been updated.');
    } catch (saveError) {
      setError(saveError.message || 'Could not update your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="patient-portal-header">
        <div className="patient-portal-navbar">
          <Link to="/patient/dashboard" className="flex min-w-0 shrink-0 items-center gap-3" aria-label={`${t('nav:brand')} ${t('nav:patientPortal')}`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-care-primary text-care-surface">
              <span className="relative h-6 w-6" aria-hidden="true">
                <Activity className="care-logo-pulse-base absolute inset-0 h-6 w-6" strokeWidth={2.5} />
                <Activity className="care-logo-pulse-scan absolute inset-0 h-6 w-6" strokeWidth={2.5} />
              </span>
            </span>
            <span className="leading-none">
              <span className="block text-lg font-bold leading-5 text-care-heading">{t('nav:brand')}</span>
              <span className="mt-1 block text-[10px] font-semibold uppercase leading-3 text-care-primary-hover">{t('nav:patientPortal')}</span>
            </span>
          </Link>

          <nav className="ml-auto flex min-w-0 items-center gap-3 sm:gap-6 lg:gap-8" aria-label="Patient navigation">
            <Link to="/patient/appointments" className={navLinkClass('/patient/appointments')}>
              {t('nav:myAppointments')}
            </Link>
            <Link to="/patient/delhi-doctors" className={`${navLinkClass('/patient/delhi-doctors')} hidden md:inline-flex`}>
              {t('nav:doctorDirectory')}
            </Link>
            <LanguageSwitcher compact />

            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen(open => !open)}
                className="group flex h-14 items-center gap-2.5 rounded-lg border border-care-border bg-care-surface px-2.5 text-left shadow-sm transition-all hover:border-care-primary/40 hover:bg-care-primary-subtle/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-care-primary focus-visible:ring-offset-2"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span className="relative shrink-0">
                  <Avatar name={user?.full_name || 'Patient'} id={user?.id} size="sm" variant="brand" />
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-care-surface bg-care-success" aria-hidden="true" />
                </span>
                <span className="hidden min-w-0 lg:block">
                  <span className="block max-w-40 truncate text-sm font-semibold text-care-heading">{user?.full_name || 'Patient'}</span>
                  <span className="mt-0.5 block text-[11px] font-medium text-care-primary-hover">Patient profile</span>
                </span>
                <span className="hidden h-7 w-7 items-center justify-center rounded-md bg-care-neutral text-care-muted transition-colors group-hover:bg-care-surface group-hover:text-care-primary-hover sm:flex">
                  <ChevronDown className={`h-4 w-4 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>

              {menuOpen && (
                <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-care-border bg-care-surface p-3 shadow-xl">
                  <div className="flex items-center gap-3 border-b border-care-border p-2 pb-4">
                    <Avatar name={user?.full_name || 'Patient'} id={user?.id} />
                    <div className="min-w-0">
                      <p className="truncate font-bold text-care-heading">{user?.full_name || 'Patient'}</p>
                      <p className="truncate text-xs text-care-muted">{user?.email || 'Email not available'}</p>
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-care-success">
                        <ShieldCheck className="h-3.5 w-3.5" /> {t('common:signedInSecurely')}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 px-2 py-3 text-sm">
                    <div className="flex items-center gap-2 text-care-body">
                      <Phone className="h-4 w-4 shrink-0 text-care-muted" />
                      <span className="truncate">{user?.phone || 'Phone number not added'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-care-body">
                      <CalendarDays className="h-4 w-4 shrink-0 text-care-muted" />
                      <span>{user?.date_of_birth || 'Date of birth not added'}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={openEditor}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-care-heading transition-colors hover:bg-care-primary-subtle hover:text-care-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-care-primary"
                  >
                    <Pencil className="h-4 w-4" /> {t('common:editProfile')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={logout}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-care-danger transition-colors hover:bg-care-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-care-danger"
                  >
                    <LogOut className="h-4 w-4" /> {t('common:signOut')}
                  </button>
                </div>
              )}
            </div>
          </nav>
        </div>
      </header>

      {editOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-care-heading/45 p-4" role="dialog" aria-modal="true" aria-labelledby="patient-profile-title">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-care-border bg-care-surface shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-care-border bg-care-surface px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-care-primary-subtle text-care-primary-hover">
                  <UserRound className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="patient-profile-title" className="text-xl font-bold text-care-heading">Edit your profile</h2>
                  <p className="text-sm text-care-muted">Keep your personal and care information current.</p>
                </div>
              </div>
              <button type="button" onClick={() => setEditOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-care-muted hover:bg-care-neutral hover:text-care-heading" aria-label="Close profile editor">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              {error && <p className="rounded-lg border border-care-danger/25 bg-care-danger/10 px-4 py-3 text-sm font-medium text-care-danger">{error}</p>}
              {success && <p className="rounded-lg border border-care-success/25 bg-care-primary-subtle px-4 py-3 text-sm font-medium text-care-success">{success}</p>}

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-semibold text-care-heading">
                  Full name
                  <input required minLength={2} maxLength={100} value={form.fullName} onChange={event => setForm(current => ({ ...current, fullName: event.target.value }))} className="w-full rounded-lg border border-care-border bg-care-surface px-3 py-2.5 font-normal text-care-body outline-none focus:border-care-primary focus:ring-2 focus:ring-care-primary/20" />
                </label>
                <label className="space-y-1.5 text-sm font-semibold text-care-heading">
                  Email address
                  <span className="relative block">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-care-muted" />
                    <input disabled value={user?.email || ''} className="w-full cursor-not-allowed rounded-lg border border-care-border bg-care-neutral py-2.5 pl-10 pr-3 font-normal text-care-muted" />
                  </span>
                </label>
                <label className="space-y-1.5 text-sm font-semibold text-care-heading">
                  Phone number
                  <input type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} className="w-full rounded-lg border border-care-border bg-care-surface px-3 py-2.5 font-normal text-care-body outline-none focus:border-care-primary focus:ring-2 focus:ring-care-primary/20" />
                </label>
                <label className="space-y-1.5 text-sm font-semibold text-care-heading">
                  Date of birth
                  <input type="date" max={new Date().toISOString().slice(0, 10)} value={form.dateOfBirth} onChange={event => setForm(current => ({ ...current, dateOfBirth: event.target.value }))} className="w-full rounded-lg border border-care-border bg-care-surface px-3 py-2.5 font-normal text-care-body outline-none focus:border-care-primary focus:ring-2 focus:ring-care-primary/20" />
                </label>
              </div>

              <label className="block space-y-1.5 text-sm font-semibold text-care-heading">
                Gender
                <select value={form.gender} onChange={event => setForm(current => ({ ...current, gender: event.target.value }))} className="w-full rounded-lg border border-care-border bg-care-surface px-3 py-2.5 font-normal text-care-body outline-none focus:border-care-primary focus:ring-2 focus:ring-care-primary/20">
                  <option value="">Prefer not to say</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </label>

              <label className="block space-y-1.5 text-sm font-semibold text-care-heading">
                Allergies
                <input placeholder="Peanuts, Penicillin" value={form.allergies} onChange={event => setForm(current => ({ ...current, allergies: event.target.value }))} className="w-full rounded-lg border border-care-border bg-care-surface px-3 py-2.5 font-normal text-care-body outline-none focus:border-care-primary focus:ring-2 focus:ring-care-primary/20" />
                <span className="block text-xs font-normal text-care-muted">Separate multiple allergies with commas.</span>
              </label>

              <label className="block space-y-1.5 text-sm font-semibold text-care-heading">
                Chronic conditions
                <input placeholder="Asthma, Hypertension" value={form.chronicConditions} onChange={event => setForm(current => ({ ...current, chronicConditions: event.target.value }))} className="w-full rounded-lg border border-care-border bg-care-surface px-3 py-2.5 font-normal text-care-body outline-none focus:border-care-primary focus:ring-2 focus:ring-care-primary/20" />
                <span className="block text-xs font-normal text-care-muted">This information helps keep appointment records accurate.</span>
              </label>

              <div className="flex justify-end gap-3 border-t border-care-border pt-5">
                <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Saving...' : 'Save changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
