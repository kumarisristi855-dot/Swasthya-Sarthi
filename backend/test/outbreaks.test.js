import test from 'node:test';
import assert from 'node:assert/strict';
import { areaMatchesLocation } from '../src/routes/outbreaks.js';

const kozhikode = {
  state: 'Kerala',
  district: 'Kozhikode',
  aliases: ['Calicut'],
  latitude: 11.2588,
  longitude: 75.7804,
  radiusKm: 70
};

test('matches an exact district without coordinates', () => {
  const result = areaMatchesLocation(kozhikode, {
    state: 'Kerala',
    district: 'Kozhikode District',
    place: 'Kozhikode, Kerala',
    hasCoordinates: false
  });

  assert.equal(result.matched, true);
});

test('matches a precise locality label containing the affected district', () => {
  const result = areaMatchesLocation(kozhikode, {
    state: 'Kerala',
    district: '',
    place: 'Palayam, Kozhikode District, Kerala, India',
    hasCoordinates: false
  });

  assert.equal(result.matched, true);
});

test('matches the public alias Calicut', () => {
  const result = areaMatchesLocation(kozhikode, {
    state: 'Kerala',
    district: 'Calicut',
    place: 'Calicut, Kerala',
    hasCoordinates: false
  });

  assert.equal(result.matched, true);
});

test('does not match the same district text in another state', () => {
  const result = areaMatchesLocation(kozhikode, {
    state: 'Delhi',
    district: 'Kozhikode',
    place: 'Kozhikode',
    hasCoordinates: false
  });

  assert.equal(result.matched, false);
});

test('matches a coordinate inside the monitored radius', () => {
  const result = areaMatchesLocation(kozhikode, {
    latitude: 11.2588,
    longitude: 75.7804,
    state: '',
    district: '',
    place: '',
    hasCoordinates: true
  });

  assert.equal(result.matched, true);
  assert.equal(result.distance, 0);
});
