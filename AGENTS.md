# AGENTS.md — Healthcare Platform

This file defines how any AI coding agent (Antigravity, Claude Code, Gemini, etc.)
should work on this repository. Read this fully before making any changes.

## Project Summary

A localized healthcare platform connecting **Patients**, **Doctors**, and
**Hospital Admins**. Core features: geolocation-based facility discovery,
AI-driven symptom-to-specialist matching with urgency triage, appointment
booking with slot-locking, and role-specific portals.

## Tech Stack (do not deviate without explicit instruction)

- **Frontend:** React (Vite), Tailwind CSS, React Router
- **Backend:** Node.js + Express
- **Database + Auth:** Supabase (PostgreSQL + Supabase Auth + Row Level Security)
- **AI:** Groq API (LLM used strictly for classification — symptom text →
  specialization from a fixed list — not open generation)
- **Notifications:** Twilio (SMS) + a transactional email provider (Resend or
  similar free-tier option)
- **Maps/Geolocation:** react-leaflet + browser Geolocation API +
  PostGIS/Haversine for distance queries

## Repository Structure

```
healthcare-platform/
├── frontend/src/modules/{auth,patient,doctor,admin}/
├── frontend/src/shared/        (shared UI components, hooks)
├── frontend/src/lib/           (supabase client, api client, geolocation utils)
├── backend/src/routes/
├── backend/src/services/{ai,booking,notifications,geolocation}/
├── backend/src/middleware/     (role-based auth guards)
├── backend/src/models/
└── database/{migrations,seed}/
```

## Core Rules

1. **Do not break existing functionality.** Every prompt in PROMPTS.md builds
   on the previous one. Before making changes, check what already exists and
   preserve it unless the prompt explicitly says to change it.
2. **Role separation is a security boundary, not just a UI choice.** Every
   backend route that touches patient, doctor, or admin data must verify the
   authenticated user's role server-side (via `users.role` + the relevant
   profile table), never trust a role claimed by the frontend alone.
3. **The specialization list is fixed and authoritative.** The AI symptom
   matcher must only return values from the `specializations` table — never
   let the LLM invent new specialization names. Always validate the LLM
   output against the table before using it.
4. **Slot-locking is mandatory for bookings.** Use a DB-level unique
   constraint on `(doctor_id, appointment_time)` inside a transaction. Never
   rely on frontend-only checks to prevent double-booking.
5. **No secrets in code.** All API keys (Supabase, Groq, Twilio) go in
   `.env` files, never hardcoded, never committed.
6. **Consistent error handling.** All backend routes return errors in the
   shape `{ error: { message, code } }`. All frontend API calls handle this
   shape and show a user-facing message, not a raw stack trace.
7. **Match existing code style.** Before adding new files, look at how
   neighboring modules are structured (naming, folder layout, component
   patterns) and follow the same convention rather than introducing a new one.
8. **Every feature phase ends with a working, testable state.** Don't leave
   the app in a broken/half-wired state between prompts.

## Testing Expectations

After each phase, the agent should be able to confirm (manually or with a
quick script) that:
- The app still builds and runs (`npm run dev` for frontend, `npm start` for
  backend) with no console errors.
- Previously working flows (login, navigation, prior features) still work.
- The new feature works for its intended role and is blocked for other roles.

## Reference Documents

- `DESIGN.md` — architecture, database schema, API contracts, AI flow design.
- `PROMPTS.md` — the ordered list of build prompts. Follow them in sequence;
  do not skip ahead or combine phases unless told to.
