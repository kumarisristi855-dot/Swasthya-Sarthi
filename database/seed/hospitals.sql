INSERT INTO public.hospitals (id, name, address, latitude, longitude, departments, timings, admin_id) VALUES
(
  'a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a1',
  'City General Hospital',
  '123 Health Ave, New York, NY 10001',
  40.7128,
  -74.0060,
  ARRAY['General Medicine', 'Cardiology', 'Pediatrics', 'Orthopedic'],
  '{"mon": "08:00-20:00", "tue": "08:00-20:00", "wed": "08:00-20:00", "thu": "08:00-20:00", "fri": "08:00-20:00", "sat": "09:00-17:00", "sun": "Closed"}'::jsonb,
  NULL
),
(
  'a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a2',
  'Metro Care Clinic',
  '456 Broadway, New York, NY 10012',
  40.7250,
  -73.9980,
  ARRAY['Dermatology', 'Dentistry', 'ENT Specialist'],
  '{"mon": "09:00-17:00", "tue": "09:00-17:00", "wed": "09:00-17:00", "thu": "09:00-17:00", "fri": "09:00-17:00", "sat": "Closed", "sun": "Closed"}'::jsonb,
  NULL
),
(
  'a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3',
  'St. Jude Children & Family Hospital',
  '789 Wall St, New York, NY 10005',
  40.7050,
  -74.0150,
  ARRAY['Pediatrics', 'Gynecology', 'General Medicine', 'Neurologist'],
  '{"mon": "00:00-23:59", "tue": "00:00-23:59", "wed": "00:00-23:59", "thu": "00:00-23:59", "fri": "00:00-23:59", "sat": "00:00-23:59", "sun": "00:00-23:59"}'::jsonb,
  NULL
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    address = EXCLUDED.address,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    departments = EXCLUDED.departments,
    timings = EXCLUDED.timings;
