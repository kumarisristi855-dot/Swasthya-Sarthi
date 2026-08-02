# Swasthya Sarthi

Location-aware healthcare discovery and appointment workflows for patients,
doctors, and hospital teams.

[![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite-14b8a6)](https://react.dev/)
[![Backend](https://img.shields.io/badge/backend-Node.js%20%2B%20Express-0f766e)](https://expressjs.com/)
[![Database](https://img.shields.io/badge/database-Supabase-16a34a)](https://supabase.com/)
[![Deployment](https://img.shields.io/badge/deployed%20on-Vercel-111827)](https://vercel.com/)

## Live Website

[Open Swasthya Sarthi](https://frontend-six-coral-82.vercel.app)

## Overview

Swasthya Sarthi is an India-focused healthcare platform that helps users find
nearby hospitals, view verified doctors, check facility details, and book
appointments through role-specific portals. The project combines public
healthcare directory data, map-based discovery, multilingual UI support, and
secure role-based workflows for patients, doctors, and hospital administrators.

The platform is designed around a simple principle: users should be able to
review care options before creating an account, then sign in only when they are
ready to book or manage healthcare activity.

## Key Features

- Patient portal with nearby facility search, hospital directory browsing,
  doctor discovery, appointment booking, and appointment history.
- Doctor portal for daily appointments, weekly availability, blocked leave,
  profile data, and consultation workflow.
- Hospital admin portal for hospital-linked staff access, doctor rosters,
  appointment oversight, and operational management.
- Location-aware results using browser geolocation, typed locations, map pins,
  and distance sorting.
- Hospital profile pages with facility details, operating hours, Google rating
  display when available, patient rating support, directions, and linked doctors.
- Doctor profile pages inside the website, avoiding unnecessary third-party
  profile redirects.
- Public healthcare map powered by OpenStreetMap and Leaflet.
- AI symptom guidance that maps user-described symptoms to a fixed medical
  specialization list with urgency hints.
- Multilingual interface support for English, Hindi, Bengali, Tamil, Telugu,
  and Kannada.
- Source-aware public directory listings for hospitals, clinics, government
  facilities, and verified doctors.
- Public health notice and outbreak-alert surfaces where active alerts can be
  shown near the user's selected location.

## Tech Stack

- Frontend: React, Vite, Tailwind CSS, React Router, i18next
- Backend: Node.js, Express
- Database and auth: Supabase PostgreSQL, Supabase Auth, Row Level Security
- Maps: React Leaflet, OpenStreetMap, browser Geolocation API
- AI triage support: Groq API with fixed-specialization validation
- Notifications: Twilio and Resend-ready backend services
- Hosting: Vercel

## Repository Structure

```text
healthcare website/
├── frontend/
│   ├── src/
│   │   ├── modules/
│   │   ├── shared/
│   │   └── lib/
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   └── middleware/
│   └── package.json
├── database/
│   ├── migrations/
│   └── seed/
├── AGENTS.md
├── DEPLOYMENT.md
└── README.md
```

## Local Development

Install and run the frontend:

```bash
cd frontend
npm install
npm run dev
```

Install and run the backend:

```bash
cd backend
npm install
npm run dev
```

Use the placeholder environment files as templates:

- `frontend/.env.example`
- `backend/.env.example`

Keep real values only in local `.env` files or private hosting-provider
environment settings.

## Useful Commands

Frontend:

```bash
cd frontend
npm run lint
npm run build
npm run preview
```

Backend:

```bash
cd backend
npm start
npm test
```

Directory maintenance and audits:

```bash
cd backend
npm run audit:directory
npm run audit:directory:all-states
npm run repair:hospitals
```

Commands ending in `:apply` change data. Review dry-run output first.

## Database Setup

Database schema and data scripts live in:

- `database/migrations/`
- `database/seed/`

Apply migrations in numeric order. Important migrations include the core schema,
role policies, public directory tables, hospital ratings, appointment priority,
and canonical directory governance.

For hosted environments, apply database migrations through the Supabase SQL
editor or Supabase CLI using private project credentials.

## Environment Configuration

The project expects environment variables for:

- Supabase project URL and public anon key
- Supabase service role key for trusted backend-only tasks
- Frontend API base URL
- Allowed frontend origins for CORS
- Maps and Places integration keys, when enabled
- Groq API key for symptom classification
- Twilio and email provider credentials, when notifications are enabled

Do not commit real keys, tokens, passwords, project secrets, `.env` files, or
private deployment metadata.

## Deployment Notes

The frontend and backend are deployed as separate services. Configure production
environment variables in the hosting dashboard, then deploy from the connected
GitHub repository.

The public README intentionally exposes only the user-facing website link.
Backend service URLs, database identifiers, API keys, and provider secrets
should stay private.

See `DEPLOYMENT.md` for the repository's private-deployment policy.

## Security Model

- Patient, doctor, and hospital roles are enforced server-side.
- Supabase Row Level Security protects database access.
- Booking flows are designed around slot-locking to prevent double-booking.
- AI symptom output is validated against the fixed specialization list.
- Public directory records preserve source and verification context.
- Production secrets must be configured outside the repository.

## Medical Safety Notice

Swasthya Sarthi is a healthcare discovery and workflow platform. It does not
replace professional medical advice, diagnosis, emergency care, or direct
confirmation from a hospital or doctor. Users should contact emergency services
or a qualified medical professional for urgent symptoms.

## Contributing

Before changing the project:

1. Read `AGENTS.md` for repository rules.
2. Keep patient, doctor, and hospital workflows separate.
3. Avoid committing secrets or generated local deployment files.
4. Run the relevant lint, build, and backend test commands before opening a
   pull request.

## License

This repository currently uses the license declared in `backend/package.json`.
Add a top-level `LICENSE` file before redistributing or reusing the project
outside its intended owner.
