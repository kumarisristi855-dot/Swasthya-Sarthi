-- Many-to-many: doctors can be affiliated with multiple hospitals
CREATE TABLE IF NOT EXISTS public.doctor_hospital_affiliations (
  doctor_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  hospital_id UUID REFERENCES public.hospitals(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT CHECK (status IN ('invited','accepted','revoked')) DEFAULT 'invited',
  PRIMARY KEY (doctor_id, hospital_id)
);

-- Doctor recurring weekly availability, per hospital
CREATE TABLE IF NOT EXISTS public.doctor_availability (
  id SERIAL PRIMARY KEY,
  doctor_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  hospital_id UUID REFERENCES public.hospitals(id) ON DELETE CASCADE,
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_duration_minutes INT DEFAULT 15 CHECK (slot_duration_minutes > 0)
);

-- One-off time-off / blocked slots (holidays, leave)
CREATE TABLE IF NOT EXISTS public.doctor_time_off (
  id SERIAL PRIMARY KEY,
  doctor_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  reason TEXT,
  CONSTRAINT chk_time_off_range CHECK (end_datetime > start_datetime)
);
