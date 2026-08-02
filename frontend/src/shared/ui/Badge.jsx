/* eslint-disable react/only-export-components */
import React from 'react';

const variants = {
  success: 'care-badge-success',
  danger: 'care-badge-danger',
  info: 'care-badge-info',
  neutral: 'care-badge-neutral',
  warning: 'care-badge-warning'
};

export function statusPresentation(status) {
  const normalized = String(status || '').toLowerCase();
  const presentations = {
    booked: { label: 'Upcoming', variant: 'success' },
    upcoming: { label: 'Upcoming', variant: 'success' },
    confirmed: { label: 'Confirmed', variant: 'success' },
    active: { label: 'Active', variant: 'success' },
    verified: { label: 'Verified', variant: 'success' },
    completed: { label: 'Completed', variant: 'success' },
    cancelled: { label: 'Cancelled', variant: 'danger' },
    canceled: { label: 'Cancelled', variant: 'danger' },
    no_show: { label: 'No show', variant: 'neutral' },
    pending: { label: 'Pending', variant: 'warning' }
  };
  return presentations[normalized] || {
    label: normalized ? normalized.replaceAll('_', ' ') : 'Unknown',
    variant: 'neutral'
  };
}

export default function Badge({ children, variant = 'neutral', icon: Icon, className = '' }) {
  return (
    <span className={`care-badge ${variants[variant] || variants.neutral} ${className}`}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function StatusBadge({ status, className = '' }) {
  const presentation = statusPresentation(status);
  return <Badge variant={presentation.variant} className={className}>{presentation.label}</Badge>;
}
