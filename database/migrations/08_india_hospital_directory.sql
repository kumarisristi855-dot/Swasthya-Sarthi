-- India-wide National Hospital Directory metadata.
-- Source: Ministry of Health and Family Welfare / NIHFW via data.gov.in.

ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS source_dataset TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_last_updated DATE,
  ADD COLUMN IF NOT EXISTS care_type TEXT,
  ADD COLUMN IF NOT EXISTS system_of_medicine TEXT,
  ADD COLUMN IF NOT EXISTS facilities TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS mobile TEXT,
  ADD COLUMN IF NOT EXISTS doctor_count INT,
  ADD COLUMN IF NOT EXISTS bed_count INT;

-- Hospital names are not globally unique across India. Source identity is.
DROP INDEX IF EXISTS public.hospitals_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS hospitals_source_record_unique
  ON public.hospitals(source_dataset, source_record_id);

CREATE INDEX IF NOT EXISTS idx_hospitals_india_location
  ON public.hospitals(state, district, city);

CREATE INDEX IF NOT EXISTS idx_hospitals_coordinates
  ON public.hospitals(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hospitals_source_dataset
  ON public.hospitals(source_dataset);

GRANT SELECT ON public.hospitals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hospitals TO service_role;
