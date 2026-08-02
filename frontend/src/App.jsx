import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './modules/auth/AuthContext';
import { ProtectedRoute, DoctorGuard } from './modules/auth/RouteGuards';
import LandingPage from './modules/LandingPage';
import I18nDocumentEffects from './i18n/I18nDocumentEffects';

const PatientLogin = lazy(() => import('./modules/auth/PatientLoginPlaceholder'));
const DoctorLogin = lazy(() => import('./modules/auth/DoctorLoginPlaceholder'));
const AdminLogin = lazy(() => import('./modules/auth/AdminLoginPlaceholder'));
const PatientSignup = lazy(() => import('./modules/auth/PatientSignup'));
const DoctorSignup = lazy(() => import('./modules/auth/DoctorSignup'));
const DoctorPending = lazy(() => import('./modules/auth/DoctorPending'));
const PatientDashboard = lazy(() => import('./modules/patient/PatientDashboard'));
const HospitalProfile = lazy(() => import('./modules/patient/discovery/HospitalProfile'));
const DoctorProfile = lazy(() => import('./modules/patient/booking/DoctorProfile'));
const AppointmentHistory = lazy(() => import('./modules/patient/history/AppointmentHistory'));
const DelhiDoctorDirectory = lazy(() => import('./modules/patient/delhi/DelhiDoctorDirectory'));
const DoctorDashboard = lazy(() => import('./modules/doctor/DoctorDashboard'));
const AdminDashboard = lazy(() => import('./modules/admin/AdminDashboard'));
const AuthCallback = lazy(() => import('./modules/auth/callback'));
const LegalPage = lazy(() => import('./modules/LegalPage'));
const PublicHospitalProfile = lazy(() => import('./modules/public/PublicHospitalProfile'));
const PublicDoctorProfile = lazy(() => import('./modules/public/PublicDoctorProfile'));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-care-neutral px-5" role="status" aria-live="polite">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-care-border bg-care-surface p-6">
        <span className="block h-5 w-1/2 animate-pulse rounded bg-care-border" aria-hidden="true" />
        <span className="block h-3 w-full animate-pulse rounded bg-care-border" aria-hidden="true" />
        <span className="block h-11 w-full animate-pulse rounded bg-care-border" aria-hidden="true" />
        <span className="sr-only">Loading page</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <I18nDocumentEffects />
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/privacy" element={<Navigate to="/legal/privacy" replace />} />
          <Route path="/terms" element={<Navigate to="/legal/terms" replace />} />
          <Route path="/security" element={<Navigate to="/legal/security" replace />} />
          <Route path="/legal/:document" element={<LegalPage />} />
          <Route path="/login/patient" element={<PatientLogin />} />
          <Route path="/login/doctor" element={<DoctorLogin />} />
          <Route path="/login/admin" element={<AdminLogin />} />
          <Route path="/signup/patient" element={<PatientSignup />} />
          <Route path="/signup/doctor" element={<DoctorSignup />} />
          <Route path="/doctor/pending" element={<DoctorPending />} />
          <Route path="/hospital/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/hospital/:id" element={<PublicHospitalProfile />} />
          <Route path="/doctor/:doctorId" element={<PublicDoctorProfile />} />

          {/* Patient Protected Routes */}
          <Route element={<ProtectedRoute allowedRoles={['patient']} />}>
            <Route path="/patient/dashboard" element={<PatientDashboard />} />
            <Route path="/patient/hospital/:id" element={<HospitalProfile />} />
            <Route path="/patient/doctor/:doctorId" element={<DoctorProfile />} />
            <Route path="/patient/appointments" element={<AppointmentHistory />} />
            <Route path="/patient/delhi-doctors" element={<DelhiDoctorDirectory />} />
          </Route>

          {/* Doctor Protected Routes (checks role AND checks active status) */}
          <Route element={<ProtectedRoute allowedRoles={['doctor']} />}>
            <Route element={<DoctorGuard />}>
              <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
            </Route>
          </Route>

          {/* Admin Protected Routes */}
          <Route element={<ProtectedRoute allowedRoles={['hospital_admin']} />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
          </Route>

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
