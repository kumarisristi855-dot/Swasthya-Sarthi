import React from 'react';
import { Activity } from 'lucide-react';

export default function BrandMark({ label = 'CareSync', compact = false, light = false }) {
  return (
    <span className="inline-flex items-center gap-3">
      <span className={`${compact ? 'h-9 w-9' : 'h-10 w-10'} flex shrink-0 items-center justify-center rounded-lg bg-care-primary text-care-heading`}>
        <span className={`relative ${compact ? 'h-5 w-5' : 'h-6 w-6'}`} aria-hidden="true">
          <Activity className={`care-logo-pulse-base absolute inset-0 ${compact ? 'h-5 w-5' : 'h-6 w-6'}`} strokeWidth={2.4} />
          <Activity className={`care-logo-pulse-scan absolute inset-0 ${compact ? 'h-5 w-5' : 'h-6 w-6'}`} strokeWidth={2.4} />
        </span>
      </span>
      <span className={`care-logo-word-shine ${light ? 'care-logo-word-shine-light text-care-surface' : 'text-care-heading'} ${compact ? 'text-base' : 'text-xl'} font-bold`}>{label}</span>
    </span>
  );
}
