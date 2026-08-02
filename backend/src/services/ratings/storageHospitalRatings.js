import { supabaseAdmin } from '../../lib/supabase.js';

const bucketName = 'hospital-rating-fallback';

async function ensureRatingBucket() {
  const { data: bucket, error } = await supabaseAdmin.storage.getBucket(bucketName);
  if (!error && bucket) return;

  const { error: createError } = await supabaseAdmin.storage.createBucket(bucketName, {
    public: false,
    fileSizeLimit: 1024 * 1024,
    allowedMimeTypes: ['application/json']
  });
  if (createError && !/already exists/i.test(createError.message || '')) throw createError;
}

async function readHospitalRecord(hospitalId) {
  await ensureRatingBucket();
  const objectPath = `${hospitalId}.json`;
  const { data, error } = await supabaseAdmin.storage.from(bucketName).download(objectPath);

  if (error) {
    if (/not found|does not exist|404/i.test(error.message || '') || error.statusCode === '404') {
      return { version: 1, ratings: {} };
    }
    throw error;
  }

  const text = typeof data?.text === 'function'
    ? await data.text()
    : Buffer.from(await data.arrayBuffer()).toString('utf8');
  const parsed = JSON.parse(text || '{}');
  return parsed && typeof parsed.ratings === 'object'
    ? parsed
    : { version: 1, ratings: {} };
}

async function writeHospitalRecord(hospitalId, record) {
  await ensureRatingBucket();
  const objectPath = `${hospitalId}.json`;
  const body = JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    ratings: record.ratings || {}
  });

  const { error } = await supabaseAdmin.storage.from(bucketName).upload(objectPath, body, {
    contentType: 'application/json',
    cacheControl: '0',
    upsert: true
  });
  if (error) throw error;
}

function summarize(record, patientId = null) {
  const values = Object.values(record.ratings || {}).filter(rating =>
    Number.isInteger(rating) && rating >= 1 && rating <= 5
  );
  const ratingCount = values.length;
  const ratingAvg = ratingCount
    ? Number((values.reduce((sum, rating) => sum + rating, 0) / ratingCount).toFixed(2))
    : 0;

  return {
    ratingAvg,
    ratingCount,
    userRating: patientId ? record.ratings?.[patientId] || null : null,
    storage: 'supabase-storage-fallback'
  };
}

export async function getStorageHospitalRatingSummary(hospitalId, patientId = null) {
  const record = await readHospitalRecord(hospitalId);
  return summarize(record, patientId);
}

export async function saveStorageHospitalRating(hospitalId, patientId, rating) {
  const record = await readHospitalRecord(hospitalId);
  record.ratings = {
    ...(record.ratings || {}),
    [patientId]: rating
  };
  await writeHospitalRecord(hospitalId, record);
  return summarize(record, patientId);
}
