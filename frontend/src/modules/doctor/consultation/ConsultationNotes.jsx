import React, { useState } from 'react';
import { Loader2, ClipboardList, PenTool, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { API_URL } from '../../../lib/api';

export default function ConsultationNotes({ appointment, onClose, onComplete }) {
  const { token } = useAuth();
  
  const [notes, setNotes] = useState('');
  const [prescription, setPrescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!notes.trim()) {
      setError('Clinical notes cannot be empty');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/appointments/${appointment.id}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          notes,
          prescription
        })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to record visit notes');
      }

      setSuccess(true);
      setTimeout(() => {
        onComplete();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || 'An error occurred while completing the visit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="care-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-visit-title"
        className="w-full max-w-lg care-surface-raised p-6 md:p-8 shadow-2xl relative overflow-hidden"
      >
        
        <button
          type="button"
          onClick={onClose}
          disabled={loading || success}
          aria-label="Close visit form"
          className="absolute top-4 right-4 text-care-muted hover:text-care-heading transition-colors disabled:opacity-30"
        >
          <X className="w-5 h-5" />
        </button>

        {!success ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h3 id="record-visit-title" className="text-xl font-bold text-care-heading flex items-center">
                <ClipboardList className="w-5 h-5 text-care-success mr-2" /> Record In-Person Visit
              </h3>
              <p className="text-xs text-care-muted mt-1 leading-relaxed">
                Record clinical details after seeing the patient at the facility:
              </p>
              <div className="mt-3 p-3 bg-care-neutral border border-care-border rounded-lg flex flex-col gap-1 text-xs">
                <div><strong>Patient:</strong> {appointment.patient?.fullName || 'Anonymous Patient'}</div>
                {appointment.symptomQuery && (
                  <div className="text-care-muted mt-1 pl-2 border-l-2 border-care-success/40 italic">
                    "{appointment.symptomQuery}"
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-care-muted uppercase">Clinical Notes</label>
                <textarea
                  required
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Record symptoms, diagnosis, assessment and physical visit findings..."
                  className="w-full bg-care-neutral border border-care-border focus:border-care-primary rounded-lg p-3 text-care-body placeholder:text-care-muted focus:outline-none text-xs resize-none transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-care-muted uppercase">Prescriptions / Treatment Plan</label>
                <textarea
                  rows={3}
                  value={prescription}
                  onChange={(e) => setPrescription(e.target.value)}
                  placeholder="Medication names, dosage, duration, and instructions..."
                  className="w-full bg-care-neutral border border-care-border focus:border-care-primary rounded-lg p-3 text-care-body placeholder:text-care-muted focus:outline-none text-xs resize-none transition-colors font-mono"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg text-xs flex items-start">
                <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                disabled={loading}
                onClick={onClose}
                className="care-button-secondary flex-1 text-xs"
              >
                Discard
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 bg-care-primary hover:bg-care-primary-hover text-care-surface rounded-lg text-xs font-semibold shadow-lg shadow-care-primary/25 transition-all flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving Visit...</span>
                  </>
                ) : (
                  <>
                    <PenTool className="w-4 h-4" />
                    <span>Complete Visit</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="text-center space-y-6 py-6">
            <div className="w-12 h-12 bg-care-primary-subtle border border-care-success/20 text-care-success rounded-full flex items-center justify-center mx-auto shadow-lg shadow-care-primary/10 animate-bounce">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-xl font-bold text-care-heading">Visit Saved!</h3>
              <p className="text-xs text-care-muted leading-relaxed px-4">
                In-person visit details have been logged and the appointment is marked completed.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
