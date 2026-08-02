# Delhi Doctor-Hospital Data Setup

This project now supports a Delhi-only doctor directory using the existing Supabase auth, `users`, `doctor_profiles`, `hospitals`, `doctor_hospital_affiliations`, and `doctor_availability` tables.

## Apply Schema

Run this migration after the existing migrations:

```text
database/migrations/06_delhi_doctor_hospital_metadata.sql
```

It adds Delhi metadata to hospitals, doctor profile metadata, per-hospital consultation/working-hour fields to affiliations, and indexes for Delhi filtering.

## Seed Delhi Data

Hospital-only SQL seed:

```text
database/seed/delhi_hospitals.sql
```

Full doctor + hospital + affiliation + availability seed:

```powershell
cd backend
node seed_delhi_data.js
```

The JS seed requires:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Optional:

```text
DELHI_SEED_PASSWORD=TestPass123!
```

The JS seed creates 15 Delhi doctor auth accounts, marks their profiles active, links them to Delhi hospitals, and creates weekly availability slots.

## Patient UI

After logging in as a patient, open:

```text
/patient/delhi-doctors
```

The page supports doctor name search, specialization, hospital name, Delhi district, and working-day filters.

## API Endpoints

```text
GET /api/doctors/delhi
GET /api/hospitals/delhi
GET /api/hospitals/delhi/:district
POST /api/doctors-hospitals/associate
PUT /api/doctors-hospitals/:id
DELETE /api/doctors-hospitals/:id
```

Association write endpoints require a hospital admin and only allow Delhi hospitals owned by that admin.
