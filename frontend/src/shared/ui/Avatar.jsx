/* eslint-disable react/only-export-components */
import React from 'react';

const palettes = [
  'border-care-primary bg-care-primary-subtle text-care-primary-hover',
  'border-care-border bg-care-neutral text-care-heading'
];

function hashValue(value) {
  return [...String(value || 'Swasthya Sarthi')].reduce((hash, character) => (
    ((hash << 5) - hash) + character.charCodeAt(0)
  ) | 0, 0);
}

export function initialsFor(name) {
  const words = String(name || 'Doctor').replace(/^dr\.?\s+/i, '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'DR';
}

export default function Avatar({ name, id, src, size = 'md', variant = 'auto', className = '' }) {
  const sizeClass = size === 'lg' ? 'h-20 w-20 text-xl' : size === 'sm' ? 'h-10 w-10 text-xs' : 'h-14 w-14 text-sm';
  const palette = variant === 'brand'
    ? 'border-care-primary/30 bg-care-primary-subtle text-care-primary-hover'
    : palettes[Math.abs(hashValue(id || name)) % palettes.length];

  if (src) {
    return <img src={src} alt={`${name || 'Doctor'} profile`} className={`${sizeClass} rounded-lg border border-care-border object-cover ${className}`} />;
  }

  return (
    <span aria-label={`${name || 'Doctor'} initials`} className={`${sizeClass} ${palette} inline-flex shrink-0 items-center justify-center rounded-lg border font-bold ${className}`}>
      {initialsFor(name)}
    </span>
  );
}
