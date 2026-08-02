-- Core identity (mirrors Supabase auth.users via id)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('patient','doctor','hospital_admin')),
  full_name TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Standardized specialization list
CREATE TABLE IF NOT EXISTS public.specializations (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT
);

-- Hospitals
CREATE TABLE IF NOT EXISTS public.hospitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  departments TEXT[],
  timings JSONB,
  admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Doctor profiles
CREATE TABLE IF NOT EXISTS public.doctor_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  specialization_id INT REFERENCES public.specializations(id) ON DELETE SET NULL,
  license_no TEXT,
  years_experience INT,
  consultation_fee NUMERIC,
  bio TEXT,
  status TEXT CHECK (status IN ('pending','active','rejected')) DEFAULT 'pending',
  rating_avg NUMERIC DEFAULT 0,
  rating_count INT DEFAULT 0
);

-- Patient profiles
CREATE TABLE IF NOT EXISTS public.patient_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  date_of_birth DATE,
  gender TEXT,
  allergies TEXT[],
  chronic_conditions TEXT[]
);
