import React from 'react';
import { useAuth } from './AuthContext';
import { LogOut, Clock } from 'lucide-react';

export default function DoctorPending() {
  const { logout, user } = useAuth();

  return (
    <div className="portal-theme min-h-screen bg-care-neutral text-care-body flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">

      <div className="max-w-md w-full bg-care-neutral/60 backdrop-blur-md rounded-lg border border-care-border p-8 text-center shadow-2xl z-10">
        <div className="mx-auto p-4 bg-care-neutral text-care-warning rounded-full border border-care-warning/20 w-fit mb-6 animate-pulse">
          <Clock className="w-10 h-10" />
        </div>

        <h2 className="text-2xl font-bold text-care-body mb-2">Awaiting Hospital Approval</h2>
        <p className="text-care-muted text-sm leading-relaxed mb-6">
          Hello, <span className="text-care-muted font-semibold">{user?.full_name || 'Dr. Practitioner'}</span>. Your medical profile has been successfully registered and is currently pending verification.
        </p>

        <div className="bg-care-surface border border-care-border rounded-lg p-4 mb-8 text-left text-xs text-care-muted space-y-2">
          <div className="flex justify-between">
            <span>Status:</span>
            <span className="text-care-warning font-semibold uppercase">Pending</span>
          </div>
          <div className="flex justify-between">
            <span>Registration ID:</span>
            <span className="font-mono text-care-muted">{user?.id || 'N/A'}</span>
          </div>
          <p className="text-[10px] mt-2 border-t border-care-border pt-2 text-care-muted">
            A hospital administrator will review your medical credentials and license shortly. You will be able to access the dashboard once approved.
          </p>
        </div>

        <button
          onClick={logout}
          className="w-full py-2.5 bg-care-neutral hover:bg-care-neutral text-care-muted text-sm font-semibold rounded-lg transition-all border border-care-border inline-flex items-center justify-center space-x-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
