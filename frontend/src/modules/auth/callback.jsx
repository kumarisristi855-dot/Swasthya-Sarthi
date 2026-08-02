import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { API_URL } from '../../lib/api';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('Verifying authentication...');

  useEffect(() => {
    async function handleCallback() {
      try {
        const role = searchParams.get('role');
        
        // Parse error details from redirect if they exist
        const hash = window.location.hash;
        const hashParams = new URLSearchParams(hash.substring(1));
        const errorMsg = hashParams.get('error_description') || searchParams.get('error_description');
        if (errorMsg) {
          throw new Error(errorMsg);
        }

        if (!role || !['patient', 'doctor', 'hospital_admin'].includes(role)) {
          throw new Error('Invalid or missing role parameter.');
        }

        setStatus('Retrieving session details...');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) throw sessionError;
        if (!session) {
          throw new Error('Authentication session not found. Please log in again.');
        }

        setStatus('Finalizing account registration...');
        const response = await fetch(`${API_URL}/auth/complete-signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ role })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error?.message || 'Failed to complete signup registration');
        }

        // Store access token locally for standard session authentication checks
        localStorage.setItem('token', session.access_token);

        setStatus('Redirecting to dashboard...');
        
        // Force complete page reload so AuthProvider re-evaluates the authentication state
        if (role === 'patient') {
          window.location.href = '/patient/dashboard';
        } else if (role === 'doctor') {
          window.location.href = '/doctor/dashboard';
        } else if (role === 'hospital_admin') {
          window.location.href = '/admin/dashboard';
        }
      } catch (err) {
        console.error('OAuth Callback handling error:', err);
        setError(err.message || 'An unexpected error occurred during Google Sign-In.');
      }
    }

    handleCallback();
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div className="portal-theme min-h-screen bg-care-neutral text-care-surface flex items-center justify-center px-6 font-sans">
        <div className="max-w-md w-full care-surface-raised p-8 text-center shadow-xl">
          <div className="w-16 h-16 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-care-body mb-2">Authentication Failed</h2>
          <p className="text-care-muted text-sm mb-8">{error}</p>
          <a
            href="/"
            className="inline-flex items-center justify-center w-full px-5 py-3 bg-care-primary hover:bg-care-primary-hover text-care-surface font-medium rounded-lg shadow-lg shadow-care-primary/20 transition-all duration-200"
          >
            Return to Homepage
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-theme min-h-screen bg-care-neutral text-care-surface flex flex-col items-center justify-center font-sans">
      <div className="w-12 h-12 border-4 border-care-primary border-t-transparent rounded-full animate-spin mb-6" />
      <h2 className="text-lg font-semibold text-care-body mb-1">Authenticating with Google</h2>
      <p className="text-care-muted text-sm">{status}</p>
    </div>
  );
}
