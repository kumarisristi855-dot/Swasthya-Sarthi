const ALLOWED_METADATA_KEYS = new Set([
  'mode',
  'locationMethod',
  'listingType',
  'sourceType',
  'recoveryAction',
]);

export function trackInteraction(name, metadata = {}) {
  if (typeof window === 'undefined') return;

  const safeMetadata = Object.fromEntries(
    Object.entries(metadata)
      .filter(([key, value]) => ALLOWED_METADATA_KEYS.has(key) && ['string', 'boolean', 'number'].includes(typeof value))
      .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 40) : value])
  );

  window.dispatchEvent(new CustomEvent('swasthya:interaction', {
    detail: { name, metadata: safeMetadata },
  }));
}
