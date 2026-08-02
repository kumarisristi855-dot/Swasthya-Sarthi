-- Appointments
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
  appointment_time TIMESTAMPTZ NOT NULL,
  status TEXT CHECK (status IN ('booked','completed','cancelled','no_show')) DEFAULT 'booked',
  symptom_query TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (doctor_id, appointment_time)     -- slot-lock constraint
);

-- Consultation notes / prescriptions
CREATE TABLE IF NOT EXISTS public.consultation_notes (
  id SERIAL PRIMARY KEY,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  notes TEXT,
  prescription TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI symptom search logs
CREATE TABLE IF NOT EXISTS public.symptom_queries (
  id SERIAL PRIMARY KEY,
  patient_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  raw_input TEXT,
  matched_specialization_id INT REFERENCES public.specializations(id) ON DELETE SET NULL,
  urgency_level TEXT CHECK (urgency_level IN ('routine','same_day','emergency')),
  confidence_score FLOAT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ratings/reviews
CREATE TABLE IF NOT EXISTS public.reviews (
  id SERIAL PRIMARY KEY,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE UNIQUE,
  patient_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
