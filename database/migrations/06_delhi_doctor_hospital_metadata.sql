-- Delhi MVP metadata extensions for doctor-hospital directory.
-- Additive only: preserves the existing role/auth schema and slot-locking model.

ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Delhi',
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS pincode TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS hospital_type TEXT DEFAULT 'Hospital',
  ADD COLUMN IF NOT EXISTS area TEXT,
  ADD COLUMN IF NOT EXISTS beds INT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.doctor_profiles
  ADD COLUMN IF NOT EXISTS profile_picture_url TEXT,
  ADD COLUMN IF NOT EXISTS credentials TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.doctor_hospital_affiliations
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS specialization_id INT REFERENCES public.specializations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consultation_fee NUMERIC,
  ADD COLUMN IF NOT EXISTS working_days INT[],
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS doctor_hospital_affiliations_id_unique
  ON public.doctor_hospital_affiliations(id);

CREATE UNIQUE INDEX IF NOT EXISTS hospitals_name_unique
  ON public.hospitals(name);

CREATE INDEX IF NOT EXISTS idx_hospitals_city_district
  ON public.hospitals(city, district);

CREATE INDEX IF NOT EXISTS idx_hospitals_pincode
  ON public.hospitals(pincode);

CREATE INDEX IF NOT EXISTS idx_affiliations_hospital_status
  ON public.doctor_hospital_affiliations(hospital_id, status);

CREATE INDEX IF NOT EXISTS idx_affiliations_doctor_status
  ON public.doctor_hospital_affiliations(doctor_id, status);
