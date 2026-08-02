-- Grant schema permissions to standard Supabase API roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specializations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_hospital_affiliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.symptom_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 1. Users Table Policies
CREATE POLICY users_select ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY users_write ON public.users FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 2. Specializations Table Policies
CREATE POLICY spec_select ON public.specializations FOR SELECT TO public USING (true);
CREATE POLICY spec_write ON public.specializations FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- 3. Hospitals Table Policies
CREATE POLICY hosp_select ON public.hospitals FOR SELECT TO public USING (true);
CREATE POLICY hosp_write ON public.hospitals FOR ALL TO authenticated USING (admin_id = auth.uid()) WITH CHECK (admin_id = auth.uid());

-- 4. Doctor Profiles Table Policies
CREATE POLICY doc_profile_select ON public.doctor_profiles FOR SELECT TO public USING (true);
CREATE POLICY doc_profile_write ON public.doctor_profiles FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 5. Patient Profiles Table Policies
CREATE POLICY pat_profile_select ON public.patient_profiles FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.appointments a WHERE a.patient_id = user_id AND a.doctor_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.appointments a JOIN public.hospitals h ON a.hospital_id = h.id WHERE a.patient_id = user_id AND h.admin_id = auth.uid())
);
CREATE POLICY pat_profile_write ON public.patient_profiles FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 6. Doctor Hospital Affiliations Table Policies
CREATE POLICY aff_doctor ON public.doctor_hospital_affiliations FOR ALL TO authenticated USING (doctor_id = auth.uid());
CREATE POLICY aff_admin ON public.doctor_hospital_affiliations FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.hospitals h WHERE h.id = hospital_id AND h.admin_id = auth.uid()));

-- 7. Doctor Availability Table Policies
CREATE POLICY avail_select ON public.doctor_availability FOR SELECT TO public USING (true);
CREATE POLICY avail_write ON public.doctor_availability FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());

-- 8. Doctor Time Off Table Policies
CREATE POLICY time_off_select ON public.doctor_time_off FOR SELECT TO public USING (true);
CREATE POLICY time_off_write ON public.doctor_time_off FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());

-- 9. Appointments Table Policies
CREATE POLICY app_patient ON public.appointments FOR ALL TO authenticated USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());
CREATE POLICY app_doctor ON public.appointments FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
CREATE POLICY app_admin ON public.appointments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.hospitals h WHERE h.id = hospital_id AND h.admin_id = auth.uid()));

-- 10. Consultation Notes Table Policies
CREATE POLICY notes_patient ON public.consultation_notes FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_id AND a.patient_id = auth.uid()));
CREATE POLICY notes_doctor ON public.consultation_notes FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_id AND a.doctor_id = auth.uid()));

-- 11. Symptom Queries Table Policies
CREATE POLICY sym_query_write ON public.symptom_queries FOR ALL TO authenticated USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());

-- 12. Reviews Table Policies
CREATE POLICY reviews_select ON public.reviews FOR SELECT TO public USING (true);
CREATE POLICY reviews_write ON public.reviews FOR ALL TO authenticated USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());

-- 13. Notifications Table Policies
CREATE POLICY notif_user ON public.notifications FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
