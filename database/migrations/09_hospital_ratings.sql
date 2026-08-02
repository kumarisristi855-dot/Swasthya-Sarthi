-- Patient-submitted hospital ratings, separate from appointment/doctor reviews.

ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.hospital_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_hospital_ratings_hospital
  ON public.hospital_ratings(hospital_id);

ALTER TABLE public.hospital_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hospital_ratings_select ON public.hospital_ratings;
CREATE POLICY hospital_ratings_select
  ON public.hospital_ratings
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS hospital_ratings_insert ON public.hospital_ratings;
CREATE POLICY hospital_ratings_insert
  ON public.hospital_ratings
  FOR INSERT
  TO authenticated
  WITH CHECK (patient_id = auth.uid());

DROP POLICY IF EXISTS hospital_ratings_update ON public.hospital_ratings;
CREATE POLICY hospital_ratings_update
  ON public.hospital_ratings
  FOR UPDATE
  TO authenticated
  USING (patient_id = auth.uid())
  WITH CHECK (patient_id = auth.uid());

GRANT SELECT ON public.hospital_ratings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.hospital_ratings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hospital_ratings TO service_role;

