import { API_URL } from './api';
const GOOGLE_RATING_SESSION_KEY = 'swasthya-sarthi-google-hospital-ratings';
const GOOGLE_RATING_CACHE_MS = 24 * 60 * 60 * 1000;

function readCachedRatings() {
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(GOOGLE_RATING_SESSION_KEY));
    if (!cached || Date.now() - cached.updatedAt > GOOGLE_RATING_CACHE_MS) return {};
    return cached.ratings || {};
  } catch {
    return {};
  }
}

function writeCachedRatings(ratings) {
  try {
    window.sessionStorage.setItem(GOOGLE_RATING_SESSION_KEY, JSON.stringify({
      updatedAt: Date.now(),
      ratings,
    }));
  } catch {
    // Ratings still render for the current request when session storage is unavailable.
  }
}

function mergeRatings(hospitals, ratings) {
  return hospitals.map(hospital => {
    const googleRating = ratings[hospital.id];
    return googleRating ? { ...hospital, googleRating } : hospital;
  });
}

export async function enrichHospitalsWithGoogleRatings(hospitals, limit = Number.POSITIVE_INFINITY) {
  const cachedRatings = readCachedRatings();
  const hospitalsWithCache = mergeRatings(hospitals, cachedRatings);
  const candidates = hospitals
    .filter(hospital => /^[0-9a-f-]{36}$/i.test(String(hospital.id || '')))
    .slice(0, limit);

  if (!candidates.length) return hospitalsWithCache;

  const freshRatings = {};
  let unavailableWarning = null;
  const batchSize = 24;
  for (let index = 0; index < candidates.length; index += batchSize) {
    const batch = candidates.slice(index, index + batchSize);
    const response = await fetch(`${API_URL}/hospitals/google-ratings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalIds: batch.map(hospital => hospital.id) }),
    });
    const data = await response.json();

    if (!response.ok) {
      const unavailable = {
        unavailable: true,
        code: data.error?.code || 'GOOGLE_PLACES_UNAVAILABLE',
        message: data.error?.message || 'Google ratings are temporarily unavailable.',
      };
      for (const hospital of candidates.slice(index)) {
        if (!cachedRatings[hospital.id]) {
          freshRatings[hospital.id] = unavailable;
        }
      }
      break;
    }

    Object.assign(freshRatings, data.ratings || {});
    if (data.warning?.code) {
      unavailableWarning = data.warning;
    }
  }

  if (Object.keys(freshRatings).length) {
    writeCachedRatings({ ...cachedRatings, ...freshRatings });
  }

  const displayRatings = { ...freshRatings };
  if (unavailableWarning) {
    for (const hospital of candidates) {
      if (!displayRatings[hospital.id] && !cachedRatings[hospital.id]) {
        displayRatings[hospital.id] = {
          unavailable: true,
          code: unavailableWarning.code,
          message: unavailableWarning.message,
        };
      }
    }
  }

  return mergeRatings(hospitalsWithCache, displayRatings);
}
