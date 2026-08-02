import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { useAuth } from './AuthContext';
import AuthShell from './AuthShell';

export default function PatientLogin() {
  const { login } = useAuth();
  const { t } = useTranslation(['auth']);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, 'patient');
      navigate('/patient/dashboard');
    } catch (err) {
      setError(err.message || t('loginFailed'));
      setLoading(false);
    }
  };

  return (
    <AuthShell icon={User} title={t('patientSignIn')} subtitle={t('appointmentsNearbyCare')} accent="blue">
      {error && (
        <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-care-danger/25 bg-care-danger/10 p-3 text-sm text-care-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="patient-email" className="care-label">{t('emailAddress')}</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-care-muted" />
            <input id="patient-email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} className="care-input pl-10" />
          </div>
        </div>
        <div>
          <label htmlFor="patient-password" className="care-label">{t('password')}</label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-care-muted" />
            <input id="patient-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required placeholder={t('passwordPlaceholder')} value={password} onChange={(event) => setPassword(event.target.value)} className="care-input pl-10 pr-11" />
            <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-care-muted hover:bg-care-neutral hover:text-care-surface" aria-label={showPassword ? t('hidePassword') : t('showPassword')}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className="care-button-primary w-full">
          {loading ? t('signingIn') : t('signIn')}
        </button>
      </form>

      <p className="mt-6 text-center text-sm care-muted">
        {t('newToPlatform')} <Link to="/signup/patient" className="font-semibold text-care-primary hover:text-care-primary-subtle">{t('createAccount')}</Link>
      </p>
    </AuthShell>
  );
}
