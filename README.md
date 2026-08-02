# CareSync Healthcare Platform

A localized healthcare platform connecting **Patients**, **Doctors**, and **Hospital Admins**.

## Repository Structure

```
healthcare-platform/
├── frontend/                  (React, Vite, Tailwind CSS, React Router)
│   ├── src/modules/auth/      (Login and signup components)
│   ├── src/modules/patient/   (Patient dashboard and booking views)
│   ├── src/modules/doctor/    (Doctor schedule & availability views)
│   ├── src/modules/admin/     (Hospital admin operations)
│   ├── src/shared/            (Shared UI components, hooks)
│   └── src/lib/               (Supabase client, APIs)
├── backend/                   (Node.js, Express)
│   ├── src/routes/            (API endpoints)
│   ├── src/services/          (AI, booking, notifications, geolocation logic)
│   ├── src/middleware/        (Auth & role guards)
│   └── src/lib/               (Supabase config)
└── database/                  (SQL migrations & seeds)
```

## Setup Instructions

### Prerequisites
- Node.js (v18 or higher recommended)
- Supabase account & project

### 1. Environment Variables Configuration

#### Frontend Setup:
1. Navigate to `/frontend`
2. Duplicate `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Update the values with your Supabase credentials:
   - `VITE_SUPABASE_URL`: Your Supabase Project API URL.
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase Client Anon Key.

#### Backend Setup:
1. Navigate to `/backend`
2. Duplicate `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Update the values with your local port and Supabase service key:
   - `PORT`: Server listening port (default: 5000)
   - `SUPABASE_URL`: Your Supabase Project API URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase Service Role Key (crucial for admin actions bypassing RLS).

---

### 2. Development Setup

#### Running the Backend Server
```bash
cd backend
npm install
npm run dev
```
The backend server will start at `http://localhost:5000`. Verify using GET `http://localhost:5000/api/health`.

#### Running the Frontend Dev Server
```bash
cd frontend
npm install
npm run dev
```
The frontend Vite server will start. Open the displayed URL in your browser to view the CareSync Landing Page.
