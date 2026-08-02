-- Canonical directory governance and verification tracking.
-- This keeps one canonical facility table (`hospitals`) and makes both doctor
-- surfaces auditable: bookable Swasthya Sarthi doctors (`doctor_profiles`) and
-- source-linked public roster doctors (`verified_doctors`).

ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS verification_level TEXT
    CHECK (verification_level IN ('unverified', 'source-linked', 'hospital-confirmed', 'directory-confirmed', 'conflict'))
    DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verification_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS secondary_source_url TEXT,
  ADD COLUMN IF NOT EXISTS verification_conflict_notes TEXT,
  ADD COLUMN IF NOT EXISTS operating_hours TEXT,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_verification_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

UPDATE public.hospitals
SET
  verification_level = CASE
    WHEN verification_status = 'verified' AND verification_source_url IS NOT NULL THEN 'source-linked'
    WHEN verification_status = 'verified' OR source_url IS NOT NULL THEN 'directory-confirmed'
    ELSE COALESCE(verification_level, 'unverified')
  END,
  is_public = CASE
    WHEN verification_status = 'excluded' THEN false
    WHEN verification_status = 'verified' OR source_url IS NOT NULL OR verification_source_url IS NOT NULL THEN true
    ELSE is_public
  END,
  last_verified_at = COALESCE(last_verified_at, verified_at, source_last_updated::timestamptz),
  next_verification_due_at = COALESCE(
    next_verification_due_at,
    (COALESCE(verified_at, source_last_updated::timestamptz, now()) + INTERVAL '6 months')
  ),
  verification_sources = CASE
    WHEN jsonb_array_length(verification_sources) > 0 THEN verification_sources
    WHEN verification_source_url IS NOT NULL THEN jsonb_build_array(jsonb_build_object('type', 'primary', 'url', verification_source_url))
    WHEN source_url IS NOT NULL THEN jsonb_build_array(jsonb_build_object('type', 'primary', 'url', source_url))
    ELSE verification_sources
  END;

ALTER TABLE public.doctor_profiles
  ADD COLUMN IF NOT EXISTS verification_level TEXT
    CHECK (verification_level IN ('unverified', 'source-linked', 'hospital-confirmed', 'directory-confirmed', 'conflict'))
    DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verification_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS official_profile_url TEXT,
  ADD COLUMN IF NOT EXISTS secondary_source_url TEXT,
  ADD COLUMN IF NOT EXISTS verification_conflict_notes TEXT,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_verification_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

UPDATE public.doctor_profiles
SET
  verification_level = CASE
    WHEN status = 'active' AND license_no IS NOT NULL THEN 'hospital-confirmed'
    ELSE COALESCE(verification_level, 'unverified')
  END,
  is_public = CASE
    WHEN status = 'active' AND license_no IS NOT NULL THEN true
    ELSE is_public
  END,
  next_verification_due_at = COALESCE(next_verification_due_at, now() + INTERVAL '6 months');

ALTER TABLE public.verified_doctors
  ADD COLUMN IF NOT EXISTS license_no TEXT,
  ADD COLUMN IF NOT EXISTS verification_level TEXT
    CHECK (verification_level IN ('unverified', 'source-linked', 'hospital-confirmed', 'directory-confirmed', 'conflict'))
    DEFAULT 'source-linked',
  ADD COLUMN IF NOT EXISTS verification_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS secondary_source_url TEXT,
  ADD COLUMN IF NOT EXISTS verification_conflict_notes TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_verification_due_at TIMESTAMPTZ;

UPDATE public.verified_doctors
SET
  verification_level = COALESCE(verification_level, 'source-linked'),
  last_verified_at = COALESCE(last_verified_at, verified_at),
  next_verification_due_at = COALESCE(next_verification_due_at, verified_at + INTERVAL '6 months'),
  verification_sources = CASE
    WHEN jsonb_array_length(verification_sources) > 0 THEN verification_sources
    ELSE jsonb_build_array(jsonb_build_object('type', 'primary', 'url', official_profile_url, 'name', source_name))
  END;

ALTER TABLE public.verified_doctor_hospital_affiliations
  ADD COLUMN IF NOT EXISTS verification_level TEXT
    CHECK (verification_level IN ('unverified', 'source-linked', 'hospital-confirmed', 'directory-confirmed', 'conflict'))
    DEFAULT 'source-linked',
  ADD COLUMN IF NOT EXISTS verification_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS secondary_source_url TEXT,
  ADD COLUMN IF NOT EXISTS verification_conflict_notes TEXT;

UPDATE public.verified_doctor_hospital_affiliations
SET
  verification_level = CASE
    WHEN status = 'needs_review' THEN 'conflict'
    WHEN status = 'verified' THEN COALESCE(verification_level, 'source-linked')
    ELSE COALESCE(verification_level, 'unverified')
  END,
  verification_sources = CASE
    WHEN jsonb_array_length(verification_sources) > 0 THEN verification_sources
    ELSE jsonb_build_array(jsonb_build_object('type', 'primary', 'url', source_url))
  END;

CREATE TABLE IF NOT EXISTS public.directory_city_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL,
  city TEXT NOT NULL,
  target_priority INT NOT NULL DEFAULT 100,
  hospital_count INT NOT NULL DEFAULT 0,
  doctor_count INT NOT NULL DEFAULT 0,
  source_linked_count INT NOT NULL DEFAULT 0,
  hospital_confirmed_count INT NOT NULL DEFAULT 0,
  conflict_count INT NOT NULL DEFAULT 0,
  coverage_status TEXT NOT NULL
    CHECK (coverage_status IN ('not-started', 'in-progress', 'covered', 'needs-review', 'stale'))
    DEFAULT 'not-started',
  last_verified_at TIMESTAMPTZ,
  next_verification_due_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (state, city)
);

CREATE OR REPLACE VIEW public.canonical_doctor_directory AS
SELECT
  vd.id::text AS canonical_id,
  'verified_public_directory'::text AS source_type,
  vd.full_name,
  vd.credentials,
  vd.license_no,
  vd.years_experience,
  vd.specialization_id,
  s.name AS specialization,
  vdha.hospital_id,
  h.name AS hospital_name,
  h.address AS hospital_address,
  COALESCE(vd.city, h.city) AS city,
  COALESCE(vd.state, h.state) AS state,
  COALESCE(vd.latitude, h.latitude) AS latitude,
  COALESCE(vd.longitude, h.longitude) AS longitude,
  vd.official_profile_url AS source_url,
  vd.verification_level,
  vd.verification_sources,
  vd.last_verified_at,
  vd.next_verification_due_at,
  vd.is_active AS is_public
FROM public.verified_doctors vd
JOIN public.verified_doctor_hospital_affiliations vdha ON vdha.doctor_id = vd.id
JOIN public.hospitals h ON h.id = vdha.hospital_id
LEFT JOIN public.specializations s ON s.id = vd.specialization_id
WHERE vd.is_active = true
  AND vdha.status = 'verified'
  AND vd.verification_level IN ('source-linked', 'hospital-confirmed', 'directory-confirmed')

UNION ALL

SELECT
  dp.user_id::text AS canonical_id,
  'bookable_swasthya_sarthi_doctor'::text AS source_type,
  u.full_name,
  dp.credentials,
  dp.license_no,
  dp.years_experience,
  dp.specialization_id,
  s.name AS specialization,
  dha.hospital_id,
  h.name AS hospital_name,
  h.address AS hospital_address,
  h.city,
  h.state,
  h.latitude,
  h.longitude,
  dp.official_profile_url AS source_url,
  dp.verification_level,
  dp.verification_sources,
  dp.last_verified_at,
  dp.next_verification_due_at,
  dp.is_public
FROM public.doctor_profiles dp
JOIN public.users u ON u.id = dp.user_id
JOIN public.doctor_hospital_affiliations dha ON dha.doctor_id = dp.user_id
JOIN public.hospitals h ON h.id = dha.hospital_id
LEFT JOIN public.specializations s ON s.id = dp.specialization_id
WHERE dp.status = 'active'
  AND dha.status = 'accepted'
  AND dp.is_public = true
  AND dp.verification_level IN ('source-linked', 'hospital-confirmed', 'directory-confirmed');

GRANT SELECT ON public.directory_city_coverage TO authenticated;
GRANT SELECT ON public.canonical_doctor_directory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.directory_city_coverage TO service_role;
