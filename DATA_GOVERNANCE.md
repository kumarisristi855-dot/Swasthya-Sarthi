# CareSync Directory Data Governance

## Current Audit

CareSync uses one canonical hospital table:

- `hospitals`: facilities used by Nearby Facilities, Browse hospital lists, maps, hospital profiles, ratings, and doctor affiliations.

Doctor data is currently split by purpose:

- `doctor_profiles` + `doctor_hospital_affiliations`: CareSync account doctors who can be booked when active and accepted by a hospital.
- `verified_doctors` + `verified_doctor_hospital_affiliations`: public source-linked doctors from hospital or public directories. These do not imply a CareSync login or live appointment slots.

This split caused inconsistent behavior: bookable doctors and verified public roster doctors were not always surfaced through the same pages. The canonical read model is now:

- `canonical_doctor_directory` view: combines source-linked public doctors and public-verified bookable doctors for consistency audits and future shared reads.
- `hospitals` remains the canonical facility source for every location/map/profile use case.

Known non-canonical supporting data:

- `backend/src/data/publicDoctorAvailability.js`: source-linked OPD schedule hints keyed by doctor/hospital name. This should be migrated into `verified_doctor_hospital_affiliations` or a child table before broad national rollout.
- `searchableLocations` arrays in frontend/backend route code: location suggestion catalogs only, not doctor/hospital records.
- Development fixtures are filtered out by `developmentFixtures` helpers and must not be counted as public data.

## Required Verification Schema

Doctor records must carry:

- full name
- specialty / specialization id
- qualifications or credentials when public
- years of experience when public
- hospital or clinic affiliations
- license or registration number when public
- verification source URLs and verification date
- city/state and coordinates when public
- `verification_level`: `unverified`, `source-linked`, `hospital-confirmed`, `directory-confirmed`, or `conflict`

Hospital records must carry:

- name, address, city, state
- coordinates where available
- facility type
- departments or specialties where available
- operating hours where available
- website or official booking link where available
- verification source URLs and verification date
- `verification_level`: `unverified`, `source-linked`, `hospital-confirmed`, `directory-confirmed`, or `conflict`

Public pages must only display `source-linked`, `hospital-confirmed`, or `directory-confirmed` records. `unverified` and `conflict` records are internal-only.

## Cross-Verification Rules

Before publishing:

1. Use a primary source: hospital official site, state health department, National Health Mission, government directory, or an official accreditation/public roster.
2. Use a secondary source: state medical council registry, Google Business listing, public map listing, or another independent public directory.
3. If sources disagree on material facts such as name, specialty, address, or affiliation, mark the record `conflict` and do not publish it.
4. If only one source is available, mark `source-linked`, not `hospital-confirmed`.
5. Never fabricate rating, review count, doctor bio, license number, coordinates, or experience.
6. Set `last_verified_at` and `next_verification_due_at` for every published record. Default cadence is 6 months.

## State-by-State Population Workflow

For each state:

1. Start with cities where CareSync already has data.
2. Add the state capital and top 5-10 cities by population.
3. For each city, collect government hospitals, PHCs, CHCs, health sub-centres, district hospitals, and major private hospitals.
4. Add named doctors only when an official hospital roster or public verified directory lists them.
5. Insert records as internal drafts first with `verification_level = 'unverified'` or `conflict`.
6. Cross-check records using the verification rules above.
7. Promote only source-linked or confirmed records to public visibility.
8. Update `directory_city_coverage` with counts and data-quality notes.
9. Run `npm run audit:directory` from `backend`.
10. Report state-level coverage before moving to the next state.

State completion report should include:

- cities covered
- doctor count
- hospital count
- percent source-linked
- percent hospital-confirmed or directory-confirmed
- conflict count
- stale records
- data-quality issues

## Enforcement

Run:

```bash
cd backend
npm run audit:directory
```

The audit flags:

- public records missing source URLs
- public hospitals missing coordinates
- active verified doctors missing hospital roster affiliation
- conflicts that must remain unpublished
- bookable doctors whose public verification fields are incomplete
- bookable doctors attached to unverified hospitals

Exit codes:

- `0`: no high/critical issues
- `1`: high-priority issues found
- `2`: critical issues or missing governance schema

## Next Data Cleanup Priorities

1. Apply migration `11_canonical_directory_governance.sql`.
2. Backfill coordinates for source-linked Bokaro hospitals; the UI now falls back to location text, but maps and distance sort need coordinates.
3. Migrate `publicDoctorAvailability.js` into database rows.
4. Update user-facing routes gradually to read from `canonical_doctor_directory` where mixed bookable + public roster doctors are expected.
5. Populate `directory_city_coverage` for Delhi, Bokaro/Chas, and every currently imported state/city.
