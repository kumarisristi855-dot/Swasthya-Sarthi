import { Router } from 'express';
import { calculateDistance } from '../services/geolocation/haversine.js';
import {
  outbreakSourceCatalog,
  publicHealthNotices
} from '../data/publicHealthNotices.js';

const router = Router();

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

function normalizeDistrict(value) {
  return normalize(value)
    .replace(/\b(district|dist)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function areaMatchesLocation(area, location) {
  const normalizedState = normalize(location.state);
  const normalizedDistrict = normalizeDistrict(location.district);
  const normalizedPlace = normalizeDistrict(location.place);
  const areaState = normalize(area.state);
  const areaDistrict = normalizeDistrict(area.district);
  const stateMatches = !normalizedState || normalizedState === areaState;

  if (
    location.hasCoordinates &&
    Number.isFinite(area.latitude) &&
    Number.isFinite(area.longitude)
  ) {
    const distance = calculateDistance(
      location.latitude,
      location.longitude,
      area.latitude,
      area.longitude
    );
    if (distance <= area.radiusKm) {
      return { matched: true, distance };
    }
  }

  const districtNames = [areaDistrict, ...(area.aliases || []).map(normalizeDistrict)]
    .filter(Boolean);
  const locationNames = [normalizedDistrict, normalizedPlace].filter(Boolean);
  const districtMatches = districtNames.some(districtName =>
    locationNames.some(locationName =>
      locationName === districtName ||
      locationName.startsWith(`${districtName} `) ||
      locationName.endsWith(` ${districtName}`) ||
      locationName.includes(` ${districtName} `)
    )
  );

  if (stateMatches && districtMatches) {
    return { matched: true, distance: null };
  }

  return { matched: false, distance: null };
}

// GET /api/outbreaks/nearby?lat=&lng=&state=&district=&place=
// Returns only fresh, official public-health notices that match the selected location.
router.get('/nearby', (req, res) => {
  const latitude = Number.parseFloat(req.query.lat);
  const longitude = Number.parseFloat(req.query.lng);
  const hasLatitude = Number.isFinite(latitude);
  const hasLongitude = Number.isFinite(longitude);

  if (hasLatitude !== hasLongitude) {
    return res.status(400).json({
      error: {
        message: 'Latitude and longitude must be provided together',
        code: 'VALIDATION_ERROR'
      }
    });
  }

  const location = {
    latitude,
    longitude,
    hasCoordinates: hasLatitude && hasLongitude,
    state: String(req.query.state || '').slice(0, 120),
    district: String(req.query.district || '').slice(0, 120),
    place: String(req.query.place || '').slice(0, 160)
  };
  const now = Date.now();

  const alerts = publicHealthNotices
    .filter(notice =>
      Date.parse(notice.issuedAt) <= now &&
      Date.parse(notice.reviewAfter) >= now
    )
    .flatMap(notice => {
      const matches = notice.areas
        .map(area => ({ area, ...areaMatchesLocation(area, location) }))
        .filter(match => match.matched)
        .sort((a, b) =>
          (a.distance ?? Number.POSITIVE_INFINITY) -
          (b.distance ?? Number.POSITIVE_INFINITY)
        );
      const nearest = matches[0];
      if (!nearest) return [];

      return [{
        id: notice.id,
        disease: notice.disease,
        headline: notice.headline,
        summary: notice.summary,
        guidance: notice.guidance,
        status: notice.status,
        severity: notice.severity,
        issuedAt: notice.issuedAt,
        reviewAfter: notice.reviewAfter,
        sourceName: notice.sourceName,
        sourceUrl: notice.sourceUrl,
        matchedArea: `${nearest.area.district}, ${nearest.area.state}`,
        distance: nearest.distance,
        area: {
          latitude: nearest.area.latitude,
          longitude: nearest.area.longitude,
          radiusKm: nearest.area.radiusKm
        }
      }];
    });

  return res.status(200).json({
    alerts,
    sourceCatalog: outbreakSourceCatalog,
    disclaimer: 'Public-health notices are informational and do not replace guidance from local health authorities.'
  });
});

export default router;
export { areaMatchesLocation };
