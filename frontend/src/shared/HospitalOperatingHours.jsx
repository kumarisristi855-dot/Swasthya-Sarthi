import React from 'react';
import { Clock } from 'lucide-react';
import Badge from './ui/Badge';

export default function HospitalOperatingHours({ operatingHours, className = '', compact = false }) {
  const status = operatingHours?.status || 'unpublished';
  const weekly = operatingHours?.weekly && typeof operatingHours.weekly === 'object'
    ? Object.entries(operatingHours.weekly).filter(([, hours]) => Boolean(hours))
    : [];
  const hasPublishedHours = status === 'published' && (weekly.length > 0 || operatingHours?.text || operatingHours?.label);
  const label = hasPublishedHours
    ? (weekly.length > 0 ? 'Published hours' : (operatingHours.text || operatingHours.label))
    : 'Hours not published';

  if (compact || weekly.length === 0) {
    return (
      <Badge variant={hasPublishedHours ? 'info' : 'neutral'} className={className}>
        <Clock className="h-3.5 w-3.5 text-care-muted" />
        <span>{label}</span>
      </Badge>
    );
  }

  return (
    <div className={className}>
      <Badge variant="info">
        <Clock className="h-3.5 w-3.5 text-care-muted" />
        <span>Published hours</span>
      </Badge>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-7">
        {weekly.map(([day, hours]) => (
          <div key={day} className="rounded-lg border border-care-border bg-care-surface p-2.5 text-center">
            <span className="mb-1 block text-xs font-semibold uppercase text-care-muted">{day}</span>
            <span className="font-mono text-xs text-care-muted">{hours}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
