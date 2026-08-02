# Swasthya Sarthi Platform — Deployment Guide

This guide details how to deploy the Swasthya Sarthi platform (React + Vite frontend, Express backend, Supabase DB) to production.

---

## 1. Database Setup (Supabase)

1. Create a new project in [Supabase](https://supabase.com).

### Migration Execution Order
Migration files must be run in this exact order:
1. `01_core_schema.sql` — Base tables: users (with role enum), specializations, hospitals, doctor_profiles, patient_profiles
2. `02_affiliations_and_schedules.sql` — Doctor-hospital affiliations, weekly availability schedules, time-off blocks
3. `03_appointments_and_interactions.sql` — Appointments (with UNIQUE slot-lock constraint), consultation notes, symptom query logs, reviews
4. `04_notifications.sql` — Notification dispatch log (SMS/email audit trail)
5. `05_rls_and_policies.sql` — Row Level Security policies for all tables (defense-in-depth layer)

Go to the SQL Editor in Supabase, copy the contents of the migration files under `database/migrations/` in the order above, and execute each one sequentially to build the database schema and RLS policies.

### Supabase Auth Configuration
After creating the Supabase project and running migrations:
1. Go to **Authentication** → **Providers** and enable "Email" auth.
2. Go to **Authentication** → **URL Configuration** and add your Vercel frontend URL as a redirect URL:
   `https://your-vercel-domain.vercel.app/auth/callback`
3. From **Settings** → **API Keys**, copy your `ANON_KEY` and use it as `VITE_SUPABASE_ANON_KEY` in your Vercel environment variables.
4. From **Settings** → **API Keys**, copy your `SERVICE_ROLE_KEY` and use it as `SUPABASE_SERVICE_ROLE_KEY` in your Render environment variables.

### Seed Data
After migrations and auth are configured, seed reference data:
   - In the SQL Editor, run `database/seed/specializations.sql` to populate the medical specializations list (Cardiologist, Dermatologist, etc.).
   - Run `database/seed/hospitals.sql` to add 2-3 sample hospitals for testing geolocation. In production, hospital admins will create hospitals via the API after their accounts are created.

---

## 2. Backend Deployment (Render)

Deploy the `/backend` folder to [Render](https://render.com) as a Web Service.

### Configuration settings:
* **Environment:** `Node`
* **Build Command:** `npm install`
* **Start Command:** `npm start` or `node src/index.js`

### Environment Variables (`.env`):
Set the following environment variables in Render under the **Environment** settings:

| Variable Name | Description | Example / Value |
| --- | --- | --- |
| `PORT` | Listening port for Express | `5000` |
| `SUPABASE_URL` | Supabase project API endpoint URL | `https://your-project.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key (for bypassing RLS securely on backend queries) | `your-service-role-key-secret` |
| `GROQ_API_KEY` | API Key for symptom matching LLM classification | `gsk_your_groq_api_key_secret` |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID for SMS alerts (Optional sandbox) | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token for SMS alerts (Optional sandbox) | `your_twilio_auth_token_secret` |
| `TWILIO_PHONE_NUMBER` | Twilio purchased phone number for dispatching (E.164 format, e.g. +1XXXXXXXXXX) | `+15551234567` |
| `RESEND_API_KEY` | Resend API key for emailing (Optional sandbox) | `re_xxxxxxxxxxxxxxxxxxxxxxxx` |
| `RESEND_FROM_EMAIL` | Verified sending address for transactional emails | `onboarding@resend.dev` |

> [!NOTE]
> **Twilio Phone Number Format:** This must be a full valid E.164 formatted phone number obtained from your Twilio console. Shortcodes will cause silent failures.

---

## 3. Frontend Deployment (Vercel)

Deploy the `/frontend` folder to [Vercel](https://vercel.com).

### Configuration settings:
* **Framework Preset:** `Vite`
* **Root Directory:** `frontend`
* **Build Command:** `npm run build`
* **Output Directory:** `dist`

### Environment Variables (`.env`):
Set the following environment variables in Vercel under project settings:

| Variable Name | Description | Value |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase project API endpoint URL | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous public key | `your-anon-key-public` |
| `VITE_API_URL` | Public backend API base URL | `https://your-backend-domain.example.com/api` |

---

## 4. Local Verification & Launch

To run the full stack locally for testing:
1. Ensure both `.env` configurations are filled under `/backend` and `/frontend`.
2. Start the backend:
   ```bash
   cd backend
   npm install
   npm start
   ```
3. Start the frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
