INSERT INTO public.specializations (name, description) VALUES
('General Physician', 'Primary care provider managing overall health, common illnesses, and preventive care.'),
('Cardiologist', 'Specialist in diagnosing and treating diseases of the heart and blood vessels.'),
('Dermatologist', 'Specialist in skin, hair, nail disorders, and cosmetic concerns.'),
('Pediatrician', 'Primary care medical practitioner specializing in children and their diseases.'),
('Orthopedic', 'Specialist in skeletal system, joints, muscles, ligaments, and tendons.'),
('ENT Specialist', 'Otolaryngologist specializing in ear, nose, and throat disorders.'),
('Gynecologist', 'Specialist in the female reproductive system and pregnancy care.'),
('Neurologist', 'Specialist in disorders of the nervous system, brain, and spinal cord.'),
('Psychiatrist', 'Medical doctor specializing in mental health, psychiatric disorders, and therapy.'),
('Dentist', 'Specialist in oral health, teeth care, gum treatments, and dental hygiene.'),
('Ophthalmologist', 'Specialist in eye diseases, vision correction, and ophthalmic surgeries.'),
('Gastroenterologist', 'Specialist in digestive system disorders including stomach, liver, and intestines.'),
('Pulmonologist', 'Specialist in respiratory system and lung-related conditions.'),
('Urologist', 'Specialist in urinary tract infections, kidneys, and male reproductive system.'),
('Endocrinologist', 'Specialist in hormone-related conditions and endocrine glands (e.g., diabetes, thyroid).'),
('Oncologist', 'Specialist in diagnosing and treating cancer using medical therapies and coordinated care.'),
('Nephrologist', 'Specialist in kidney disease, renal function, dialysis, and related conditions.')
ON CONFLICT (name) DO UPDATE 
SET description = EXCLUDED.description;
