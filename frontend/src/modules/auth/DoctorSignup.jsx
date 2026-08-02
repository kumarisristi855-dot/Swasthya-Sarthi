import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Stethoscope, Mail, Lock, Phone, Award, Clock, FileText, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { productionSafe } from '../../lib/developmentFixtures';

export default function DoctorSignup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    specializationId: '',
    licenseNo: '',
    yearsExperience: '',
    consultationFee: '',
    bio: '',
    hospitalId: ''
  });

  const [specializations, setSpecializations] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Fetch specializations and hospitals from Supabase on mount
  useEffect(() => {
    async function loadLookupData() {
      try {
        const { data: specs, error: specError } = await supabase
          .from('specializations')
          .select('id, name')
          .order('name', { ascending: true });

        if (specError) throw specError;

        if (specs && specs.length > 0) {
          setSpecializations(specs);
          setFormData(prev => ({ ...prev, specializationId: specs[0].id.toString() }));
        }

        const { data: hosps, error: hospError } = await supabase
          .from('hospitals')
          .select('id, name')
          .order('name', { ascending: true });

        if (hospError) throw hospError;

        if (hosps) {
          setHospitals(productionSafe(hosps));
        }
      } catch (err) {
        console.error('Failed to load form dropdown data:', err);
        setError('Failed to load form options. Please reload page.');
      }
    }
    loadLookupData();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Basic Input Validation
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
    if (!formData.specializationId) {
      setError('Please select a valid specialization');
      return;
    }
    if (!formData.licenseNo.trim()) {
      setError('License number is required');
      return;
    }
    const exp = parseInt(formData.yearsExperience, 10);
    if (isNaN(exp) || exp < 0) {
      setError('Years of experience must be a non-negative number');
      return;
    }
    const fee = parseFloat(formData.consultationFee);
    if (isNaN(fee) || fee < 0) {
      setError('In-person visit fee must be a non-negative number');
      return;
    }

    setLoading(true);

    try {
      await signup(formData, 'doctor');
      setSuccess('Registration successful! Awaiting admin approval. Redirecting to login...');
      setTimeout(() => {
        navigate('/login/doctor');
      }, 2500);
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
            <Stethoscope className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-care-body">Doctor Registration</h2>
            <p className="text-care-muted text-sm">Join CareSync medical practitioner team</p>
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
              <Award className="absolute left-3 top-3 w-4 h-4 text-care-muted" />
              <input
                type="text"
                name="fullName"
                required
                placeholder="Dr. Jane Smith"
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
                placeholder="jane.smith@hospital.com"
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
            <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Specialization *</label>
            <select
              name="specializationId"
              required
              value={formData.specializationId}
              onChange={handleChange}
              className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-4 text-care-body focus:outline-none focus:border-care-primary text-sm transition-colors"
            >
              {specializations.map(spec => (
                <option key={spec.id} value={spec.id}>{spec.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Primary Hospital (Optional)</label>
            <select
              name="hospitalId"
              value={formData.hospitalId}
              onChange={handleChange}
              className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-4 text-care-body focus:outline-none focus:border-care-primary text-sm transition-colors"
            >
              <option value="">-- Select Hospital --</option>
              {hospitals.map(hosp => (
                <option key={hosp.id} value={hosp.id}>{hosp.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-care-muted uppercase mb-1">License Number *</label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 w-4 h-4 text-care-muted" />
                <input
                  type="text"
                  name="licenseNo"
                  required
                  placeholder="LIC987654"
                  value={formData.licenseNo}
                  onChange={handleChange}
                  className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 pl-10 pr-4 text-care-body placeholder:text-care-muted focus:outline-none focus:border-care-primary text-sm transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Experience (Years)</label>
              <div className="relative">
                <Clock className="absolute left-3 top-3 w-4 h-4 text-care-muted" />
                <input
                  type="number"
                  name="yearsExperience"
                  placeholder="5"
                  value={formData.yearsExperience}
                  onChange={handleChange}
                  className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 pl-10 pr-4 text-care-body placeholder:text-care-muted focus:outline-none focus:border-care-primary text-sm transition-colors"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-care-muted uppercase mb-1">In-Person Visit Fee (INR)</label>
            <input
              type="number"
              step="0.01"
              name="consultationFee"
              placeholder="75.00"
              value={formData.consultationFee}
              onChange={handleChange}
              className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-4 text-care-body placeholder:text-care-muted focus:outline-none focus:border-care-primary text-sm transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-care-muted uppercase mb-1">Professional Bio</label>
            <textarea
              name="bio"
              rows="3"
              placeholder="Write a brief professional description..."
              value={formData.bio}
              onChange={handleChange}
              className="w-full bg-care-surface border border-care-border rounded-lg py-2.5 px-4 text-care-body placeholder:text-care-muted focus:outline-none focus:border-care-primary text-sm transition-colors resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-care-primary hover:bg-care-primary-hover text-care-surface font-medium rounded-lg transition-all shadow-lg shadow-care-primary/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-2 text-sm"
          >
            {loading ? 'Submitting Registration...' : 'Register'}
          </button>
        </form>

        <p className="text-center text-sm text-care-muted mt-6">
          Already have an account?{' '}
          <Link to="/login/doctor" className="text-care-success hover:underline">
            Login here
          </Link>
        </p>
      </div>
    </div>
  );
}
