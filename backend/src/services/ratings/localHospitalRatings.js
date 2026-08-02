import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const ratingsFile = resolve(moduleDir, '../../../data/hospital-ratings.local');
let writeQueue = Promise.resolve();

async function readStore() {
  try {
    const contents = await readFile(ratingsFile, 'utf8');
    const parsed = JSON.parse(contents);
    return parsed && typeof parsed.ratings === 'object'
      ? parsed
      : { version: 1, ratings: {} };
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, ratings: {} };
    throw error;
  }
}

function summarizeHospital(store, hospitalId, patientId = null) {
  const hospitalRatings = store.ratings[hospitalId] || {};
  const values = Object.values(hospitalRatings).filter(rating =>
    Number.isInteger(rating) && rating >= 1 && rating <= 5
  );
  const ratingCount = values.length;
  const ratingAvg = ratingCount
    ? Number((values.reduce((sum, rating) => sum + rating, 0) / ratingCount).toFixed(2))
    : 0;

  return {
    ratingAvg,
    ratingCount,
    userRating: patientId ? hospitalRatings[patientId] || null : null,
    storage: 'local-development'
  };
}

export async function getLocalHospitalRatingSummary(hospitalId, patientId = null) {
  await writeQueue;
  return summarizeHospital(await readStore(), hospitalId, patientId);
}

export async function saveLocalHospitalRating(hospitalId, patientId, rating) {
  const operation = writeQueue.then(async () => {
    const store = await readStore();
    store.ratings[hospitalId] = {
      ...(store.ratings[hospitalId] || {}),
      [patientId]: rating
    };

    await mkdir(dirname(ratingsFile), { recursive: true });
    const temporaryFile = `${ratingsFile}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(store, null, 2), 'utf8');
    await rename(temporaryFile, ratingsFile);
    return summarizeHospital(store, hospitalId, patientId);
  });

  writeQueue = operation.catch(() => undefined);
  return operation;
}
