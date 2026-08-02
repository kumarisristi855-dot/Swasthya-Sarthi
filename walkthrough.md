# Swasthya Sarthi Platform Walkthrough

This document keeps release checks public-safe. It intentionally excludes test
account credentials, project IDs, private URLs, screenshots from local machines,
and raw security logs.

## Core Checks

- Patient signup and login work through the patient portal.
- Doctor signup creates a pending profile until hospital approval.
- Hospital admins can approve and manage doctors only for their hospital.
- Nearby hospital discovery works with GPS and manual location search.
- Hospital profile pages show facility details, operating hours, and doctors
  attached to that hospital.
- Doctor profile pages open inside the website.
- Appointment booking prevents duplicate bookings for the same doctor and slot.
- Appointment history and consultation notes remain role-protected.
- Google hospital ratings and operating hours degrade gracefully when provider
  quota or source data is unavailable.
- Outbreak alerts are shown only when a relevant public notice is active nearby.

## Security Checks

- Backend routes verify authenticated role server-side.
- Database access is protected with row-level security.
- Service-role credentials are used only server-side.
- Private keys, tokens, passwords, and deployment internals are never committed.
