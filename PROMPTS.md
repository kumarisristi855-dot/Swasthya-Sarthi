# PROMPTS.md — Step-by-Step Build Prompts for Antigravity

Feed these to Antigravity **in order, one at a time**. Wait for each phase to
be working before moving to the next. Each prompt assumes Antigravity has
already read `AGENTS.md` and `DESIGN.md` in the repo root.

---

## Phase 0 — Project Scaffolding

```
Goal: Set up the base project structure for a healthcare platform web app.

Context: Read AGENTS.md and DESIGN.md in the repo root before starting —
follow the tech stack and folder structure defined there exactly.

Scope:
- Initialize a frontend (React + Vite + Tailwind) in /frontend
- Initialize a backend (Node.js + Express) in /backend
- Set up the folder structure exactly as described in AGENTS.md
- Add a Supabase client setup in frontend/src/lib/supabase.js and
  backend/src/lib/supabase.js, reading keys from .env (do not hardcode)
- Add .env.example files listing required env vars (no real values)
- Add a basic health-check route (GET /api/health) on the backend
- Add a placeholder landing page on the frontend with three buttons:
  "Login as Patient", "Login as Doctor", "Hospital Admin Login" (no
  functionality yet, just routes to empty placeholder pages)

Files to create/update:
- /frontend (scaffolded project)
- /backend (scaffolded project)
- /frontend/src/lib/supabase.js, /backend/src/lib/supabase.js
- .env.example (both frontend and backend)
- README.md with setup instructions

Testing:
- `npm run dev` in frontend starts without errors and shows the landing page
- `npm start` in backend starts and GET /api/health returns 200

Do not add authentication logic yet — that's the next phase. Do not break
anything in later phases by hardcoding assumptions that contradict AGENTS.md.
```

---

## Phase 1 — Database Schema Setup

```
Goal: Create the full database schema in Supabase as defined in DESIGN.md.

Context: Read DESIGN.md section 2 (Database Schema) carefully — implement
it exactly, including constraints (UNIQUE, CHECK) and foreign keys.

Scope:
- Create SQL migration files in /database/migrations for every table listed
  in DESIGN.md section 2, in an order that respects foreign key dependencies
- Seed /database/seed with an initial specializations list (at least 15
  common specializations: General Physician, Cardiologist, Dermatologist,
  Pediatrician, Orthopedic, ENT Specialist, Gynecologist, Neurologist,
  Psychiatrist, Dentist, Ophthalmologist, Gastroenterologist, Pulmonologist,
  Urologist, Endocrinologist)
- Seed 2-3 sample hospitals with lat/lng for testing geolocation later
- Enable Row Level Security on all tables (policies can be minimal/permissive
  for now — we will tighten them in the auth phase)

Files to create:
- /database/migrations/*.sql (one file per table or logical group)
- /database/seed/specializations.sql
- /database/seed/hospitals.sql

Testing:
- Run migrations against a fresh Supabase project and confirm all tables
  exist with correct columns and constraints
- Confirm the UNIQUE (doctor_id, appointment_time) constraint exists on
  appointments (test by attempting a duplicate insert manually)
- Confirm seed data loads without errors

Do not modify the schema structure from DESIGN.md without flagging it back
to me first — this schema is the foundation every later phase depends on.
```

---

## Phase 2 — Role-Based Authentication

```
Goal: Implement separate login/signup flows for Patient, Doctor, and
Hospital Admin, as described in DESIGN.md section 4.

Scope:
- Frontend: build /login/patient, /login/doctor, /login/admin as separate
  routes/pages (can share a common form component internally, but must be
  visually and functionally distinct entry points)
- Frontend: build /signup/patient and /signup/doctor (admin accounts are
  created manually, no public signup)
- Doctor signup form includes: name, email, password, specialization
  (dropdown from specializations table), license number
- Patient signup form includes: name, email, password, phone, date of birth
- Backend: implement /api/auth/patient/signup, /api/auth/patient/login,
  /api/auth/doctor/signup, /api/auth/doctor/login, /api/auth/admin/login
- On signup, create the row in `users` (with correct role) AND the
  corresponding profile table row (patient_profiles or doctor_profiles).
  Doctor profiles are created with status='pending'.
- On login, verify the role-appropriate profile table has a matching row.
  Reject with a clear error if not (e.g. a patient trying /login/doctor).
- On doctor login, if status='pending', redirect to a
  "waiting for hospital approval" page instead of the dashboard.
- Implement route guards on the frontend: /patient/*, /doctor/*, /admin/*
  routes check the logged-in user's role and redirect if mismatched.
- Implement backend middleware that extracts the authenticated user and
  role from the Supabase session and attaches it to req.user for use in
  all future routes.

Files to update/create:
- frontend/src/modules/auth/* (login pages, signup pages, route guards)
- backend/src/routes/auth.js
- backend/src/middleware/requireRole.js

Testing:
- Sign up as a patient, log in via /login/patient — succeeds, redirects to
  /patient/dashboard (placeholder is fine for now)
- Sign up as a doctor, log in via /login/doctor — succeeds but shows
  "waiting for approval" screen since status is 'pending'
- Try logging into /login/doctor with a patient's credentials — fails with
  a clear error
- Try navigating directly to /doctor/dashboard as a logged-in patient —
  redirected away, not shown the page

Do not remove the placeholder landing page buttons from Phase 0 — wire them
to these new login routes instead of replacing them.
```

---

## Phase 3 — Hospital Admin: Doctor Onboarding

```
Goal: Let hospital admins invite doctors and approve pending doctor
signups, activating their doctor_profiles.status.

Scope:
- Backend: POST /api/admin/hospitals/:id/doctors/invite — creates a row in
  doctor_hospital_affiliations with status='invited', sends an email
  (stub the email send for now if Twilio/email isn't wired yet — log to
  console, we'll connect it fully in the notifications phase)
- Backend: GET /api/admin/hospitals/:id/doctors/pending — lists doctors
  who signed up and selected (or requested) this hospital, awaiting approval
- Backend: PATCH /api/admin/hospitals/:id/doctors/:doctorId/approve —
  sets doctor_profiles.status='active' and
  doctor_hospital_affiliations.status='accepted'
- Backend: PATCH .../reject — sets status='rejected'
- Frontend: admin dashboard page listing pending doctors with
  Approve/Reject buttons, and a simple "invite doctor by email" form
- Ensure only the admin whose hospitals.admin_id matches the logged-in user
  can approve/reject doctors for that hospital (authorization check)

Files to create/update:
- backend/src/routes/admin.js
- frontend/src/modules/admin/doctor-management/*

Testing:
- As admin, view pending doctors for your hospital, approve one — confirm
  doctor_profiles.status flips to 'active' and that doctor can now log in
  successfully to the full dashboard (not the waiting screen)
- Confirm an admin cannot approve/reject doctors belonging to a different
  hospital (test with two hospital admin accounts)

Do not break the Phase 2 login flow — doctors with status still 'pending'
must continue to see the waiting screen until explicitly approved here.
```

---

## Phase 4 — Patient Portal: Geolocation Discovery

```
Goal: Show nearby hospitals to a logged-in patient based on their location.

Scope:
- Frontend: on /patient/dashboard, request browser geolocation permission;
  on grant, fetch and display nearby hospitals on a map (react-leaflet)
  and as a list, sorted by distance
- Backend: GET /api/hospitals/nearby?lat=&lng=&radius= — returns hospitals
  within radius (use Haversine formula in SQL or application code; no need
  for PostGIS yet unless you want to set it up)
- Each hospital list item is clickable and navigates to a hospital profile
  page showing address, departments, timings, and affiliated doctors
  (query via doctor_hospital_affiliations where status='accepted')
- Handle geolocation permission denial gracefully (fallback: let patient
  manually search/enter a city or pincode)

Files to create/update:
- frontend/src/modules/patient/discovery/*
- backend/src/routes/hospitals.js
- backend/src/services/geolocation/*

Testing:
- Grant location permission in browser, confirm seeded sample hospitals
  appear sorted by distance
- Deny permission, confirm fallback manual search UI appears instead
- Click a hospital, confirm profile page shows correct affiliated doctors
  (only status='accepted' ones, not pending/invited)

Do not break the auth/route-guard logic from Phase 2.
```

---

## Phase 5 — AI Symptom Search with Urgency Triage

```
Goal: Implement the AI symptom-to-specialization matcher as designed in
DESIGN.md section 5.

Scope:
- Backend: POST /api/symptom-search — accepts { patientId, symptomText }
- Fetch the full specializations list from DB and inject into the Groq
  prompt as the allowed set of return values
- Prompt Groq to return strict JSON only:
  { "specialization": string, "urgency": "routine"|"same_day"|"emergency",
    "confidence": number }
- Validate the returned specialization exists in the specializations table.
  If not, or if it's "unclear", return a response asking the patient to
  clarify their symptoms rather than guessing
- If urgency is "emergency", do NOT return a doctor list — return a flag
  the frontend uses to show an emergency-redirect screen instead
- If urgency is "routine" or "same_day", query nearby doctors matching the
  specialization (join doctor_profiles + doctor_hospital_affiliations +
  hospitals, sorted by distance from patient's location + rating)
- Log every query and result into symptom_queries
- Frontend: build the natural-language search bar on the patient dashboard,
  wired to this endpoint, showing either the doctor results, the emergency
  screen, or a clarification prompt depending on the response

Files to create/update:
- backend/src/services/ai/symptomMatcher.js
- backend/src/routes/symptomSearch.js
- frontend/src/modules/patient/symptom-search/*

Testing:
- Enter a clearly routine symptom (e.g. "mild skin rash for two days") —
  confirm it maps to Dermatologist and shows nearby doctor results
- Enter an emergency-sounding symptom (e.g. "severe chest pain and
  difficulty breathing") — confirm the emergency-redirect screen shows
  instead of a booking flow
- Enter something vague ("I don't feel good") — confirm a clarification
  prompt is shown instead of a random specialization guess
- Confirm each query is logged in symptom_queries with the correct fields

Do not let the LLM's output bypass validation against the specializations
table under any circumstance — this is a hard rule from AGENTS.md.
```

---

## Phase 6 — Appointment Booking with Slot-Locking

```
Goal: Let patients book appointments with doctors, using the slot-locking
constraint from DESIGN.md section 6.

Scope:
- Backend: GET /api/doctors/:id/available-slots?date= — computes available
  slots by taking doctor_availability for that day of week, subtracting
  already-booked appointments and doctor_time_off ranges
- Backend: POST /api/appointments — attempts to insert a new appointment
  inside a transaction; if it fails due to the UNIQUE(doctor_id,
  appointment_time) constraint, return a clear "slot just taken" error
- Frontend: on a doctor's profile page, show available slots for the next
  7 days; patient selects a slot and confirms booking
- On booking success, show confirmation and (stub for now) trigger a
  notification — real notification wiring happens in Phase 8
- Frontend: patient appointment history page listing past/upcoming
  appointments with status

Files to create/update:
- backend/src/routes/appointments.js
- backend/src/services/booking/*
- frontend/src/modules/patient/booking/*
- frontend/src/modules/patient/history/*

Testing:
- Book a slot successfully, confirm it appears in appointment history
- Simulate two near-simultaneous booking attempts for the same slot
  (e.g. two browser tabs) — confirm only one succeeds and the other gets
  a clear "slot just taken" message, not a silent failure or duplicate
- Confirm time-off ranges correctly remove slots from availability

Do not break the symptom-search-to-doctor-list flow from Phase 5 — booking
should be reachable both from symptom search results and from direct
hospital/doctor browsing.
```

---

## Phase 7 — Doctor Portal: Dashboard & Availability Management

```
Goal: Build the doctor's dashboard for managing their queue and schedule.

Scope:
- Frontend: /doctor/dashboard shows today's appointment queue (patient
  name, time, status) and a count of total patients today
- Frontend: availability management page — doctor sets/edits weekly
  recurring slots (day, start time, end time, slot duration) and can add
  one-off time-off blocks
- Backend: GET /api/doctors/:id/appointments/today
- Backend: POST/PATCH /api/doctors/:id/availability
- Backend: POST /api/doctors/:id/time-off
- Ensure a doctor can only view/edit their own schedule and appointments,
  never another doctor's (authorization check using req.user from auth
  middleware)

Files to create/update:
- frontend/src/modules/doctor/dashboard/*
- frontend/src/modules/doctor/availability/*
- backend/src/routes/doctors.js

Testing:
- Log in as a doctor, confirm today's queue shows only that doctor's
  appointments
- Edit weekly availability, confirm changes reflect immediately in the
  patient-facing available-slots endpoint from Phase 6
- Add a time-off block, confirm those slots disappear from patient view

Do not break patient-side booking from Phase 6 — availability changes here
must propagate correctly to what patients see as bookable.
```

---

## Phase 8 — Consultation Notes, Prescriptions & Notifications

```
Goal: Let doctors complete consultations with notes/prescriptions, and
wire up real notifications (Twilio SMS + email) for key events.

Scope:
- Backend: POST /api/appointments/:id/notes — doctor writes notes and
  prescription text, and this also marks the appointment status='completed'
- Frontend: doctor's queue view has a "Start Consultation" action opening
  a simple notes/prescription form for the selected appointment
- Frontend: patient appointment history shows notes/prescription for
  completed appointments
- Backend: implement backend/src/services/notifications/ with functions
  for sendSMS (Twilio) and sendEmail (Resend or similar)
- Wire notification triggers per the table in DESIGN.md section 7:
  booking confirmed, reminder, cancelled, doctor invited, doctor approved
- Log every sent notification into the notifications table

Files to create/update:
- backend/src/routes/appointments.js (extend)
- backend/src/services/notifications/*
- frontend/src/modules/doctor/consultation/*
- frontend/src/modules/patient/history/* (extend to show notes)

Testing:
- Complete a consultation as a doctor, confirm status changes to
  'completed' and notes appear in patient's history
- Confirm a real SMS/email is sent (or correctly logged if using test/sandbox
  credentials) when a booking is confirmed and when cancelled
- Confirm notifications table has a row for each sent notification

Do not break the booking flow from Phase 6 or the availability logic from
Phase 7 — completed appointments should no longer show as available slots
for rebooking at the same time.
```

---

## Phase 9 — Ratings & Reviews

```
Goal: Let patients rate and review doctors after a completed appointment.

Scope:
- Backend: POST /api/appointments/:id/review — only allowed if the
  appointment status is 'completed' and belongs to the requesting patient;
  updates doctor_profiles.rating_avg and rating_count (recalculate on insert)
- Frontend: after a completed appointment in patient history, show a
  "Rate this doctor" prompt if not already reviewed
- Frontend: display rating_avg and rating_count on doctor profile pages
  and in symptom-search / discovery results

Files to create/update:
- backend/src/routes/appointments.js (extend)
- frontend/src/modules/patient/history/* (extend)
- frontend/src/modules/patient/discovery/* (show ratings)

Testing:
- Submit a review for a completed appointment, confirm doctor's rating_avg
  updates correctly
- Attempt to review a non-completed or someone else's appointment — confirm
  it's rejected
- Confirm ratings display correctly across discovery, symptom search
  results, and doctor profile pages

Do not break existing doctor profile or discovery pages — ratings are an
addition to existing displays, not a replacement.
```

---

## Phase 10 — Hospital Admin: Schedule Oversight & Analytics

```
Goal: Give hospital admins full visibility into their hospital's doctors'
schedules and basic performance analytics.

Scope:
- Backend: GET /api/admin/hospitals/:id/schedule — all doctors' upcoming
  appointments and availability for that hospital
- Backend: GET /api/admin/hospitals/:id/analytics — appointments per day
  (last 30 days), no-show rate, per-doctor utilization (booked slots vs
  available slots)
- Frontend: admin dashboard page with a schedule overview table/calendar
  and simple charts for the analytics above (a lightweight charting
  library is fine)
- Ensure all these queries are scoped to hospitals where
  hospitals.admin_id = the logged-in admin's user id

Files to create/update:
- backend/src/routes/admin.js (extend)
- frontend/src/modules/admin/schedule-overview/*
- frontend/src/modules/admin/analytics/*

Testing:
- As admin, confirm schedule overview shows all doctors at your hospital
  correctly, including today's and future appointments
- Confirm analytics numbers match manually-verifiable counts in the DB
  for a small test dataset
- Confirm an admin cannot see another hospital's schedule/analytics by
  manipulating the hospital ID in the request

Do not break the doctor onboarding flow from Phase 3 — this phase only
adds oversight views, it does not change how doctors get approved.
```

---

## Phase 11 — Polish & Deployment Prep

```
Goal: Final pass for consistency, error handling, and deployment readiness.

Scope:
- Audit all backend routes for consistent error response shape
  ({ error: { message, code } }) per AGENTS.md
- Add loading states and empty states across all major frontend pages
- Add basic input validation on all forms (signup, booking, notes, reviews)
- Review Row Level Security policies in Supabase and tighten them to match
  the authorization rules already enforced in the backend (defense in depth)
- Prepare environment variable documentation for deployment (Vercel for
  frontend, Render for backend — matching your existing EvalAI deployment
  pattern)
- Do a full end-to-end manual test of all three portals

Files to update: across the whole codebase, no new features.

Testing:
- Full manual walkthrough: patient signs up, searches symptoms, books
  appointment, receives notification, doctor completes consultation,
  patient leaves review, admin views updated analytics — all in one pass
  with no errors

Do not add new features in this phase — this is strictly a hardening and
polish pass on everything built in Phases 0–10.
```
