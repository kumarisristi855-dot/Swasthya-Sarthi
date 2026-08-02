import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import Badge from './ui/Badge';
import { API_URL } from '../lib/api';

export function HospitalRatingSummary({
  ratingAvg: _ratingAvg = 0,
  ratingCount: _ratingCount = 0,
  googleRating = null,
  className = '',
  inverse = false,
}) {
  const googleAverage = Number(googleRating?.rating);
  const googleCount = Number(googleRating?.ratingCount) || 0;
  const googleUnavailable = Boolean(googleRating?.unavailable);
  const hasGoogleRating = Number.isFinite(googleAverage) && googleAverage > 0 && googleCount >= 1;

  return (
    <Badge variant={hasGoogleRating ? 'warning' : 'neutral'} className={className}>
      <Star className={`h-3.5 w-3.5 ${hasGoogleRating ? 'fill-care-warning text-care-warning' : 'text-care-muted'}`} />
      {hasGoogleRating ? (
        <>
          <span>Google Maps</span>
          <span aria-hidden="true">&middot;</span>
          <strong className={inverse ? 'text-care-surface' : 'text-care-heading'}>{googleAverage.toFixed(1)}</strong>
          <span>({googleCount} {googleCount === 1 ? 'rating' : 'ratings'})</span>
        </>
      ) : googleUnavailable ? (
        <span>{googleRating?.code === 'RESOURCE_EXHAUSTED' ? 'Google quota exhausted' : 'Google ratings unavailable'}</span>
      ) : (
        <span>Google Maps &middot; No rating found</span>
      )}
    </Badge>
  );
}

export function GoogleHospitalRating({ googleRating, className = '' }) {
  const count = Number(googleRating?.ratingCount) || 0;
  if (!googleRating || !Number.isFinite(Number(googleRating.rating)) || count < 1) return null;

  const content = (
    <>
      <Star className="h-4 w-4 fill-care-warning text-care-warning" />
      <strong className="text-care-heading">{Number(googleRating.rating).toFixed(1)}</strong>
      <span>({count.toLocaleString()})</span>
      <span className="ml-1 font-semibold text-care-body">Google Maps</span>
    </>
  );

  return googleRating.googleMapsUrl ? (
    <a
      href={googleRating.googleMapsUrl}
      target="_blank"
      rel="noreferrer"
      className={`flex w-fit items-center gap-1.5 text-xs text-care-muted hover:underline ${className}`}
    >
      {content}
    </a>
  ) : (
    <span className={`flex w-fit items-center gap-1.5 text-xs text-care-muted ${className}`}>
      {content}
    </span>
  );
}

export function DoctorRatingSummary({ ratingAvg = 0, ratingCount = 0, className = '' }) {
  const count = Number(ratingCount) || 0;
  const average = Number(ratingAvg) || 0;
  const hasRating = count >= 1 && average > 0;

  return (
    <Badge variant={hasRating ? 'warning' : 'neutral'} className={className}>
      <Star className={`h-3.5 w-3.5 ${hasRating ? 'fill-care-warning text-care-warning' : 'text-care-muted'}`} />
      {hasRating ? `${average.toFixed(1)} (${count} ${count === 1 ? 'review' : 'reviews'})` : 'No reviews yet'}
    </Badge>
  );
}

export function HospitalRatingForm({ hospitalId, token, onSaved }) {
  const [selectedRating, setSelectedRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    if (!hospitalId || !token) return;

    let active = true;
    fetch(`${API_URL}/hospitals/${hospitalId}/ratings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Could not load your rating');
        if (active) {
          setSelectedRating(data.userRating || 0);
          onSavedRef.current?.(data);
        }
      })
      .catch(fetchError => {
        if (active) setError(fetchError.message);
      });

    return () => {
      active = false;
    };
  }, [hospitalId, token]);

  async function saveRating(rating) {
    const previousRating = selectedRating;
    setSelectedRating(rating);
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`${API_URL}/hospitals/${hospitalId}/ratings`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rating }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Could not save your rating');

      setMessage(previousRating ? 'Your rating has been updated.' : 'Thank you for rating this facility.');
      onSaved?.(data);
    } catch (saveError) {
      setSelectedRating(previousRating);
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  const activeRating = hoveredRating || selectedRating;

  return (
    <div className="rounded-lg border border-care-border bg-care-surface p-4 text-care-heading shadow-sm">
      <p className="text-sm font-bold">{selectedRating ? 'Your hospital rating' : 'Rate this hospital'}</p>
      <div className="mt-2 flex items-center gap-1" onMouseLeave={() => setHoveredRating(0)}>
        {[1, 2, 3, 4, 5].map(rating => (
          <button
            key={rating}
            type="button"
            aria-label={`Rate ${rating} out of 5 stars`}
            disabled={saving}
            onMouseEnter={() => setHoveredRating(rating)}
            onFocus={() => setHoveredRating(rating)}
            onBlur={() => setHoveredRating(0)}
            onClick={() => saveRating(rating)}
            className="flex h-9 w-9 items-center justify-center text-care-warning transition-transform hover:scale-110 disabled:cursor-wait disabled:opacity-60"
          >
            <Star className={`h-6 w-6 ${rating <= activeRating ? 'fill-current' : ''}`} />
          </button>
        ))}
        {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin text-care-primary" />}
      </div>
      {message && <p className="mt-2 text-xs font-medium text-care-success">{message}</p>}
      {error && <p className="mt-2 text-xs font-medium text-care-danger">{error}</p>}
    </div>
  );
}
