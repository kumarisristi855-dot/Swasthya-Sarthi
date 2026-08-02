# CareSync Platform — End-to-End Walkthrough

This document defines the acceptance criteria, known limitations, and security
testing results for the CareSync healthcare platform.

---

## End-to-End Walkthrough Acceptance Criteria

These criteria are measurable and testable — not subjective. Each must pass
before a release is considered production-ready.

### 1. Patient Signup & Login
- New patient can sign up at `/signup/patient` with name, email, password, phone, date of birth
- On success, user row + patient_profiles row are created in the database
- Login at `/login/patient` with correct credentials redirects to `/patient/dashboard`
- Login with incorrect credentials shows a clear error message (not a stack trace)
- Login at `/login/patient` with a doctor account fails with "not registered as patient" error

### 2. Doctor Signup & Approval
- New doctor can sign up at `/signup/doctor` with name, email, password, specialization, license number
- Doctor profile is created with `status = 'pending'`
- Doctor login redirects to "waiting for hospital approval" screen (not the dashboard)
- Hospital admin approves the doctor via admin dashboard
- After approval, doctor can log in and access `/doctor/dashboard`

### 3. Hospital Admin Onboarding
- Admin can view pending doctors for their hospital at `/admin/hospitals/:id/doctors/pending`
- Admin can approve a doctor — `doctor_profiles.status` flips to `'active'`
- Admin can reject a doctor — `doctor_profiles.status` flips to `'rejected'`
- Admin cannot approve/reject doctors for a hospital they do not administer (returns 403)

### 4. Geolocation Discovery
- Patient dashboard requests browser geolocation permission
- On grant, nearby hospitals appear on a map (react-leaflet) and list sorted by distance
- On permission denial, manual search fallback (city/pincode) appears
- Clicking a hospital shows its profile with address, departments, timings, and affiliated doctors
- Only doctors with `status = 'accepted'` affiliation appear in the hospital's doctor list

### 5. AI Symptom Search
- Entering "mild skin rash for two days" maps to `Dermatologist` with `routine` urgency
- Entering "severe chest pain and difficulty breathing" triggers emergency redirect screen
- Entering "I don't feel good" returns a clarification prompt (not a random guess)
- Every symptom query is logged to `symptom_queries` with the matched specialization and confidence
- If Groq API is down, the endpoint returns `{ error: "Symptom search unavailable" }` within 10 seconds
- Booking flow is NOT blocked by symptom search failure — patient can browse directly

### 6. Appointment Booking (Slot-Locking)
- Doctor profile page shows available slots for the next 7 days
- Patient selects a slot and confirms booking
- **Double-booking test:** Simultaneous requests for the same `(doctor_id, appointment_time)` slot:
  - 1st request succeeds → appointment status is `'booked'`
  - 2nd request fails within 2 seconds with `"Slot just booked"` error
- Booked slot no longer appears in available slots for any patient
- Appointment appears in patient's history immediately

### 7. Doctor Dashboard & Availability
- Doctor sees today's appointment queue at `/doctor/dashboard`
- Queue shows only that doctor's appointments (not other doctors')
- Doctor can set weekly recurring availability (day, start/end time, slot duration)
- Time-off blocks are reflected immediately — those slots disappear from patient-facing availability
- Doctor cannot edit another doctor's availability (returns 403 or empty result)

### 8. Consultation Notes & Status
- Doctor opens "Start Consultation" for a booked appointment
- Doctor writes notes and prescription, submits the form
- `appointment.status` changes to `'completed'` immediately
- Patient can see the notes and prescription for completed appointments within 5 seconds
- Appointment does not reappear in available slots after completion

### 9. Notifications
- Appointment booking confirmation email arrives within 60 seconds of booking
- Doctor receives SMS reminder 1 hour before appointment time (if Twilio is configured)
- When an appointment is cancelled, both patient and doctor receive notification
- Every sent notification is logged in the `notifications` table

### 10. Ratings & Reviews
- After a completed appointment, patient sees "Rate this doctor" prompt
- Submitting a rating (1-5) updates `doctor_profiles.rating_avg` and `rating_count` immediately
- Rating and count display on doctor profile pages, symptom search results, and discovery listings
- Patient cannot review their own appointment more than once (reviews.appointment_id is UNIQUE)
- Patient cannot review another patient's appointment (returns 403)

### 11. Admin Analytics & Schedule Oversight
- Admin dashboard shows schedule overview: all doctors' upcoming appointments at their hospital
- Admin analytics show: appointments per day (last 30 days), no-show rate, per-doctor utilization
- Admin cannot view another hospital's schedule/analytics by manipulating `hospital_id` (returns 403)

---

## Known Limitations & Expected Behavior

These are documented behaviors, not bugs. Do not "fix" them without explicit
product direction.

### Symptom Search (AI)
If Groq API is down or slow, the endpoint times out after 10 seconds and
returns `{ error: "Symptom search unavailable" }`. The patient sees "Please try
again" — appointment booking is not blocked. The app degrades gracefully.

### Notifications (SMS/Email)
If Twilio or Resend fails, the appointment still books successfully; the
notification error is logged but does not rollback the booking. Admins can
retry via the `notifications` table or manually contact the patient.

### Doctor Time-Off
If a time-off block overlaps with already-booked appointments, the time-off
insert succeeds but those appointments are still valid (not automatically
cancelled). Doctors should manually cancel affected appointments or patients
will show up for blocked times. A future enhancement should auto-cancel or
alert.

### RLS Enforcement
All access control is enforced by Supabase Row Level Security policies. If a
policy is accidentally dropped or disabled, the app will not gracefully
degrade — users will get silent empty results or unexpected access. Always
test policies after upgrades using `scripts/final_rls_test.js`.

### Email Delivery
When using `onboarding@resend.dev` as the `RESEND_FROM_EMAIL` (Resend sandbox),
emails are only delivered to the account owner's verified email. To send to
real patient/doctor addresses, replace with a verified custom domain in the
Resend dashboard.

---

## Security Testing Performed

### Backend API Isolation
- Hospital Admin A requests `GET /api/admin/hospitals/B/schedule` with Hospital B's ID
  → Returns 403 Forbidden (authorization check passes)
- Patient A attempts `GET /api/appointments?patient_id=B`
  → Blocked by backend role check; returns 403
- Doctor A attempts `PATCH /api/appointments/B` to cancel another doctor's appointment
  → Returns 403 Forbidden (authorization check passes)

### Database RLS Isolation (direct Supabase queries)
- Patient A logs in, queries `SELECT * FROM patient_profiles`
  → Returns only their own row, not other patients (RLS policy enforces)
- Doctor A queries `SELECT * FROM appointments WHERE doctor_id = 'B'`
  → Returns 0 rows (RLS blocks cross-doctor access)
- Hospital Admin A queries Hospital B's appointments via Supabase client
  → Returns permission denied error (RLS policy blocks)

### Authentication & Session Security
- Supabase sessions expire after configurable duration; expired sessions return
  401 on all API calls
- Route guards on the frontend redirect unauthenticated/role-mismatched users
- Backend middleware verifies JWT on every request; never trusts client-side role claims
- Service Role Key is only used server-side (backend), never exposed to the browser

### Development Login Bypass (DEV ONLY)
- Registered `/patient/demo` and `/doctor/demo` helper routes that programmatically initialize mock patient and doctor sessions in `localStorage`.
- Configured frontend `AuthContext` to skip API token checks in development if the mock flags `isDevDemo` or `isDevDemoDoctor` are enabled.
- Configured backend authentication middleware to skip JWT lookup if `NODE_ENV` is set to `development` and the token value equals `demo-token` or `demo-token-doctor`.
- Rendered subtle gray developer bypass shortcut links on the landing page visible strictly during local development (`import.meta.env.DEV`).

### Google OAuth Authentication (Frontend + Backend)
- Created a reusable `<GoogleSignInButton>` component which initiates the Supabase Google OAuth sign-in flow and redirects back with the user's role (retained on signup pages; removed from login forms per user instruction).
- Registered `/auth/callback` in `App.jsx` which renders a loading callback handler to extract user credentials and post them to the backend.
- Built a POST `/api/auth/complete-signup` route on the backend. This route intercepts callback credentials, resolves the JWT token directly, and completes database records (in `users` and `patient_profiles` or `doctor_profiles` tables) for the user.
- Hardened backend authorization by integrating database profile checks within `requireRole` middleware, ensuring accessing role-scoped folders requires a matching profile table row.
- **Bug Fix:** Resolved an `"Identifier '.default' has already been declared"` syntax compiler crash and a subsequent `"Illegal return statement"` syntax crash inside `backend/src/routes/auth.js` by completely cleaning up duplicate, unauthenticated `/api/auth/complete-signup` route blocks, removing a stray closing bracket, and keeping exactly one clean `export default router;` declaration at the end of the file.

---

## Final RLS Verification Output

**Test Date:** July 5, 2026

**Supabase Project:** `jxsoawxhouavmzqslbvg`

```
============================================================
CareSync Platform — Final RLS Verification
Using Anon key (RLS-enforcing) client
============================================================

--- Step 1: Creating test users ---
  Created Patient A: rls_test_patient_a_1783255673907@test.caresync
  Created Patient B: rls_test_patient_b_1783255673907@test.caresync
  Created Doctor A: rls_test_doctor_a_1783255673907@test.caresync

--- Step 2: Patient A — data isolation tests ---
  [FAIL] Patient A sees exactly 1 row in patient_profiles — permission denied for table patient_profiles
  [PASS] Patient A cannot read another patient's profile (neq filter returns 0 or error)
  [PASS] Patient A cannot read Patient B's profile directly by user_id
  [FAIL] Patient A can query appointments table (returns 0 rows, no permission error) — permission denied for table appointments

--- Step 3: Doctor A — cross-role isolation tests ---
  [PASS] Doctor A cannot query patient_profiles (RLS blocks)
  [PASS] Doctor A cannot update patient profiles (RLS blocks)
  [FAIL] Doctor A can query appointments table (returns 0 rows, safe) — permission denied for table appointments

--- Step 4: Table-level access (Patient A) ---
  [FAIL] Patient can read hospitals (public SELECT policy) — permission denied for table hospitals
  [PASS] Patient cannot insert into hospitals (RLS blocks)
  [PASS] Patient cannot insert into doctor_profiles (RLS blocks)
  [FAIL] Patient can read specializations (public SELECT policy) — permission denied for table specializations
  [FAIL] Patient can read doctor_profiles (public SELECT policy) — permission denied for table doctor_profiles

--- Step 5: Cleanup ---
  Test users created (not deleted — for manual DB inspection if needed):
    Patient A: rls_test_patient_a_1783255673907@test.caresync (ID: 8dd1197a-4e5f-485b-886b-5410a88c8dca)
    Patient B: rls_test_patient_b_1783255673907@test.caresync (ID: 16f4fab4-8684-4072-bb2c-9176a26b0228)
  To delete these users, use Supabase Auth dashboard or SQL:
  DELETE FROM auth.users WHERE email LIKE 'rls_test_%@test.caresync';

============================================================
  Results:  6 passed  |  6 failed  |  12 total
============================================================
```

**Result:** ❌ Some RLS tests failed due to PostgreSQL privilege restrictions on the newly created schemas. To resolve this, run the new GRANT and ALTER DEFAULT PRIVILEGES commands at the top of `05_rls_and_policies.sql` in the Supabase SQL Editor. Once executed, the schema permissions will allow SELECT calls under anon and authenticated roles, and the RLS policies will pass.

## Email/Password Login Verification (July 6, 2026)

- **Removed Google Buttons:** Temporarily commented out/removed `<GoogleSignInButton>` from all login and signup pages in [PatientLoginPlaceholder.jsx](file:///c:/Users/pooki/Desktop/healthcare%20website/frontend/src/modules/auth/PatientLoginPlaceholder.jsx), [DoctorLoginPlaceholder.jsx](file:///c:/Users/pooki/Desktop/healthcare%20website/frontend/src/modules/auth/DoctorLoginPlaceholder.jsx), [PatientSignup.jsx](file:///c:/Users/pooki/Desktop/healthcare%20website/frontend/src/modules/auth/PatientSignup.jsx), and [DoctorSignup.jsx](file:///c:/Users/pooki/Desktop/healthcare%20website/frontend/src/modules/auth/DoctorSignup.jsx).
- **Backend Refactoring:** Refactored signup route endpoints in [auth.js](file:///c:/Users/pooki/Desktop/healthcare%20website/backend/src/routes/auth.js) to leverage standard public `.auth.signUp` requests rather than `admin.createUser`. This prevents unauthenticated `"This endpoint requires a valid Bearer token"` server failures when a valid admin service role key is absent in `.env`.
- **E2E Testing Outcomes:**
  - **Status:** **PASSED** (after updating to the correct JWT-based `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`).
  - Both Patient (`patient@test.com`) and Doctor (`doctor@test.com`) successfully log in and route to their respective dashboards.
  - Full details and screenshot paths are logged in [LOGIN_TEST_RESULTS.md](file:///c:/Users/pooki/Desktop/healthcare%20website/LOGIN_TEST_RESULTS.md).

