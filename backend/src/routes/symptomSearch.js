import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticateUser } from '../middleware/auth.js';
import { matchSymptoms } from '../services/ai/symptomMatcher.js';
import { calculateDistance } from '../services/geolocation/haversine.js';
import { getPublicDoctorAvailability } from '../data/publicDoctorAvailability.js';

const router = Router();
const excludedFacilityNames = new Set([
  'Apollo Hospital Delhi',
  'Fortis Healthcare - Noida',
  'Dr. Bhubaneswar Borooah Institute of Acute Care',
  'Bharat Hospital & Institute of Cardiology'
]);

const departmentTerms = {
  'General Physician': ['general medicine', 'internal medicine', 'general physician', 'emergency medicine'],
  Cardiologist: ['cardiology', 'cardiac'],
  Dermatologist: ['dermatology', 'skin'],
  Pediatrician: ['pediatrics', 'paediatrics'],
  Orthopedic: ['orthopedic', 'orthopaedic'],
  'ENT Specialist': ['ent', 'ear nose throat', 'otorhinolaryngology'],
  Gynecologist: ['gynecology', 'gynaecology', 'obstetrics'],
  Neurologist: ['neurology', 'neurosciences'],
  Psychiatrist: ['psychiatry', 'mental health'],
  Dentist: ['dental', 'dentistry'],
  Ophthalmologist: ['ophthalmology', 'eye'],
  Gastroenterologist: ['gastroenterology', 'digestive'],
  Pulmonologist: ['pulmonology', 'respiratory', 'chest medicine'],
  Urologist: ['urology'],
  Endocrinologist: ['endocrinology', 'diabetes'],
  Oncologist: ['oncology', 'cancer'],
  Nephrologist: ['nephrology', 'kidney', 'renal']
};

function isDirectoryUnavailable(error) {
  return error?.code === 'PGRST204' ||
    error?.code === 'PGRST205' ||
    error?.code === '42501';
}

function getDistance(patientLat, patientLng, hospital) {
  if (
    !Number.isFinite(patientLat) ||
    !Number.isFinite(patientLng) ||
    !Number.isFinite(hospital?.latitude) ||
    !Number.isFinite(hospital?.longitude)
  ) {
    return null;
  }
  return calculateDistance(patientLat, patientLng, hospital.latitude, hospital.longitude);
}

function hospitalRatingSummary(hospital) {
  return {
    ratingAvg: Number(hospital.rating_avg) || 0,
    ratingCount: Number(hospital.rating_count) || 0
  };
}

function hospitalOperatingHoursSummary(hospital) {
  const weekly = hospital?.timings && typeof hospital.timings === 'object' && !Array.isArray(hospital.timings)
    ? Object.fromEntries(Object.entries(hospital.timings).filter(([, hours]) => Boolean(hours)))
    : null;
  const text = String(hospital?.operating_hours || '').trim();

  if (weekly && Object.keys(weekly).length > 0) {
    return { operatingHours: { status: 'published', label: 'Published hours', weekly } };
  }

  if (text) {
    return { operatingHours: { status: 'published', label: text, text } };
  }

  return { operatingHours: { status: 'unpublished', label: 'Hours not published' } };
}

async function findVerifiedDoctors(specializationId, patientLat, patientLng, place = null, state = null) {
  const { data, error } = await supabase
    .from('verified_doctors')
    .select(`
      id,
      full_name,
      credentials,
      years_experience,
      official_profile_url,
      source_name,
      verified_at,
      affiliations:verified_doctor_hospital_affiliations!doctor_id (
        id,
        status,
        official_booking_url,
        hospital:hospitals!hospital_id (
          id,
          name,
          address,
          latitude,
          longitude,
          city,
          district,
          state,
          pincode,
          verification_status,
          verification_level,
          is_public
        )
      )
    `)
    .eq('specialization_id', specializationId)
    .eq('is_active', true);

  if (error) {
    if (isDirectoryUnavailable(error)) return [];
    throw error;
  }

  return (data || [])
    .flatMap(doctor => (doctor.affiliations || [])
      .filter(affiliation =>
        affiliation.status === 'verified' &&
        affiliation.hospital?.is_public === true
      )
      .map(affiliation => ({
        id: doctor.id,
        fullName: doctor.full_name,
        credentials: doctor.credentials,
        yearsExperience: doctor.years_experience,
        officialProfileUrl: doctor.official_profile_url,
        officialBookingUrl: affiliation.official_booking_url,
        sourceName: doctor.source_name,
        verifiedAt: doctor.verified_at,
        directoryOnly: true,
        hospital: {
          ...affiliation.hospital,
          publicAvailability: getPublicDoctorAvailability(
            doctor.full_name,
            affiliation.hospital.name
          )
        },
        distance: getDistance(patientLat, patientLng, affiliation.hospital)
      })))
    .filter(doctor =>
      !Number.isFinite(patientLat) ||
      !Number.isFinite(patientLng) ||
      doctor.distance === null ||
      doctor.distance <= 150
    )
    .filter(doctor => {
      // Coordinates are more accurate than locality text when both endpoints are usable.
      if (
        Number.isFinite(patientLat) &&
        Number.isFinite(patientLng) &&
        doctor.distance !== null
      ) return true;
      const locationText = [
        doctor.hospital?.name,
        doctor.hospital?.address,
        doctor.hospital?.city,
        doctor.hospital?.district,
        doctor.hospital?.state,
        doctor.hospital?.pincode
      ].filter(Boolean).join(' ').toLowerCase();
      if (state && locationText.includes(String(state).toLowerCase())) return true;
      if (place) return locationText.includes(place);
      return !state;
    })
    .sort((a, b) => {
      if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
      if (a.distance !== null) return -1;
      if (b.distance !== null) return 1;
      return a.fullName.localeCompare(b.fullName);
    });
}

async function findSuitableHospitals(
  specializationName,
  patientLat,
  patientLng,
  doctorHospitals,
  carePathway = null,
  state = null
) {
  let query = supabase
    .from('hospitals')
    .select('*')
    .eq('is_public', true)
    .limit(1000);

  if (Number.isFinite(patientLat) && Number.isFinite(patientLng)) {
    query = query
      .gte('latitude', patientLat - 1.5)
      .lte('latitude', patientLat + 1.5)
      .gte('longitude', patientLng - 1.5)
      .lte('longitude', patientLng + 1.5);
  } else {
    query = query.eq('city', 'Delhi');
  }
  if (state) query = query.eq('state', state);

  const { data, error } = await query;

  if (error) throw error;

  const terms = carePathway === 'Infectious Disease / General Medicine'
    ? ['infectious disease', 'tropical medicine', 'general medicine', 'internal medicine', 'emergency medicine']
    : (departmentTerms[specializationName] || [specializationName.toLowerCase()]);
  const hospitalsWithDoctors = new Set(doctorHospitals.map(hospital => hospital.id));
  const hospitalRows = [...(data || [])];
  const loadedHospitalIds = new Set(hospitalRows.map(hospital => hospital.id));
  const missingHospitalIds = [...hospitalsWithDoctors].filter(id => !loadedHospitalIds.has(id));

  if (missingHospitalIds.length > 0) {
    const { data: affiliatedHospitals, error: affiliatedError } = await supabase
      .from('hospitals')
      .select('*')
      .eq('is_public', true)
      .in('id', missingHospitalIds);

    if (affiliatedError) throw affiliatedError;
    hospitalRows.push(...(affiliatedHospitals || []));
  }

  const rankedHospitals = hospitalRows
    .filter(hospital => !excludedFacilityNames.has(hospital.name))
    .map(hospital => {
      const serviceText = [
        hospital.name,
        hospital.hospital_type,
        hospital.care_type,
        ...(hospital.departments || [])
      ].filter(Boolean).join(' ').toLowerCase();
      const hasVerifiedDoctor = hospitalsWithDoctors.has(hospital.id);
      const hasSpecialtyMatch = terms.some(term => serviceText.includes(term));
      const isGeneralCareOption = /multi.?special|super.?special|district hospital|state hospital|community health|primary health|general hospital|government hospital|medical college|clinic/i
        .test(serviceText);

      return {
        id: hospital.id,
        name: hospital.name,
        address: hospital.address,
        district: hospital.district,
        latitude: hospital.latitude,
        longitude: hospital.longitude,
        departments: hospital.departments || [],
        verificationStatus: hospital.verification_status || 'unverified',
        verificationSourceUrl: hospital.verification_source_url || null,
        ...hospitalRatingSummary(hospital),
        ...hospitalOperatingHoursSummary(hospital),
        hasVerifiedDoctor,
        hasSpecialtyMatch,
        matchType: hasVerifiedDoctor
          ? 'verified_doctor'
          : (hasSpecialtyMatch ? 'specialty_department' : 'assessment_referral'),
        isGeneralCareOption,
        distance: getDistance(patientLat, patientLng, hospital)
      };
    })
    .filter(hospital =>
      hospital.hasVerifiedDoctor ||
      hospital.hasSpecialtyMatch ||
      hospital.isGeneralCareOption
    )
    .sort((a, b) => {
      if (a.hasVerifiedDoctor !== b.hasVerifiedDoctor) return a.hasVerifiedDoctor ? -1 : 1;
      if (a.hasSpecialtyMatch !== b.hasSpecialtyMatch) return a.hasSpecialtyMatch ? -1 : 1;
      if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
      if (a.distance !== null) return -1;
      if (b.distance !== null) return 1;
      return a.name.localeCompare(b.name);
    });

  return rankedHospitals.slice(0, 10);
}

// POST /api/symptom-search
router.post('/symptom-search', authenticateUser, async (req, res) => {
  const { patientId, symptomText, lat, lng, state } = req.body;
  const place = String(req.body.place || '').trim().toLowerCase().slice(0, 120);
  const targetPatientId = patientId || req.user.id;

  if (!symptomText) {
    return res.status(400).json({
      error: { message: 'Symptom description text is required', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    // 1. Run symptom matcher (calling Groq or falling back to rules)
    const classification = await matchSymptoms(symptomText);

    // 2. Validate classification specialization against DB
    let specRecord = null;
    if (classification.specialization && classification.specialization !== 'unclear') {
      const { data } = await supabase
        .from('specializations')
        .select('id, name')
        .eq('name', classification.specialization)
        .single();
      specRecord = data;
    }

    // 3. Log query to database (symptom_queries log)
    const { error: logError } = await supabase
      .from('symptom_queries')
      .insert({
        patient_id: targetPatientId,
        raw_input: symptomText,
        matched_specialization_id: specRecord ? specRecord.id : null,
        urgency_level: classification.urgency,
        confidence_score: classification.confidence
      });

    if (logError) {
      console.error('Failed to log symptom query to database:', logError);
    }

    // 4. Handle unclear or invalid specialization classifications (clarify fallback)
    if (!specRecord) {
      return res.status(200).json({
        clarificationNeeded: true,
        message: 'Your symptoms are a bit unclear. Could you please provide more specific details, such as localized pain areas, severity, or length of symptoms?'
      });
    }

    // 5. Handle emergency-triage redirect screen
    if (classification.urgency === 'emergency') {
      return res.status(200).json({
        urgency: 'emergency',
        emergencyRedirect: true,
        specialization: specRecord.name,
        confidence: classification.confidence
      });
    }

    const patientLat = lat ? parseFloat(lat) : null;
    const patientLng = lng ? parseFloat(lng) : null;
    const matchedDoctors = classification.hospitalOnly
      ? []
      : await findVerifiedDoctors(specRecord.id, patientLat, patientLng, place, state);
    const matchedHospitals = await findSuitableHospitals(
      specRecord.name,
      patientLat,
      patientLng,
      matchedDoctors.map(doctor => doctor.hospital),
      classification.carePathway,
      state
    );

    return res.status(200).json({
      urgency: classification.urgency,
      emergencyRedirect: false,
      specialization: specRecord.name,
      carePathway: classification.carePathway || specRecord.name,
      hospitalOnly: classification.hospitalOnly === true,
      confidence: classification.confidence,
      doctors: matchedDoctors,
      hospitals: matchedHospitals
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error matching symptoms', code: 'INTERNAL_ERROR' }
    });
  }
});

export default router;
