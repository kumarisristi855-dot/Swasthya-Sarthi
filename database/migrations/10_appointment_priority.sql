ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS appointment_type TEXT NOT NULL DEFAULT 'routine';

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_appointment_type_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_appointment_type_check
  CHECK (appointment_type IN ('routine', 'emergency'));

CREATE INDEX IF NOT EXISTS appointments_priority_queue_idx
  ON public.appointments (doctor_id, appointment_time, appointment_type)
  WHERE status = 'booked';

COMMENT ON COLUMN public.appointments.appointment_type IS
  'Patient-selected scheduling priority. Emergency appointments still require a published, unlocked slot.';
