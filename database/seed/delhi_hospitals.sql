-- Delhi-only hospital/clinic seed data for the doctor directory MVP.
-- Run migration 06_delhi_doctor_hospital_metadata.sql before this seed.

INSERT INTO public.hospitals (
  name,
  address,
  latitude,
  longitude,
  departments,
  timings,
  city,
  district,
  state,
  pincode,
  phone,
  email,
  hospital_type,
  area
) VALUES
('Indraprastha Apollo Hospital', 'Delhi Mathura Road, Sarita Vihar, New Delhi', 28.5383, 77.2830, ARRAY['Cardiology','Neurology','Orthopedic','Dermatology','Pediatrics'], '{"mon":"09:00-18:00","tue":"09:00-18:00","wed":"09:00-18:00","thu":"09:00-18:00","fri":"09:00-18:00","sat":"09:00-14:00"}', 'Delhi', 'South Delhi', 'India', '110076', '+911126922222', 'delhi.apollo@example.com', 'Hospital', 'Sarita Vihar'),
('Max Super Speciality Hospital Saket', '1, 2, Press Enclave Road, Saket, New Delhi', 28.5276, 77.2146, ARRAY['Cardiology','Gastroenterology','ENT','Ophthalmology'], '{"mon":"08:30-18:00","tue":"08:30-18:00","wed":"08:30-18:00","thu":"08:30-18:00","fri":"08:30-18:00","sat":"09:00-15:00"}', 'Delhi', 'South Delhi', 'India', '110017', '+911126515050', 'saket.max@example.com', 'Hospital', 'Saket'),
('Sir Ganga Ram Hospital', 'Rajinder Nagar, New Delhi', 28.6409, 77.1894, ARRAY['General Medicine','Pulmonology','Endocrinology','Urology'], '{"mon":"09:00-17:00","tue":"09:00-17:00","wed":"09:00-17:00","thu":"09:00-17:00","fri":"09:00-17:00","sat":"09:00-13:00"}', 'Delhi', 'Central Delhi', 'India', '110060', '+911142257000', 'gangaram@example.com', 'Hospital', 'Rajinder Nagar'),
('BLK-Max Super Speciality Hospital', 'Pusa Road, Rajinder Nagar, New Delhi', 28.6448, 77.1819, ARRAY['Orthopedic','Neurology','Dental','Psychiatry'], '{"mon":"09:00-18:00","tue":"09:00-18:00","wed":"09:00-18:00","thu":"09:00-18:00","fri":"09:00-18:00","sat":"09:00-14:00"}', 'Delhi', 'Central Delhi', 'India', '110005', '+911130405405', 'blkmax@example.com', 'Hospital', 'Pusa Road'),
('Fortis Escorts Heart Institute', 'Okhla Road, New Friends Colony, New Delhi', 28.5614, 77.2744, ARRAY['Cardiology','Pulmonology','General Medicine'], '{"mon":"09:00-18:00","tue":"09:00-18:00","wed":"09:00-18:00","thu":"09:00-18:00","fri":"09:00-18:00","sat":"09:00-14:00"}', 'Delhi', 'South Delhi', 'India', '110025', '+911147135000', 'fortis.escorts@example.com', 'Hospital', 'Okhla'),
('Aakash Healthcare Super Speciality Hospital', 'Hospital Plot, Road No. 201, Dwarka Sector 3, New Delhi', 28.6084, 77.0447, ARRAY['Pediatrics','Gynecology','Orthopedic','ENT'], '{"mon":"09:00-18:00","tue":"09:00-18:00","wed":"09:00-18:00","thu":"09:00-18:00","fri":"09:00-18:00","sat":"09:00-15:00"}', 'Delhi', 'West Delhi', 'India', '110075', '+911146760000', 'aakash.dwarka@example.com', 'Hospital', 'Dwarka'),
('Lajpat Nagar Family Clinic', 'E-24, Lajpat Nagar II, New Delhi', 28.5689, 77.2430, ARRAY['General Medicine','Dermatology','Dental'], '{"mon":"10:00-20:00","tue":"10:00-20:00","wed":"10:00-20:00","thu":"10:00-20:00","fri":"10:00-20:00","sat":"10:00-16:00"}', 'Delhi', 'South Delhi', 'India', '110024', '+911141000111', 'lajpat.familyclinic@example.com', 'Clinic', 'Lajpat Nagar'),
('Connaught Place Diagnostic & Care', 'Barakhamba Road, Connaught Place, New Delhi', 28.6315, 77.2222, ARRAY['General Medicine','Endocrinology','Ophthalmology'], '{"mon":"08:00-19:00","tue":"08:00-19:00","wed":"08:00-19:00","thu":"08:00-19:00","fri":"08:00-19:00","sat":"08:00-14:00"}', 'Delhi', 'New Delhi', 'India', '110001', '+911143000222', 'cp.care@example.com', 'Diagnostic Center', 'Connaught Place')
ON CONFLICT (name) DO UPDATE SET
  address = EXCLUDED.address,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  departments = EXCLUDED.departments,
  timings = EXCLUDED.timings,
  city = EXCLUDED.city,
  district = EXCLUDED.district,
  state = EXCLUDED.state,
  pincode = EXCLUDED.pincode,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  hospital_type = EXCLUDED.hospital_type,
  area = EXCLUDED.area,
  updated_at = now();
