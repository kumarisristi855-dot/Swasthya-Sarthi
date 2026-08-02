-- Source-verified public doctor directory.
-- Directory doctors are deliberately separate from Swasthya Sarthi users: appearing in
-- a hospital's public roster does not create an account or a bookable schedule.

ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS verification_status TEXT
    CHECK (verification_status IN ('verified', 'unverified', 'excluded'))
    DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verification_source_url TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exclusion_reason TEXT;

CREATE TABLE IF NOT EXISTS public.verified_doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  specialization_id INT REFERENCES public.specializations(id) ON DELETE SET NULL,
  credentials TEXT,
  years_experience INT CHECK (years_experience IS NULL OR years_experience >= 0),
  official_profile_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (full_name, source_name)
);

CREATE TABLE IF NOT EXISTS public.verified_doctor_hospital_affiliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.verified_doctors(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_name TEXT,
  official_booking_url TEXT,
  source_url TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('verified', 'needs_review', 'removed'))
    DEFAULT 'verified',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, hospital_id)
);

CREATE INDEX IF NOT EXISTS idx_verified_doctors_specialization
  ON public.verified_doctors(specialization_id, is_active);

CREATE INDEX IF NOT EXISTS idx_verified_affiliations_hospital
  ON public.verified_doctor_hospital_affiliations(hospital_id, status);

ALTER TABLE public.verified_doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_doctor_hospital_affiliations ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.verified_doctors TO authenticated;
GRANT SELECT ON public.verified_doctor_hospital_affiliations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.verified_doctors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.verified_doctor_hospital_affiliations TO service_role;

DROP POLICY IF EXISTS verified_doctors_read ON public.verified_doctors;
CREATE POLICY verified_doctors_read
  ON public.verified_doctors
  FOR SELECT
  TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS verified_affiliations_read ON public.verified_doctor_hospital_affiliations;
CREATE POLICY verified_affiliations_read
  ON public.verified_doctor_hospital_affiliations
  FOR SELECT
  TO authenticated
  USING (status = 'verified');
