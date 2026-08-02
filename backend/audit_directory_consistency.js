import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  isDevelopmentFixtureDoctor,
  isDevelopmentFixtureHospital
} from './src/lib/developmentFixtures.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;
const fullReport = process.argv.includes('--full');
const allStates = process.argv.includes('--all-states');
const ISSUE_SAMPLE_SIZE = 50;
const stateArg = process.argv.find(arg => arg.startsWith('--state='));
let stateFilter = stateArg ? stateArg.split('=').slice(1).join('=').trim() : null;
const indianStateLabels = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal'
];

function isPublicLevel(level) {
  return ['source-linked', 'hospital-confirmed', 'directory-confirmed'].includes(level);
}

function isMissingSchema(error) {
  return error?.code === 'PGRST204' ||
    error?.code === 'PGRST205' ||
    /column .* does not exist/i.test(error?.message || '');
}

function addIssue(issues, severity, type, message, context = {}) {
  issues.push({ severity, type, message, context });
}

function cityKey(state, city) {
  return `${state || 'Unknown'}::${city || 'Unknown'}`;
}

function sourceCount(record) {
  return Array.isArray(record.verification_sources) ? record.verification_sources.length : 0;
}

function isStale(record) {
  const due = record.next_verification_due_at || record.last_verified_at || record.verified_at;
  if (!due) return true;
  return Date.now() - new Date(due).getTime() > 0;
}

async function loadTables() {
  async function fetchAll(table, select, apply = query => query) {
    const pageSize = 1000;
    const rows = [];
    for (let start = 0; ; start += pageSize) {
      const query = apply(supabase
        .from(table)
        .select(select)
        .range(start, start + pageSize - 1));
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  }

  const [hospitals, verifiedDoctors, verifiedAffiliations, bookableAffiliations] = await Promise.all([
    fetchAll('hospitals', '*', query => stateFilter ? query.eq('state', stateFilter) : query),
    fetchAll('verified_doctors', '*, specialization:specializations!specialization_id(name)'),
    fetchAll(
      'verified_doctor_hospital_affiliations',
      '*, hospital:hospitals!hospital_id(id,name,city,state,latitude,longitude,verification_level,is_public), doctor:verified_doctors!doctor_id(id,full_name,is_active,verification_level)'
    ),
    fetchAll(
      'doctor_hospital_affiliations',
      '*, hospital:hospitals!hospital_id(id,name,city,state,verification_level,is_public), doctor:users!doctor_id(id,full_name,doctor_profiles!user_id(status,verification_level,is_public,license_no))'
    )
  ]);

  return {
    hospitals: hospitals.filter(hospital => !isDevelopmentFixtureHospital(hospital)),
    verifiedDoctors,
    verifiedAffiliations: verifiedAffiliations
      .filter(affiliation => !isDevelopmentFixtureHospital(affiliation.hospital))
      .filter(affiliation => !stateFilter || affiliation.hospital?.state === stateFilter),
    bookableAffiliations: bookableAffiliations
      .filter(affiliation =>
        !isDevelopmentFixtureHospital(affiliation.hospital) &&
        !isDevelopmentFixtureDoctor(affiliation.doctor)
      )
      .filter(affiliation => !stateFilter || affiliation.hospital?.state === stateFilter)
  };
}

function audit({ hospitals, verifiedDoctors, verifiedAffiliations, bookableAffiliations }) {
  const issues = [];
  const hospitalById = new Map(hospitals.map(hospital => [hospital.id, hospital]));
  const verifiedDoctorIdsWithAffiliation = new Set();
  const stateVerifiedDoctorIds = new Set(
    stateFilter
      ? verifiedAffiliations
        .filter(affiliation => affiliation.hospital?.state === stateFilter)
        .map(affiliation => affiliation.doctor_id)
      : []
  );
  const coverage = new Map();
  const duplicateBuckets = new Map();

  for (const hospital of hospitals) {
    const duplicateKey = [
      String(hospital.name || '').trim().toLowerCase(),
      String(hospital.city || hospital.district || '').trim().toLowerCase(),
      String(hospital.state || '').trim().toLowerCase()
    ].join('|');
    if (hospital.name && hospital.state && hospital.verification_status !== 'excluded') {
      const bucket = duplicateBuckets.get(duplicateKey) || [];
      bucket.push(hospital);
      duplicateBuckets.set(duplicateKey, bucket);
    }

    const key = cityKey(hospital.state, hospital.city || hospital.district);
    const row = coverage.get(key) || {
      state: hospital.state || 'Unknown',
      city: hospital.city || hospital.district || 'Unknown',
      hospitalCount: 0,
      doctorCount: 0,
      sourceLinkedCount: 0,
      hospitalConfirmedCount: 0,
      conflictCount: 0,
      staleCount: 0
    };
    if (hospital.is_public) {
      row.hospitalCount += 1;
    }
    if (hospital.is_public && hospital.verification_level === 'source-linked') row.sourceLinkedCount += 1;
    if (hospital.is_public && (hospital.verification_level === 'hospital-confirmed' || hospital.verification_level === 'directory-confirmed')) row.hospitalConfirmedCount += 1;
    if (hospital.is_public && hospital.verification_level === 'conflict') row.conflictCount += 1;
    if (hospital.is_public && isStale(hospital)) row.staleCount += 1;
    coverage.set(key, row);

    if (hospital.is_public && !hospital.source_url && !hospital.verification_source_url && sourceCount(hospital) === 0) {
      addIssue(issues, 'high', 'hospital_missing_source', 'Public hospital is missing a verification source URL.', {
        hospitalId: hospital.id,
        name: hospital.name
      });
    }

    if (hospital.is_public && (hospital.latitude === null || hospital.longitude === null)) {
      addIssue(issues, 'medium', 'hospital_missing_coordinates', 'Public hospital is missing coordinates, so distance/map behavior falls back to text matching.', {
        hospitalId: hospital.id,
        name: hospital.name,
        city: hospital.city,
        state: hospital.state
      });
    }
  }

  for (const affiliation of verifiedAffiliations) {
    const hospital = affiliation.hospital || hospitalById.get(affiliation.hospital_id);
    if (affiliation.status !== 'verified') {
      if (affiliation.status === 'needs_review') {
        addIssue(issues, 'high', 'doctor_affiliation_conflict', 'Verified doctor affiliation is flagged for manual review.', {
          affiliationId: affiliation.id,
          doctor: affiliation.doctor?.full_name,
          hospital: hospital?.name
        });
      }
      continue;
    }

    verifiedDoctorIdsWithAffiliation.add(affiliation.doctor_id);
    if (!hospital) {
      addIssue(issues, 'critical', 'affiliation_missing_hospital', 'Verified doctor affiliation references a missing hospital.', {
        affiliationId: affiliation.id,
        doctorId: affiliation.doctor_id,
        hospitalId: affiliation.hospital_id
      });
      continue;
    }

    const key = cityKey(hospital.state, hospital.city);
    const row = coverage.get(key) || {
      state: hospital.state || 'Unknown',
      city: hospital.city || 'Unknown',
      hospitalCount: 0,
      doctorCount: 0,
      sourceLinkedCount: 0,
      hospitalConfirmedCount: 0,
      conflictCount: 0,
      staleCount: 0
    };
    row.doctorCount += 1;
    if (affiliation.verification_level === 'source-linked' || affiliation.doctor?.verification_level === 'source-linked') row.sourceLinkedCount += 1;
    if (['hospital-confirmed', 'directory-confirmed'].includes(affiliation.verification_level) || ['hospital-confirmed', 'directory-confirmed'].includes(affiliation.doctor?.verification_level)) {
      row.hospitalConfirmedCount += 1;
    }
    if (affiliation.verification_level === 'conflict' || affiliation.doctor?.verification_level === 'conflict') row.conflictCount += 1;
    coverage.set(key, row);

    if (!affiliation.source_url && sourceCount(affiliation) === 0) {
      addIssue(issues, 'high', 'doctor_affiliation_missing_source', 'Verified doctor affiliation is missing its source URL.', {
        affiliationId: affiliation.id,
        doctor: affiliation.doctor?.full_name,
        hospital: hospital.name
      });
    }
  }

  for (const [key, bucket] of duplicateBuckets) {
    const uniqueSources = new Set(bucket.map(hospital => hospital.source_record_id || hospital.id));
    if (bucket.length > 1 && uniqueSources.size > 1) {
      addIssue(issues, 'medium', 'possible_duplicate_hospital', 'Multiple hospital rows share the same normalized name and location.', {
        key,
        rows: bucket.map(hospital => ({
          id: hospital.id,
          name: hospital.name,
          city: hospital.city,
          state: hospital.state,
          sourceDataset: hospital.source_dataset,
          sourceRecordId: hospital.source_record_id,
          verificationStatus: hospital.verification_status
        })).slice(0, 10)
      });
    }
  }

  for (const doctor of verifiedDoctors) {
    if (stateFilter && !stateVerifiedDoctorIds.has(doctor.id)) continue;
    if (!doctor.is_active) continue;
    if (!verifiedDoctorIdsWithAffiliation.has(doctor.id)) {
      addIssue(issues, 'high', 'doctor_missing_hospital_roster', 'Active verified doctor has no verified hospital affiliation, so hospital profiles cannot show them.', {
        doctorId: doctor.id,
        name: doctor.full_name
      });
    }
    if (!doctor.official_profile_url && sourceCount(doctor) === 0) {
      addIssue(issues, 'high', 'doctor_missing_source', 'Active verified doctor is missing a source URL.', {
        doctorId: doctor.id,
        name: doctor.full_name
      });
    }
    if (doctor.verification_level === 'conflict') {
      addIssue(issues, 'high', 'doctor_conflict', 'Verified doctor is flagged as conflict and should stay out of public listings.', {
        doctorId: doctor.id,
        name: doctor.full_name
      });
    }
  }

  for (const affiliation of bookableAffiliations) {
    const profile = affiliation.doctor?.doctor_profiles;
    if (affiliation.status !== 'accepted' || profile?.status !== 'active') continue;
    if (!profile.is_public || !isPublicLevel(profile.verification_level)) {
      addIssue(issues, 'medium', 'bookable_doctor_not_public_verified', 'Bookable active doctor is not marked public verified in the canonical governance fields.', {
        doctorId: affiliation.doctor?.id,
        doctor: affiliation.doctor?.full_name,
        hospital: affiliation.hospital?.name
      });
    }
    if (!affiliation.hospital?.is_public && !isPublicLevel(affiliation.hospital?.verification_level)) {
      addIssue(issues, 'medium', 'bookable_doctor_unverified_hospital', 'Bookable doctor is affiliated with a hospital not marked public verified.', {
        doctorId: affiliation.doctor?.id,
        doctor: affiliation.doctor?.full_name,
        hospitalId: affiliation.hospital?.id,
        hospital: affiliation.hospital?.name
      });
    }
  }

  const summary = [...coverage.values()]
    .sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city));

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      hospitals: hospitals.length,
      verifiedDoctors: verifiedDoctors.filter(doctor => doctor.is_active).length,
      verifiedAffiliations: verifiedAffiliations.filter(affiliation => affiliation.status === 'verified').length,
      bookableAffiliations: bookableAffiliations.filter(affiliation => affiliation.status === 'accepted').length,
      issues: issues.length
    },
    issueCounts: issues.reduce((counts, issue) => {
      counts[issue.type] = (counts[issue.type] || 0) + 1;
      return counts;
    }, {}),
    stateCoverage: summary.reduce((states, city) => {
      const state = states[city.state] || {
        state: city.state,
        cities: 0,
        hospitalCount: 0,
        doctorCount: 0,
        sourceLinkedCount: 0,
        hospitalConfirmedCount: 0,
        conflictCount: 0,
        staleCount: 0
      };
      state.cities += 1;
      state.hospitalCount += city.hospitalCount;
      state.doctorCount += city.doctorCount;
      state.sourceLinkedCount += city.sourceLinkedCount;
      state.hospitalConfirmedCount += city.hospitalConfirmedCount;
      state.conflictCount += city.conflictCount;
      state.staleCount += city.staleCount;
      states[city.state] = state;
      return states;
    }, {}),
    coverage: summary,
    issues
  };
}

function printReport(report) {
  if (fullReport) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const compact = {
      generatedAt: report.generatedAt,
      stateFilter,
      totals: report.totals,
      issueCounts: report.issueCounts,
      stateCoverage: Object.values(report.stateCoverage)
        .sort((a, b) => a.state.localeCompare(b.state)),
      issueSample: report.issues.slice(0, ISSUE_SAMPLE_SIZE),
      note: report.issues.length > ISSUE_SAMPLE_SIZE
        ? `Showing first ${ISSUE_SAMPLE_SIZE} of ${report.issues.length} issues. Re-run with --full for all details.`
        : undefined
    };
    console.log(JSON.stringify(compact, null, 2));
  }
  if (report.issues.some(issue => issue.severity === 'critical')) {
    process.exitCode = 2;
  } else if (report.issues.some(issue => issue.severity === 'high')) {
    process.exitCode = 1;
  }
}

try {
  if (allStates) {
    const summaries = [];
    const issueSamples = [];
    for (const state of indianStateLabels) {
      stateFilter = state;
      const report = audit(await loadTables());
      const coverage = Object.values(report.stateCoverage)[0] || {
        state,
        cities: 0,
        hospitalCount: 0,
        doctorCount: 0,
        sourceLinkedCount: 0,
        hospitalConfirmedCount: 0,
        conflictCount: 0,
        staleCount: 0
      };
      summaries.push({
        state,
        ...report.totals,
        coverage
      });
      issueSamples.push(...report.issues.slice(0, 5).map(issue => ({ state, ...issue })));
      console.log(`${state}: issues ${report.totals.issues}, hospitals ${report.totals.hospitals}, doctors ${coverage.doctorCount}`);
    }
    const totals = summaries.reduce((acc, summary) => ({
      hospitals: acc.hospitals + summary.hospitals,
      verifiedDoctors: Math.max(acc.verifiedDoctors, summary.verifiedDoctors),
      verifiedAffiliations: acc.verifiedAffiliations + summary.verifiedAffiliations,
      bookableAffiliations: acc.bookableAffiliations + summary.bookableAffiliations,
      issues: acc.issues + summary.issues
    }), { hospitals: 0, verifiedDoctors: 0, verifiedAffiliations: 0, bookableAffiliations: 0, issues: 0 });
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      allStates: true,
      totals,
      summaries,
      issueSample: issueSamples.slice(0, ISSUE_SAMPLE_SIZE)
    }, null, 2));
    if (totals.issues > 0) process.exitCode = 1;
  } else {
    const tables = await loadTables();
    printReport(audit(tables));
  }
} catch (error) {
  if (isMissingSchema(error)) {
    console.error('Directory governance schema is not applied yet. Run migrations through 11_canonical_directory_governance.sql.');
  } else {
    console.error('Directory consistency audit failed:', error.message || error);
  }
  process.exitCode = 2;
}
