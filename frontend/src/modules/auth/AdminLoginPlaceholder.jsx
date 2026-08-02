import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Building2, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from './AuthContext';
import AuthShell from './AuthShell';

export default function AdminLogin() {
  const { login } = useAuth();
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
      await login(email, password, 'hospital_admin');
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <AuthShell icon={Building2} title="Hospital sign in" subtitle="Operations and care-team management" accent="amber">
      {error && (
        <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-care-danger/25 bg-care-danger/10 p-3 text-sm text-care-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="admin-email" className="care-label">Email address</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-care-muted" />
            <input id="admin-email" type="email" autoComplete="email" required placeholder="admin@hospital.com" value={email} onChange={(event) => setEmail(event.target.value)} className="care-input pl-10" />
          </div>
        </div>
        <div>
          <label htmlFor="admin-password" className="care-label">Password</label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-care-muted" />
            <input id="admin-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} className="care-input pl-10 pr-11" />
            <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-care-muted hover:bg-care-neutral hover:text-care-surface" aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className="care-button-primary w-full">
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 text-center text-xs leading-5 care-muted">Hospital access is provisioned by your CareSync administrator.</p>
    </AuthShell>
  );
}
