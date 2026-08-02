import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ArrowLeft, User, Mail, Lock, Phone, Calendar, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { buttonStyles } from '../../shared/ui';

export default function PatientSignup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    dateOfBirth: '',
    gender: 'Male',
    allergies: '',
    chronicConditions: ''
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (formData.fullName.trim().length < 2) {
      setError('Full name must be at least 2 characters long');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Please provide a valid email address');
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    if (formData.phone && !/^\+?[1-9]\d{1,14}$/.test(formData.phone.replace(/[\s-()]/g, ''))) {
      setError('Please enter a valid phone number (digits only, optionally starting with +)');
      return;
    }

    setLoading(true);

    try {
      // Format allergies and chronic conditions as arrays
      const formattedData = {
        ...formData,
        allergies: formData.allergies ? formData.allergies.split(',').map(s => s.trim()) : [],
        chronicConditions: formData.chronicConditions ? formData.chronicConditions.split(',').map(s => s.trim()) : []
      };

      await signup(formattedData, 'patient');
      setSuccess('Registration successful! Redirecting to login page...');
      setTimeout(() => {
        navigate('/login/patient');
      }, 2000);
    } catch (err) {
      setError(err.message || 'Registration failed');
      setLoading(false);
    }
  };

  return (
    <div className="care-shell flex flex-col items-center justify-center p-5 sm:p-8">

      <div className="care-surface-raised max-w-md w-full p-6 sm:p-8">
        <Link to="/" className="inline-flex items-center text-sm text-care-muted hover:text-care-surface transition-colors mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to home
        </Link>

        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-care-primary-subtle text-care-success rounded-lg border border-care-success/20">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-care-body">Patient Registration</h2>
            <p className="text-care-muted text-sm">Create your personal care account</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg flex items-start text-sm">
            <AlertCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-care-primary-subtle border border-care-success/20 text-care-success rounded-lg flex items-start text-sm">
            <AlertCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Full Name *</label>
            <div className="relative">
              <User className="absolute left-3 top-3 w-4 h-4 text-care-muted" />
              <input
                type="text"
                name="fullName"
                required
                placeholder="John Doe"
                value={formData.fullName}
                onChange={handleChange}
                className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 pl-10 pr-4 text-care-body placeholder:text-care-muted focus:outline-none focus:border-care-primary text-sm transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Email Address *</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-4 h-4 text-care-muted" />
              <input
                type="email"
                name="email"
                required
                placeholder="john@example.com"
                value={formData.email}
                onChange={handleChange}
                className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 pl-10 pr-4 text-care-body placeholder:text-care-muted focus:outline-none focus:border-care-primary text-sm transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Password *</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-care-muted" />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                required
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 pl-10 pr-11 text-care-body placeholder:text-care-muted focus:outline-none focus:border-care-primary text-sm transition-colors"
              />
              <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-2 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-care-muted hover:bg-care-neutral hover:text-care-heading" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 w-4 h-4 text-care-muted" />
                <input
                  type="text"
                  name="phone"
                  placeholder="+1234567890"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 pl-10 pr-4 text-care-body placeholder:text-care-muted focus:outline-none focus:border-care-primary text-sm transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Date of Birth</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 w-4 h-4 text-care-muted" />
                <input
                  type="date"
                  name="dateOfBirth"
                  value={formData.dateOfBirth}
                  onChange={handleChange}
                  className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 pl-10 pr-4 text-care-body placeholder:text-care-muted focus:outline-none focus:border-care-primary text-sm transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Gender</label>
              <select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-4 text-care-body focus:outline-none focus:border-care-primary text-sm transition-colors"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Allergies (comma separated)</label>
            <input
              type="text"
              name="allergies"
              placeholder="e.g. Peanuts, Penicillin"
              value={formData.allergies}
              onChange={handleChange}
              className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-4 text-care-body placeholder:text-care-muted focus:outline-none focus:border-care-primary text-sm transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Chronic Conditions (comma separated)</label>
            <input
              type="text"
              name="chronicConditions"
              placeholder="e.g. Asthma, Hypertension"
              value={formData.chronicConditions}
              onChange={handleChange}
              className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-4 text-care-body placeholder:text-care-muted focus:outline-none focus:border-care-primary text-sm transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={buttonStyles({ size: 'lg', block: true, className: 'mt-2' })}
          >
            {loading ? 'Registering...' : 'Register'}
          </button>
        </form>

        <p className="text-center text-sm text-care-muted mt-6">
          Already have an account?{' '}
          <Link to="/login/patient" className="font-semibold text-care-primary-hover hover:underline">
            Login here
          </Link>
        </p>
      </div>
    </div>
  );
}
