# Swasthya Sarthi Healthcare Platform

A localized healthcare platform connecting **patients**, **doctors**, and
**hospital administrators**.

## Live Website

[Open Swasthya Sarthi](https://frontend-six-coral-82.vercel.app)

## What It Includes

- Patient portal for nearby hospital discovery, doctor lookup, symptom-guided search, appointments, and appointment history.
- Doctor portal for profile management, availability, appointments, and consultation notes.
- Hospital admin portal for doctor approvals, schedule oversight, and hospital operations.
- India-focused healthcare directory data with source-aware hospital and doctor listings.

## Local Development

Install dependencies separately for the frontend and backend:

```bash
cd frontend
npm install
npm run dev
```

```bash
cd backend
npm install
npm run dev
```

Environment values are intentionally not documented with real deployment details.
Use the placeholder `.env.example` files in `frontend/` and `backend/`, and keep
all real keys in local or hosting-provider environment settings only.

## Security Note

Do not commit `.env`, `.vercel`, API keys, service-role keys, tokens, passwords,
or private deployment URLs. The public README should only expose the user-facing
website link.
