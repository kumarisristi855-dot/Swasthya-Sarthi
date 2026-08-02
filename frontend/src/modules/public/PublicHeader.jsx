import React from 'react';
import { Activity, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PublicHeader({ backLabel = 'Back to search' }) {
  return (
    <header className="sticky top-0 z-30 border-b border-care-border bg-care-surface/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <div className="flex items-center gap-5">
          <Link to="/" className="inline-flex items-center gap-3" aria-label="Swasthya Sarthi home">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-care-primary text-care-surface">
              <span className="relative h-5 w-5" aria-hidden="true">
                <Activity className="care-logo-pulse-base absolute inset-0 h-5 w-5" strokeWidth={2.5} />
                <Activity className="care-logo-pulse-scan absolute inset-0 h-5 w-5" strokeWidth={2.5} />
              </span>
            </span>
            <span className="care-logo-word-shine hidden text-lg font-bold text-care-heading sm:inline">Swasthya Sarthi</span>
          </Link>
          <Link to="/#search-results" className="inline-flex items-center gap-2 text-sm font-semibold text-care-muted hover:text-care-primary-hover">
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/login/patient" className="rounded-lg px-3 py-2 text-sm font-semibold text-care-heading hover:bg-care-neutral">Sign in</Link>
          <Link to="/signup/patient" className="hidden rounded-lg bg-care-primary px-4 py-2 text-sm font-semibold text-care-surface hover:bg-care-primary-hover sm:inline">Create account</Link>
        </div>
      </div>
    </header>
  );
}
