import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticateUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { sendSMS, sendEmail } from '../services/notifications/index.js';
import { calculateDistance } from '../services/geolocation/haversine.js';
import {
  EMERGENCY_SYMPTOM_PREFIX,
  appointmentTypeFor,
  cleanSymptomQuery,
  isMissingAppointmentTypeColumn
} from '../services/booking/appointmentPriority.js';
import {
  hideDevelopmentDoctor,
  hideDevelopmentHospital
} from '../lib/developmentFixtures.js';
import { getPublicDoctorAvailability } from '../data/publicDoctorAvailability.js';

const router = Router();
const INDIA_TIME_ZONE = 'Asia/Kolkata';

function indiaDateKey(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function getAvailableSlotsForDate(doctorId, date) {
  const targetDate = new Date(`${date}T12:00:00Z`);
  const dayOfWeek = targetDate.getUTCDay();
  const startOfDay = new Date(`${date}T00:00:00+05:30`);
  const endOfDay = new Date(`${date}T23:59:59.999+05:30`);

  const { data: availability, error: availError } = await supabase
    .from('doctor_availability')
    .select(`
      *,
      hospital:hospitals!hospital_id (
        id,
        name,
        address
      )
    `)
    .eq('doctor_id', doctorId)
    .eq('day_of_week', dayOfWeek);

  if (availError) {
    throw availError;
  }

  const { data: appointments, error: appError } = await supabase
    .from('appointments')
    .select('appointment_time, status')
    .eq('doctor_id', doctorId)
    .gte('appointment_time', startOfDay.toISOString())
    .lte('appointment_time', endOfDay.toISOString());

  if (appError) {
    throw appError;
  }

  const { data: timeOff, error: timeOffError } = await supabase
    .from('doctor_time_off')
    .select('start_datetime, end_datetime')
    .eq('doctor_id', doctorId)
    .lte('start_datetime', endOfDay.toISOString())
    .gte('end_datetime', startOfDay.toISOString());

  if (timeOffError) {
    throw timeOffError;
  }

  const leavePeriods = (timeOff || []).map(period => ({
    startDatetime: period.start_datetime,
    endDatetime: period.end_datetime
  }));

  if (!availability || availability.length === 0) {
    return {
      slots: [],
      availabilityStatus: leavePeriods.length ? 'on_leave' : 'no_schedule',
      availabilityMessage: leavePeriods.length
        ? 'The doctor is on leave for this date. Please choose another day.'
        : 'The doctor has not published in-person appointment hours for this date.',
      leavePeriods
    };
  }

  const availableSlots = [];

  for (const schedule of availability) {
    const [startH, startM] = schedule.start_time.split(':').map(Number);
    const [endH, endM] = schedule.end_time.split(':').map(Number);

    let current = new Date(
      `${date}T${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}:00+05:30`
    );
    const limit = new Date(
      `${date}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00+05:30`
    );

    const slotSizeMs = schedule.slot_duration_minutes * 60 * 1000;

    while (current.getTime() + slotSizeMs <= limit.getTime()) {
      const slotStart = current.getTime();
      const slotEnd = current.getTime() + slotSizeMs;

      const isBooked = (appointments || []).some(app => {
        const appTime = new Date(app.appointment_time).getTime();
        return app.status !== 'cancelled' && appTime === slotStart;
      });

      const isBlocked = (timeOff || []).some(to => {
        const toStart = new Date(to.start_datetime).getTime();
        const toEnd = new Date(to.end_datetime).getTime();
        return slotStart < toEnd && slotEnd > toStart;
      });

      if (!isBooked && !isBlocked && slotStart > Date.now()) {
        availableSlots.push({
          time: new Date(slotStart).toISOString(),
          visitType: 'in_person',
          hospitalId: schedule.hospital_id,
          hospitalName: schedule.hospital?.name || 'Affiliated clinic',
          hospitalAddress: schedule.hospital?.address || null
        });
      }

      current = new Date(current.getTime() + slotSizeMs);
    }
  }

  const hasLeave = leavePeriods.length > 0;
  const availabilityStatus = availableSlots.length
    ? (hasLeave ? 'partially_on_leave' : 'available')
    : (hasLeave ? 'on_leave' : 'fully_booked');
  const availabilityMessage = {
    available: 'Published appointment slots are available.',
    partially_on_leave: 'The doctor has limited hours because of scheduled leave.',
    on_leave: 'The doctor is on leave for this date. Please choose another day.',
    fully_booked: 'All published slots for this date are already booked.'
  }[availabilityStatus];

  return { slots: availableSlots, availabilityStatus, availabilityMessage, leavePeriods };
}

async function getAcceptedAffiliations(doctorIds) {
  if (!doctorIds.length) return new Map();

  const { data, error } = await supabase
    .from('doctor_hospital_affiliations')
    .select(`
      id,
      doctor_id,
      hospital_id,
      status,
      specialization_id,
      consultation_fee,
      working_days,
      start_time,
      end_time,
      hospital:hospitals!hospital_id (
        id,
        name,
        address,
        city,
        district,
        state,
        pincode,
        phone,
        email,
        hospital_type,
        area,
        latitude,
        longitude,
        verification_status
      )
    `)
    .in('doctor_id', doctorIds)
    .eq('status', 'accepted');

  if (error) throw error;

  const byDoctor = new Map();
  for (const affiliation of data || []) {
    if (!affiliation.hospital || hideDevelopmentHospital(affiliation.hospital)) continue;
    const current = byDoctor.get(affiliation.doctor_id) || [];
    current.push(affiliation);
    byDoctor.set(affiliation.doctor_id, current);
  }
  return byDoctor;
}

// GET /api/specializations
// Public reference list used by doctor browsing filters and signup forms
router.get('/specializations', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('specializations')
      .select('id, name, description')
      .order('name', { ascending: true });

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to load specializations', code: 'DB_ERROR' }
      });
    }

    return res.status(200).json({ specializations: data || [] });
  } catch (err) {
    return res.status(500).json({
      error: { message: 'Internal server error loading specializations', code: 'INTERNAL_ERROR' }
    });
  }
});

// GET /api/doctors/search?specializationId=&date=&hospitalId=&lat=&lng=
// Search active doctors with optional specialization, hospital, and same-day slot filters
router.get('/doctors/search', async (req, res) => {
  const { specializationId, date, hospitalId, lat, lng } = req.query;
  const place = String(req.query.place || '').trim().toLowerCase().slice(0, 120);

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: { message: 'Date parameter must use YYYY-MM-DD format', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    let query = supabase
      .from('doctor_profiles')
      .select(`
        user_id,
        license_no,
        years_experience,
        consultation_fee,
        bio,
        rating_avg,
        rating_count,
        specialization:specializations!specialization_id (
          id,
          name
        ),
        users:user_id (
          id,
          full_name,
          email,
          phone
        )
      `)
      .eq('status', 'active');

    if (specializationId && specializationId !== 'all') {
      query = query.eq('specialization_id', parseInt(specializationId, 10));
    }

    const { data: doctorsList, error } = await query;

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to search doctors', code: 'DB_ERROR' }
      });
    }

    const affiliationsByDoctor = await getAcceptedAffiliations(
      (doctorsList || []).map(doctor => doctor.user_id)
    );
    const patientLat = lat ? parseFloat(lat) : null;
    const patientLng = lng ? parseFloat(lng) : null;
    const requestedRadius = Number.parseFloat(req.query.radius);
    const radius = Number.isFinite(requestedRadius)
      ? Math.min(Math.max(requestedRadius, 1), 500)
      : 150;
    const results = [];

    for (const doctor of doctorsList || []) {
      if (hideDevelopmentDoctor(doctor)) continue;
      const acceptedAffiliations = (affiliationsByDoctor.get(doctor.user_id) || [])
        .filter(aff => !hospitalId || aff.hospital.id === hospitalId)
        .filter(aff => {
          if (!place) return true;
          const hospitalLocation = [
            aff.hospital.city,
            aff.hospital.district,
            aff.hospital.state,
            aff.hospital.address
          ].filter(Boolean).join(' ').toLowerCase();
          return hospitalLocation.includes(place);
        });

      if (!doctor.users || acceptedAffiliations.length === 0) {
        continue;
      }

      let selectedHospital = acceptedAffiliations[0].hospital;
      let distance = null;
      const hasPlaceMatchedAffiliations = Boolean(place && acceptedAffiliations.length > 0);

      if (!Number.isNaN(patientLat) && !Number.isNaN(patientLng) && patientLat !== null && patientLng !== null) {
        const hospitalsByDistance = acceptedAffiliations
          .map(aff => {
            const h = aff.hospital;
            if (h.latitude === null || h.longitude === null) {
              return null;
            }
            return {
              hospital: h,
              distance: calculateDistance(patientLat, patientLng, h.latitude, h.longitude)
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.distance - b.distance);

        if (hospitalsByDistance.length > 0) {
          selectedHospital = hospitalsByDistance[0].hospital;
          distance = hospitalsByDistance[0].distance;
        }
      }

      if (
        patientLat !== null &&
        patientLng !== null &&
        (distance === null || distance > radius) &&
        !(distance === null && hasPlaceMatchedAffiliations)
      ) {
        continue;
      }

      let availableSlots = [];
      if (date) {
        availableSlots = (await getAvailableSlotsForDate(doctor.user_id, date)).slots
          .filter(slot => acceptedAffiliations.some(aff => aff.hospital.id === slot.hospitalId));

        if (availableSlots.length === 0) {
          continue;
        }
      }

      results.push({
        id: doctor.users.id,
        fullName: doctor.users.full_name,
        specialization: doctor.specialization?.name || 'General Physician',
        specializationId: doctor.specialization?.id,
        yearsExperience: doctor.years_experience || 0,
        consultationFee: doctor.consultation_fee || 0,
        bio: doctor.bio || '',
        ratingAvg: Number(doctor.rating_avg) || 0,
        ratingCount: doctor.rating_count || 0,
        hospital: selectedHospital,
        distance,
        nextAvailableSlots: availableSlots.slice(0, 3)
      });
    }

    results.sort((a, b) => {
      if (a.distance !== null && b.distance !== null && Math.abs(a.distance - b.distance) > 0.01) {
        return a.distance - b.distance;
      }
      if ((b.ratingAvg || 0) !== (a.ratingAvg || 0)) {
        return (b.ratingAvg || 0) - (a.ratingAvg || 0);
      }
      return (b.yearsExperience || 0) - (a.yearsExperience || 0);
    });

    return res.status(200).json({ doctors: results });
  } catch (err) {
    return res.status(500).json({
      error: { message: 'Internal server error searching doctors', code: 'INTERNAL_ERROR' }
    });
  }
});

// GET /api/doctors/delhi
// Delhi-only doctor directory with hospital affiliations and filters.
router.get('/doctors/delhi', authenticateUser, async (req, res) => {
  const { q, specializationId, specialization, hospitalName, district, area, availableDay } = req.query;

  try {
    let query = supabase
      .from('doctor_profiles')
      .select(`
        user_id,
        license_no,
        years_experience,
        consultation_fee,
        bio,
        profile_picture_url,
        credentials,
        rating_avg,
        rating_count,
        specialization:specializations!specialization_id (
          id,
          name
        ),
        users:user_id (
          id,
          full_name,
          email,
          phone
        )
      `)
      .eq('status', 'active');

    if (specializationId && specializationId !== 'all') {
      query = query.eq('specialization_id', parseInt(specializationId, 10));
    }

    const { data: doctorsList, error } = await query;

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to load Delhi doctors', code: 'DB_ERROR' }
      });
    }

    const affiliationsByDoctor = await getAcceptedAffiliations(
      (doctorsList || []).map(doctor => doctor.user_id)
    );
    const normalizedQ = q ? q.toLowerCase() : '';
    const normalizedSpecialization = specialization ? specialization.toLowerCase() : '';
    const normalizedHospital = hospitalName ? hospitalName.toLowerCase() : '';
    const normalizedDistrict = district ? district.toLowerCase() : '';
    const normalizedArea = area ? area.toLowerCase() : '';
    const dayFilter = availableDay !== undefined && availableDay !== 'all' ? parseInt(availableDay, 10) : null;

    const doctors = (doctorsList || [])
      .filter(doctor => !hideDevelopmentDoctor(doctor))
      .map(doctor => {
        const hospitals = (affiliationsByDoctor.get(doctor.user_id) || [])
          .filter(aff => aff.hospital?.city === 'Delhi')
          .filter(aff => !normalizedHospital || aff.hospital.name.toLowerCase().includes(normalizedHospital))
          .filter(aff => !normalizedDistrict || aff.hospital.district?.toLowerCase() === normalizedDistrict)
          .filter(aff => !normalizedArea || aff.hospital.area?.toLowerCase().includes(normalizedArea))
          .filter(aff => dayFilter === null || (aff.working_days || []).includes(dayFilter))
          .map(aff => ({
            associationId: aff.id,
            id: aff.hospital.id,
            name: aff.hospital.name,
            address: aff.hospital.address,
            district: aff.hospital.district,
            state: aff.hospital.state,
            pincode: aff.hospital.pincode,
            phone: aff.hospital.phone,
            email: aff.hospital.email,
            hospitalType: aff.hospital.hospital_type,
            area: aff.hospital.area,
            latitude: aff.hospital.latitude,
            longitude: aff.hospital.longitude,
            consultationFee: aff.consultation_fee || doctor.consultation_fee || 0,
            workingDays: aff.working_days || [],
            startTime: aff.start_time,
            endTime: aff.end_time
          }));

        return {
          id: doctor.users?.id,
          fullName: doctor.users?.full_name,
          email: doctor.users?.email,
          phone: doctor.users?.phone,
          profilePictureUrl: doctor.profile_picture_url,
          licenseNo: doctor.license_no,
          credentials: doctor.credentials,
          yearsExperience: doctor.years_experience || 0,
          consultationFee: doctor.consultation_fee || 0,
          bio: doctor.bio || '',
          ratingAvg: Number(doctor.rating_avg) || 0,
          ratingCount: doctor.rating_count || 0,
          specializationId: doctor.specialization?.id,
          specialization: doctor.specialization?.name || 'General Physician',
          hospitals
        };
      })
      .filter(doctor => doctor.id && doctor.hospitals.length > 0)
      .filter(doctor => !normalizedQ || doctor.fullName?.toLowerCase().includes(normalizedQ))
      .filter(doctor => !normalizedSpecialization || doctor.specialization?.toLowerCase().includes(normalizedSpecialization))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    return res.status(200).json({
      region: 'Delhi',
      doctors
    });
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error loading Delhi directory', code: 'INTERNAL_ERROR' }
    });
  }
});

// GET /api/doctors/:id
// Retrieves doctor profile details for direct patient booking
router.get('/doctors/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('doctor_profiles')
      .select(`
        user_id,
        license_no,
        years_experience,
        consultation_fee,
        bio,
        rating_avg,
        rating_count,
        users:user_id (id, full_name, email, phone),
        specialization:specializations (name)
      `)
      .eq('user_id', id)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to load doctor profile', code: 'DB_ERROR' }
      });
    }

    if (data && !hideDevelopmentDoctor(data)) {
      return res.status(200).json({
        doctor: {
          id: data.users.id,
          fullName: data.users.full_name,
          licenseNo: data.license_no,
          yearsExperience: data.years_experience,
          consultationFee: data.consultation_fee,
          bio: data.bio,
          ratingAvg: Number(data.rating_avg) || 0,
          ratingCount: data.rating_count || 0,
          specialization: data.specialization?.name || 'General Physician',
          directoryOnly: false
        }
      });
    }

    const { data: directoryDoctor, error: directoryError } = await supabase
      .from('verified_doctors')
      .select(`
        id,
        full_name,
        credentials,
        years_experience,
        official_profile_url,
        source_name,
        verified_at,
        is_active,
        specialization:specializations!specialization_id (
          id,
          name
        ),
        affiliations:verified_doctor_hospital_affiliations!doctor_id (
          id,
          department_name,
          official_booking_url,
          source_url,
          verified_at,
          status,
          hospital:hospitals!hospital_id (
            id,
            name,
            address,
            city,
            district,
            state,
            pincode,
            phone,
            mobile,
            website,
            is_public
          )
        )
      `)
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle();

    if (directoryError) {
      return res.status(400).json({
        error: { message: directoryError.message || 'Failed to load verified doctor profile', code: 'DB_ERROR' }
      });
    }

    if (!directoryDoctor) {
      return res.status(404).json({
        error: { message: 'Doctor profile not found', code: 'NOT_FOUND' }
      });
    }

    const hospitals = (directoryDoctor.affiliations || [])
      .filter(affiliation =>
        affiliation.status === 'verified' &&
        affiliation.hospital?.is_public === true
      )
      .map(affiliation => ({
        associationId: affiliation.id,
        id: affiliation.hospital.id,
        name: affiliation.hospital.name,
        address: affiliation.hospital.address,
        city: affiliation.hospital.city,
        district: affiliation.hospital.district,
        state: affiliation.hospital.state,
        pincode: affiliation.hospital.pincode,
        phone: affiliation.hospital.phone,
        mobile: affiliation.hospital.mobile,
        website: affiliation.hospital.website,
        departmentName: affiliation.department_name,
        officialBookingUrl: affiliation.official_booking_url,
        sourceUrl: affiliation.source_url,
        verifiedAt: affiliation.verified_at,
        publicAvailability: getPublicDoctorAvailability(
          directoryDoctor.full_name,
          affiliation.hospital.name
        )
      }));

    return res.status(200).json({
      doctor: {
        id: directoryDoctor.id,
        fullName: directoryDoctor.full_name,
        licenseNo: null,
        credentials: directoryDoctor.credentials,
        yearsExperience: directoryDoctor.years_experience,
        consultationFee: 0,
        bio: `${directoryDoctor.full_name} is listed from verified public hospital-directory sources. Confirm current OPD availability with the hospital before visiting.`,
        ratingAvg: 0,
        ratingCount: 0,
        specialization: directoryDoctor.specialization?.name || 'Specialization not listed',
        specializationId: directoryDoctor.specialization?.id || null,
        sourceName: directoryDoctor.source_name,
        officialProfileUrl: directoryDoctor.official_profile_url,
        verifiedAt: directoryDoctor.verified_at,
        directoryOnly: true,
        hospitals
      }
    });
  } catch (err) {
    return res.status(500).json({
      error: { message: 'Internal server error fetching doctor details', code: 'INTERNAL_ERROR' }
    });
  }
});

// GET /api/doctors/:id/available-slots?date=YYYY-MM-DD
// Calculates slot availability by checking weekly schedule, time off, and active bookings
router.get('/doctors/:id/available-slots', async (req, res) => {
  const { id: doctorId } = req.params;
  const { date } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: { message: 'Date parameter in YYYY-MM-DD format is required', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    const availability = await getAvailableSlotsForDate(doctorId, date);
    return res.status(200).json(availability);
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error calculating slots', code: 'INTERNAL_ERROR' }
    });
  }
});

// POST /api/appointments
// Attempts to insert a new appointment; enforces unique slot constraint inside transaction
router.post('/appointments', authenticateUser, requireRole('patient'), async (req, res) => {
  const { doctorId, hospitalId, appointmentTime, symptomQuery, appointmentType = 'routine', visitType = 'in_person' } = req.body;

  if (!doctorId || !hospitalId || !appointmentTime) {
    return res.status(400).json({
      error: { message: 'Doctor ID, Hospital ID, and Appointment Time are required', code: 'VALIDATION_ERROR' }
    });
  }

  if (!['routine', 'emergency'].includes(appointmentType)) {
    return res.status(400).json({
      error: { message: 'Appointment type must be routine or emergency', code: 'VALIDATION_ERROR' }
    });
  }

  if (visitType !== 'in_person') {
    return res.status(400).json({
      error: {
        message: 'Swasthya Sarthi only supports in-person appointments at a hospital or clinic',
        code: 'IN_PERSON_ONLY'
      }
    });
  }

  if (appointmentType === 'emergency' && String(symptomQuery || '').trim().length < 5) {
    return res.status(400).json({
      error: {
        message: 'Briefly describe the urgent symptoms before requesting an emergency appointment',
        code: 'EMERGENCY_DETAILS_REQUIRED'
      }
    });
  }

  try {
    const requestedTime = new Date(appointmentTime);
    if (Number.isNaN(requestedTime.getTime()) || requestedTime.getTime() <= Date.now()) {
      return res.status(400).json({
        error: { message: 'Appointment time must be a valid future time', code: 'INVALID_APPOINTMENT_TIME' }
      });
    }

    const { data: doctorProfile, error: doctorError } = await supabase
      .from('doctor_profiles')
      .select('user_id, status')
      .eq('user_id', doctorId)
      .single();
    if (doctorError || doctorProfile?.status !== 'active') {
      return res.status(400).json({
        error: { message: 'This doctor is not currently active for booking', code: 'DOCTOR_NOT_ACTIVE' }
      });
    }

    const { data: affiliation, error: affiliationError } = await supabase
      .from('doctor_hospital_affiliations')
      .select('doctor_id')
      .eq('doctor_id', doctorId)
      .eq('hospital_id', hospitalId)
      .eq('status', 'accepted')
      .maybeSingle();
    if (affiliationError || !affiliation) {
      return res.status(400).json({
        error: { message: 'The doctor is not active at this hospital', code: 'AFFILIATION_NOT_ACTIVE' }
      });
    }

    const date = indiaDateKey(requestedTime);
    const availability = await getAvailableSlotsForDate(doctorId, date);
    const requestedSlot = availability.slots.find(slot =>
      slot.hospitalId === hospitalId &&
      new Date(slot.time).getTime() === requestedTime.getTime()
    );
    if (!requestedSlot) {
      return res.status(409).json({
        error: {
          message: 'This appointment slot is no longer available. Choose another time.',
          code: 'SLOT_NOT_AVAILABLE'
        }
      });
    }

    const basePayload = {
      patient_id: req.user.id,
      doctor_id: doctorId,
      hospital_id: hospitalId,
      appointment_time: appointmentTime,
      symptom_query: symptomQuery?.trim() || null,
      status: 'booked'
    };

    // Keep the API operational before migration 10 is applied, while preferring
    // the dedicated column whenever the database has it.
    let { data: newAppointment, error } = await supabase
      .from('appointments')
      .insert({ ...basePayload, appointment_type: appointmentType })
      .select('*')
      .single();

    if (isMissingAppointmentTypeColumn(error)) {
      const compatibilityPayload = {
        ...basePayload,
        symptom_query: appointmentType === 'emergency'
          ? `${EMERGENCY_SYMPTOM_PREFIX}${basePayload.symptom_query}`
          : basePayload.symptom_query
      };
      ({ data: newAppointment, error } = await supabase
        .from('appointments')
        .insert(compatibilityPayload)
        .select('*')
        .single());
    }

    if (error) {
      // Catch unique index lock conflict (Postgres code 23505)
      if (error.code === '23505') {
        return res.status(409).json({
          error: {
            message: 'This appointment slot is no longer available. It was just booked by another patient.',
            code: 'SLOT_ALREADY_BOOKED'
          }
        });
      }
      return res.status(400).json({
        error: { message: error.message || 'Failed to book appointment', code: 'DB_ERROR' }
      });
    }

    // Trigger booking notifications (Email + SMS to Patient)
    (async () => {
      try {
        const { data: patient } = await supabase.from('users').select('full_name, email, phone').eq('id', req.user.id).single();
        const { data: doctor } = await supabase.from('users').select('full_name').eq('id', doctorId).single();
        const { data: hospital } = await supabase.from('hospitals').select('name, address').eq('id', hospitalId).single();

        if (patient) {
          const appointmentTimeFormatted = new Date(appointmentTime).toLocaleString();
          const locationText = hospital?.address ? `${hospital.name}, ${hospital.address}` : (hospital?.name || 'clinic');
          const priorityText = appointmentType === 'emergency' ? 'Emergency priority ' : '';
          const body = `${priorityText}in-person appointment with ${doctor?.full_name || 'your practitioner'} at ${locationText} is confirmed for ${appointmentTimeFormatted}. Please arrive at the facility for your visit; Swasthya Sarthi does not provide a video consultation.`;
          
          sendSMS(req.user.id, patient.phone, body, 'booking_confirmed');
          sendEmail(req.user.id, patient.email, 'In-person Appointment Confirmed', `<p>${body}</p>`, 'booking_confirmed');
        }
      } catch (err) {
        console.error('[NOTIFICATION TRIGGER ERROR] Booking trigger failed:', err);
      }
    })();

    return res.status(201).json({
      message: appointmentType === 'emergency'
        ? 'Emergency priority appointment booked successfully'
        : 'Appointment booked successfully',
      appointment: {
        ...newAppointment,
        appointmentType,
        visitType: 'in_person'
      }
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error booking appointment', code: 'INTERNAL_ERROR' }
    });
  }
});

// GET /api/appointments/patient
// Lists all appointments booked by the authenticated patient
router.get('/appointments/patient', authenticateUser, requireRole('patient'), async (req, res) => {
  try {
    const appointmentFields = `
        id,
        appointment_time,
        status,
        symptom_query,
        doctor:users!doctor_id (
          id,
          full_name,
          doctor_profiles!user_id (
            specialization:specializations!specialization_id (
              name
            )
          )
        ),
        hospital:hospitals!hospital_id (
          id,
          name,
          address
        ),
        consultation_notes(
          notes,
          prescription
        ),
        reviews(
          rating,
          comment
        )
      `;
    const patientAppointmentsQuery = includeType => supabase
      .from('appointments')
      .select(includeType ? `appointment_type,${appointmentFields}` : appointmentFields)
      .eq('patient_id', req.user.id)
      .order('appointment_time', { ascending: false });

    let { data: appointments, error } = await patientAppointmentsQuery(true);
    if (isMissingAppointmentTypeColumn(error)) {
      ({ data: appointments, error } = await patientAppointmentsQuery(false));
    }

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to retrieve appointments list', code: 'DB_ERROR' }
      });
    }

    const formattedList = (appointments || [])
      .filter(app => !hideDevelopmentDoctor(app.doctor) && !hideDevelopmentHospital(app.hospital))
      .map(app => ({
      id: app.id,
      appointmentTime: app.appointment_time,
      status: app.status,
      appointmentType: appointmentTypeFor(app),
      visitType: 'in_person',
      symptomQuery: cleanSymptomQuery(app.symptom_query),
      doctor: app.doctor ? {
        id: app.doctor.id,
        fullName: app.doctor.full_name,
        specialization: app.doctor.doctor_profiles?.specialization?.name || 'General Practitioner'
      } : null,
      hospital: app.hospital ? {
        id: app.hospital.id,
        name: app.hospital.name,
        address: app.hospital.address
      } : null,
      notes: app.consultation_notes && app.consultation_notes.length > 0 ? {
        notes: app.consultation_notes[0].notes,
        prescription: app.consultation_notes[0].prescription
      } : null,
      review: app.reviews && app.reviews.length > 0 ? {
        rating: app.reviews[0].rating,
        reviewText: app.reviews[0].comment
      } : null
      }));

    return res.status(200).json({
      appointments: formattedList
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error retrieving patient history', code: 'INTERNAL_ERROR' }
    });
  }
});

// POST /api/appointments/:id/notes
// Doctor completes an in-person visit by writing notes and prescription
router.post('/appointments/:id/notes', authenticateUser, requireRole('doctor'), async (req, res) => {
  const { id: appointmentId } = req.params;
  const { notes, prescription } = req.body;

  if (!notes || !String(notes).trim()) {
    return res.status(400).json({
      error: { message: 'Clinical notes are required', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    // 1. Fetch the appointment to verify that it belongs to the logged-in doctor
    const { data: appointment, error: fetchError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single();

    if (fetchError || !appointment) {
      return res.status(404).json({
        error: { message: 'Appointment not found', code: 'NOT_FOUND' }
      });
    }

    if (appointment.doctor_id !== req.user.id) {
      return res.status(403).json({
        error: { message: 'Access denied: You can only complete your own appointments', code: 'FORBIDDEN' }
      });
    }

    if (appointment.status !== 'booked') {
      return res.status(400).json({
        error: { message: 'Only booked appointments can be completed', code: 'INVALID_STATUS' }
      });
    }

    // 2. Insert clinical visit notes
    const { error: notesError } = await supabase
      .from('consultation_notes')
      .insert({
        appointment_id: appointmentId,
        doctor_id: req.user.id,
        notes: notes || '',
        prescription: prescription || ''
      });

    if (notesError) {
      return res.status(400).json({
        error: { message: notesError.message || 'Failed to save visit notes', code: 'DB_ERROR' }
      });
    }

    // 3. Mark appointment as completed
    const { error: updateError } = await supabase
      .from('appointments')
      .update({ status: 'completed' })
      .eq('id', appointmentId);

    if (updateError) {
      return res.status(400).json({
        error: { message: updateError.message || 'Failed to complete appointment status', code: 'DB_ERROR' }
      });
    }

    return res.status(200).json({
      message: 'In-person visit notes saved and appointment status updated to completed'
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error completing appointment', code: 'INTERNAL_ERROR' }
    });
  }
});

// PATCH /api/appointments/:id
// Cancels an appointment (accessible by patient or doctor)
router.patch('/appointments/:id', authenticateUser, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (status !== 'cancelled') {
    return res.status(400).json({
      error: { message: 'Only cancel operations are supported on this endpoint', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    // 1. Fetch appointment details to verify ownership
    const { data: appointment, error: fetchError } = await supabase
      .from('appointments')
      .select(`
        *,
        patient:users!patient_id (full_name, email, phone),
        doctor:users!doctor_id (full_name, email, phone),
        hospital:hospitals!hospital_id (name)
      `)
      .eq('id', id)
      .single();

    if (fetchError || !appointment) {
      return res.status(404).json({
        error: { message: 'Appointment not found', code: 'NOT_FOUND' }
      });
    }

    // Must be either the patient or the doctor
    if (req.user.id !== appointment.patient_id && req.user.id !== appointment.doctor_id) {
      return res.status(403).json({
        error: { message: 'Access denied: Unauthorized to cancel this appointment', code: 'FORBIDDEN' }
      });
    }

    if (appointment.status !== 'booked') {
      return res.status(400).json({
        error: { message: 'Only booked appointments can be cancelled', code: 'INVALID_STATUS' }
      });
    }

    // 2. Update status to 'cancelled'
    const { error: updateError } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (updateError) {
      return res.status(400).json({
        error: { message: updateError.message || 'Failed to cancel appointment', code: 'DB_ERROR' }
      });
    }

    // 3. Trigger Cancelled notifications (Email + SMS to Patient and Doctor)
    // Non-blocking background triggers
    (async () => {
      try {
        const appointmentTimeFormatted = new Date(appointment.appointment_time).toLocaleString();
        
        // Notify Patient
        const patientBody = `Your appointment with ${appointment.doctor?.full_name} at ${appointment.hospital?.name} on ${appointmentTimeFormatted} has been cancelled.`;
        sendSMS(appointment.patient_id, appointment.patient?.phone, patientBody, 'cancelled');
        sendEmail(appointment.patient_id, appointment.patient?.email, 'Appointment Cancelled', `<p>${patientBody}</p>`, 'cancelled');

        // Notify Doctor
        const doctorBody = `The appointment with patient ${appointment.patient?.full_name} at ${appointment.hospital?.name} on ${appointmentTimeFormatted} has been cancelled.`;
        sendSMS(appointment.doctor_id, appointment.doctor?.phone, doctorBody, 'cancelled');
        sendEmail(appointment.doctor_id, appointment.doctor?.email, 'Appointment Cancelled', `<p>${doctorBody}</p>`, 'cancelled');
      } catch (err) {
        console.error('[NOTIFICATION TRIGGER ERROR] Cancellation trigger failed:', err);
      }
    })();

    return res.status(200).json({
      message: 'Appointment cancelled successfully'
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error cancelling appointment', code: 'INTERNAL_ERROR' }
    });
  }
});

// POST /api/appointments/:id/review
// Patient submits a rating and review for a completed appointment
router.post('/appointments/:id/review', authenticateUser, requireRole('patient'), async (req, res) => {
  const { id: appointmentId } = req.params;
  const { rating, reviewText } = req.body;

  const parsedRating = parseInt(rating, 10);
  if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return res.status(400).json({
      error: { message: 'Rating must be an integer between 1 and 5', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    // 1. Fetch appointment details to verify ownership and completion state
    const { data: appointment, error: appError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single();

    if (appError || !appointment) {
      return res.status(404).json({
        error: { message: 'Appointment not found', code: 'NOT_FOUND' }
      });
    }

    if (appointment.patient_id !== req.user.id) {
      return res.status(403).json({
        error: { message: 'Access denied: You can only review your own appointments', code: 'FORBIDDEN' }
      });
    }

    if (appointment.status !== 'completed') {
      return res.status(400).json({
        error: { message: 'Only completed appointments can be rated and reviewed', code: 'INVALID_STATUS' }
      });
    }

    // 2. Check if a review already exists for this appointment
    const { data: existingReview, error: reviewCheckError } = await supabase
      .from('reviews')
      .select('id')
      .eq('appointment_id', appointmentId)
      .maybeSingle();

    if (existingReview) {
      return res.status(400).json({
        error: { message: 'You have already submitted a review for this appointment', code: 'DUPLICATE_REVIEW' }
      });
    }

    // 3. Insert review
    const { error: insertError } = await supabase
      .from('reviews')
      .insert({
        appointment_id: appointmentId,
        patient_id: req.user.id,
        doctor_id: appointment.doctor_id,
        rating: parsedRating,
        comment: reviewText || ''
      });

    if (insertError) {
      return res.status(400).json({
        error: { message: insertError.message || 'Failed to submit review', code: 'DB_ERROR' }
      });
    }

    // 4. Recalculate average rating and count for this doctor
    const { data: reviews, error: calcError } = await supabase
      .from('reviews')
      .select('rating')
      .eq('doctor_id', appointment.doctor_id);

    if (!calcError && reviews) {
      const count = reviews.length;
      const average = reviews.reduce((sum, r) => sum + r.rating, 0) / count;

      // Update doctor profiles rating cache
      await supabase
        .from('doctor_profiles')
        .update({
          rating_avg: parseFloat(average.toFixed(2)),
          rating_count: count
        })
        .eq('user_id', appointment.doctor_id);
    }

    return res.status(201).json({
      message: 'Review submitted and doctor rating updated successfully'
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error submitting review', code: 'INTERNAL_ERROR' }
    });
  }
});

export default router;
