import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './modules/auth/AuthContext';
import { ProtectedRoute, DoctorGuard } from './modules/auth/RouteGuards';
import LandingPage from './modules/LandingPage';
import PatientLogin from './modules/auth/PatientLoginPlaceholder';
import DoctorLogin from './modules/auth/DoctorLoginPlaceholder';
import AdminLogin from './modules/auth/AdminLoginPlaceholder';
import PatientSignup from './modules/auth/PatientSignup';
import DoctorSignup from './modules/auth/DoctorSignup';
import DoctorPending from './modules/auth/DoctorPending';
import PatientDashboard from './modules/patient/PatientDashboard';
import HospitalProfile from './modules/patient/discovery/HospitalProfile';
import DoctorProfile from './modules/patient/booking/DoctorProfile';
import AppointmentHistory from './modules/patient/history/AppointmentHistory';
import DelhiDoctorDirectory from './modules/patient/delhi/DelhiDoctorDirectory';
import DoctorDashboard from './modules/doctor/DoctorDashboard';
import AdminDashboard from './modules/admin/AdminDashboard';
import AuthCallback from './modules/auth/callback';
import LegalPage from './modules/LegalPage';
import PublicHospitalProfile from './modules/public/PublicHospitalProfile';
import PublicDoctorProfile from './modules/public/PublicDoctorProfile';
import I18nDocumentEffects from './i18n/I18nDocumentEffects';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <I18nDocumentEffects />
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/legal/:document" element={<LegalPage />} />
          <Route path="/login/patient" element={<PatientLogin />} />
          <Route path="/login/doctor" element={<DoctorLogin />} />
          <Route path="/login/admin" element={<AdminLogin />} />
          <Route path="/signup/patient" element={<PatientSignup />} />
          <Route path="/signup/doctor" element={<DoctorSignup />} />
          <Route path="/doctor/pending" element={<DoctorPending />} />
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
      </BrowserRouter>
    </AuthProvider>
  );
}
