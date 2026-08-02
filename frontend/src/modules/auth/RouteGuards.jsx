import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function ProtectedRoute({ allowedRoles }) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="portal-theme min-h-screen bg-care-neutral text-care-surface flex flex-col items-center justify-center font-sans">
        <div className="w-10 h-10 border-2 border-care-primary border-t-transparent rounded-full animate-spin mb-4" />
        <span className="text-care-muted text-sm">Verifying access credentials...</span>
      </div>
    );
  }

  // Determine fallback login route depending on the requested section
  let loginFallback = '/';
  if (allowedRoles.includes('patient')) loginFallback = '/login/patient';
  else if (allowedRoles.includes('doctor')) loginFallback = '/login/doctor';
  else if (allowedRoles.includes('hospital_admin')) loginFallback = '/login/admin';

  if (!isAuthenticated) {
    return <Navigate to={loginFallback} replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    // If authenticated but role mismatch, redirect to main landing page
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

export function DoctorGuard() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="portal-theme min-h-screen bg-care-neutral text-care-surface flex flex-col items-center justify-center font-sans">
        <div className="w-10 h-10 border-2 border-care-success border-t-transparent rounded-full animate-spin mb-4" />
        <span className="text-care-muted text-sm">Verifying practitioner profile...</span>
      </div>
    );
  }

  if (!user || user.role !== 'doctor') {
    return <Navigate to="/login/doctor" replace />;
  }

  if (user.status === 'pending') {
    return <Navigate to="/doctor/pending" replace />;
  }

  return <Outlet />;
}
