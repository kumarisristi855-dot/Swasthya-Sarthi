import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticateUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  appointmentTypeFor,
  cleanSymptomQuery,
  isMissingAppointmentTypeColumn
} from '../services/booking/appointmentPriority.js';
import { sendEmail, sendSMS } from '../services/notifications/index.js';

const router = Router();

// Middleware checking doctor ownership boundary
const verifyDoctorSelf = (req, res, next) => {
  const { id } = req.params;
  if (req.user.id !== id) {
    return res.status(403).json({
      error: { message: 'Access denied: You are not authorized to manage other practitioners details', code: 'FORBIDDEN' }
    });
  }
  next();
};

// ==========================================
// APPOINTMENTS QUEUE ROUTE
// ==========================================

// GET /api/doctors/:id/appointments/today
// Returns today's appointments queue for this doctor (patient name, time, status)
router.get('/doctors/:id/appointments/today', authenticateUser, requireRole('doctor'), verifyDoctorSelf, async (req, res) => {
  const { id: doctorId } = req.params;

  try {
    // The platform currently operates on India-local clinic dates.
    const now = new Date();
    const dateParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now);
    const values = Object.fromEntries(dateParts.map(part => [part.type, part.value]));
    const todayStr = `${values.year}-${values.month}-${values.day}`;
    const startOfToday = new Date(`${todayStr}T00:00:00+05:30`);
    const endOfToday = new Date(`${todayStr}T23:59:59.999+05:30`);

    const queueFields = `
        id,
        appointment_time,
        status,
        symptom_query,
        patient:users!patient_id (
          id,
          full_name,
          email,
          phone
        ),
        hospital:hospitals!hospital_id (
          id,
          name
        )
      `;
    const queueQuery = includeType => supabase
      .from('appointments')
      .select(includeType ? `appointment_type,${queueFields}` : queueFields)
      .eq('doctor_id', doctorId)
      .gte('appointment_time', startOfToday.toISOString())
      .lte('appointment_time', endOfToday.toISOString())
      .order('appointment_time', { ascending: true });

    let { data: appointments, error } = await queueQuery(true);
    if (isMissingAppointmentTypeColumn(error)) {
      ({ data: appointments, error } = await queueQuery(false));
    }

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to fetch appointments queue', code: 'DB_ERROR' }
      });
    }

    const formattedQueue = (appointments || []).map(app => ({
      id: app.id,
      appointmentTime: app.appointment_time,
      status: app.status,
      appointmentType: appointmentTypeFor(app),
      visitType: 'in_person',
      symptomQuery: cleanSymptomQuery(app.symptom_query),
      patient: app.patient ? {
        id: app.patient.id,
        fullName: app.patient.full_name,
        email: app.patient.email,
        phone: app.patient.phone
      } : null,
      hospital: app.hospital ? {
        id: app.hospital.id,
        name: app.hospital.name
      } : null
    }));

    return res.status(200).json({
      appointments: formattedQueue
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error fetching queue', code: 'INTERNAL_ERROR' }
    });
  }
});

// GET /api/doctors/:id/patients/:patientId/history
// Lets a doctor review appointment history for patients who have booked with them
router.get('/doctors/:id/patients/:patientId/history', authenticateUser, requireRole('doctor'), verifyDoctorSelf, async (req, res) => {
  const { id: doctorId, patientId } = req.params;

  try {
    const { data: relationship, error: relationshipError } = await supabase
      .from('appointments')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientId)
      .limit(1);

    if (relationshipError) {
      return res.status(400).json({
        error: { message: relationshipError.message || 'Failed to verify patient relationship', code: 'DB_ERROR' }
      });
    }

    if (!relationship || relationship.length === 0) {
      return res.status(403).json({
        error: { message: 'Access denied: Patient has no appointments with this doctor', code: 'FORBIDDEN' }
      });
    }

    const historyFields = `
        id,
        appointment_time,
        status,
        symptom_query,
        hospital:hospitals!hospital_id (
          name,
          address
        ),
        consultation_notes (
          notes,
          prescription,
          created_at
        )
      `;
    const historyQuery = includeType => supabase
      .from('appointments')
      .select(includeType ? `appointment_type,${historyFields}` : historyFields)
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientId)
      .order('appointment_time', { ascending: false });

    let { data: appointments, error } = await historyQuery(true);
    if (isMissingAppointmentTypeColumn(error)) {
      ({ data: appointments, error } = await historyQuery(false));
    }

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to fetch patient history', code: 'DB_ERROR' }
      });
    }

    return res.status(200).json({
      history: (appointments || []).map(app => ({
        id: app.id,
        appointmentTime: app.appointment_time,
        status: app.status,
        appointmentType: appointmentTypeFor(app),
        visitType: 'in_person',
        symptomQuery: cleanSymptomQuery(app.symptom_query),
        hospital: app.hospital,
        notes: app.consultation_notes || []
      }))
    });
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error fetching patient history', code: 'INTERNAL_ERROR' }
    });
  }
});

// ==========================================
// AVAILABILITY MANAGEMENT ROUTES
// ==========================================

// GET /api/doctors/:id/hospitals
// Lists accepted hospital affiliations for the authenticated doctor.
router.get('/doctors/:id/hospitals', authenticateUser, requireRole('doctor'), verifyDoctorSelf, async (req, res) => {
  const { id: doctorId } = req.params;

  try {
    const { data, error } = await supabase
      .from('doctor_hospital_affiliations')
      .select(`
        id,
        hospital_id,
        hospital:hospitals!hospital_id (
          id,
          name,
          address
        )
      `)
      .eq('doctor_id', doctorId)
      .eq('status', 'accepted');

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to load hospital affiliations', code: 'DB_ERROR' }
      });
    }

    return res.status(200).json({
      hospitals: (data || []).filter(row => row.hospital).map(row => ({
        associationId: row.id,
        id: row.hospital.id,
        name: row.hospital.name,
        address: row.hospital.address
      }))
    });
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error loading affiliations', code: 'INTERNAL_ERROR' }
    });
  }
});

// GET /api/doctors/:id/availability
// Lists recurring availability slot rules
router.get('/doctors/:id/availability', authenticateUser, requireRole('doctor'), verifyDoctorSelf, async (req, res) => {
  const { id: doctorId } = req.params;

  try {
    const { data: availability, error } = await supabase
      .from('doctor_availability')
      .select(`
        id,
        day_of_week,
        start_time,
        end_time,
        slot_duration_minutes,
        hospital_id,
        hospital:hospitals!hospital_id (
          name
        )
      `)
      .eq('doctor_id', doctorId)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to fetch availability rules', code: 'DB_ERROR' }
      });
    }

    const list = (availability || []).map(avail => ({
      id: avail.id,
      dayOfWeek: avail.day_of_week,
      startTime: avail.start_time,
      endTime: avail.end_time,
      slotDurationMinutes: avail.slot_duration_minutes,
      hospitalId: avail.hospital_id,
      hospitalName: avail.hospital?.name || 'Unknown Hospital'
    }));

    return res.status(200).json({
      availability: list
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error fetching availability rules', code: 'INTERNAL_ERROR' }
    });
  }
});

// POST /api/doctors/:id/availability
// Adds a new recurring weekly schedule block
router.post('/doctors/:id/availability', authenticateUser, requireRole('doctor'), verifyDoctorSelf, async (req, res) => {
  const { id: doctorId } = req.params;
  const { hospitalId, dayOfWeek, startTime, endTime, slotDurationMinutes } = req.body;

  if (hospitalId === undefined || dayOfWeek === undefined || !startTime || !endTime) {
    return res.status(400).json({
      error: { message: 'Hospital ID, day of week, start time, and end time are required', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    const parsedDay = Number.parseInt(dayOfWeek, 10);
    const parsedDuration = slotDurationMinutes ? Number.parseInt(slotDurationMinutes, 10) : 15;
    if (
      !Number.isInteger(parsedDay) ||
      parsedDay < 0 ||
      parsedDay > 6 ||
      !/^\d{2}:\d{2}(:\d{2})?$/.test(startTime) ||
      !/^\d{2}:\d{2}(:\d{2})?$/.test(endTime) ||
      startTime >= endTime ||
      ![15, 30, 45, 60].includes(parsedDuration)
    ) {
      return res.status(400).json({
        error: { message: 'Enter a valid day, time range, and slot duration', code: 'VALIDATION_ERROR' }
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
      return res.status(403).json({
        error: { message: 'An accepted hospital affiliation is required', code: 'FORBIDDEN' }
      });
    }

    const { data: existing, error: existingError } = await supabase
      .from('doctor_availability')
      .select('start_time, end_time')
      .eq('doctor_id', doctorId)
      .eq('hospital_id', hospitalId)
      .eq('day_of_week', parsedDay);
    if (existingError) throw existingError;
    const overlaps = (existing || []).some(rule =>
      startTime < rule.end_time && endTime > rule.start_time
    );
    if (overlaps) {
      return res.status(409).json({
        error: { message: 'This schedule overlaps an existing availability block', code: 'SCHEDULE_OVERLAP' }
      });
    }

    // Create recurring rule
    const { data: newAvail, error } = await supabase
      .from('doctor_availability')
      .insert({
        doctor_id: doctorId,
        hospital_id: hospitalId,
        day_of_week: parsedDay,
        start_time: startTime,
        end_time: endTime,
        slot_duration_minutes: parsedDuration
      })
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to create availability rule', code: 'DB_ERROR' }
      });
    }

    return res.status(201).json({
      message: 'Weekly availability rule added successfully',
      availability: newAvail
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error creating availability', code: 'INTERNAL_ERROR' }
    });
  }
});

// DELETE /api/doctors/:id/availability/:availId
// Deletes a recurring weekly schedule block
router.delete('/doctors/:id/availability/:availId', authenticateUser, requireRole('doctor'), verifyDoctorSelf, async (req, res) => {
  const { id: doctorId, availId } = req.params;

  try {
    // Delete rule
    const { error } = await supabase
      .from('doctor_availability')
      .delete()
      .eq('id', availId)
      .eq('doctor_id', doctorId);

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to delete availability rule', code: 'DB_ERROR' }
      });
    }

    return res.status(200).json({
      message: 'Weekly availability rule deleted successfully'
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error deleting availability', code: 'INTERNAL_ERROR' }
    });
  }
});

// ==========================================
// TIME-OFF MANAGEMENT ROUTES
// ==========================================

// GET /api/doctors/:id/time-off
// Lists future time-off blocks
router.get('/doctors/:id/time-off', authenticateUser, requireRole('doctor'), verifyDoctorSelf, async (req, res) => {
  const { id: doctorId } = req.params;

  try {
    const { data: timeOff, error } = await supabase
      .from('doctor_time_off')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('start_datetime', { ascending: true });

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to retrieve time-off list', code: 'DB_ERROR' }
      });
    }

    return res.status(200).json({
      timeOff
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error fetching time-offs', code: 'INTERNAL_ERROR' }
    });
  }
});

// POST /api/doctors/:id/time-off
// Registers a new one-off time-off range
router.post('/doctors/:id/time-off', authenticateUser, requireRole('doctor'), verifyDoctorSelf, async (req, res) => {
  const { id: doctorId } = req.params;
  const { startDatetime, endDatetime, reason } = req.body;

  if (!startDatetime || !endDatetime) {
    return res.status(400).json({
      error: { message: 'Start datetime and end datetime are required', code: 'VALIDATION_ERROR' }
    });
  }

  if (new Date(startDatetime).getTime() >= new Date(endDatetime).getTime()) {
    return res.status(400).json({
      error: { message: 'End time must be strictly after start time', code: 'VALIDATION_ERROR' }
    });
  }

  if (
    Number.isNaN(new Date(startDatetime).getTime()) ||
    Number.isNaN(new Date(endDatetime).getTime()) ||
    new Date(endDatetime).getTime() <= Date.now()
  ) {
    return res.status(400).json({
      error: { message: 'Time off must end in the future and use valid dates', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    const { data: conflictingAppointments, error: conflictError } = await supabase
      .from('appointments')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('status', 'booked')
      .gte('appointment_time', new Date(startDatetime).toISOString())
      .lt('appointment_time', new Date(endDatetime).toISOString())
      .limit(1);

    if (conflictError) {
      return res.status(400).json({
        error: { message: conflictError.message || 'Failed to check booked appointments', code: 'DB_ERROR' }
      });
    }

    if (conflictingAppointments?.length) {
      return res.status(409).json({
        error: {
          message: 'This leave period contains a booked appointment. Reschedule or cancel that appointment first.',
          code: 'LEAVE_HAS_BOOKINGS'
        }
      });
    }

    const { data: newTimeOff, error } = await supabase
      .from('doctor_time_off')
      .insert({
        doctor_id: doctorId,
        start_datetime: startDatetime,
        end_datetime: endDatetime,
        reason: reason || ''
      })
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to create time-off record', code: 'DB_ERROR' }
      });
    }

    return res.status(201).json({
      message: 'Time-off range registered successfully',
      timeOff: newTimeOff
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error creating time-off', code: 'INTERNAL_ERROR' }
    });
  }
});

// POST /api/doctors/:id/emergency-leave
// Immediately blocks the doctor and cancels affected appointments after explicit UI confirmation.
router.post('/doctors/:id/emergency-leave', authenticateUser, requireRole('doctor'), verifyDoctorSelf, async (req, res) => {
  const { id: doctorId } = req.params;
  const { endDatetime, reason } = req.body;
  const start = new Date();
  const end = new Date(endDatetime);
  const maximumEnd = start.getTime() + 7 * 24 * 60 * 60 * 1000;

  if (
    Number.isNaN(end.getTime()) ||
    end.getTime() <= start.getTime() + 5 * 60 * 1000 ||
    end.getTime() > maximumEnd
  ) {
    return res.status(400).json({
      error: { message: 'Emergency leave must end between 5 minutes and 7 days from now', code: 'VALIDATION_ERROR' }
    });
  }

  if (String(reason || '').trim().length < 3) {
    return res.status(400).json({
      error: { message: 'Add a short reason for the emergency leave', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    const { data: doctor, error: doctorError } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', doctorId)
      .single();
    if (doctorError) throw doctorError;

    const { data: affectedAppointments, error: appointmentError } = await supabase
      .from('appointments')
      .select(`
        id,
        appointment_time,
        patient_id,
        patient:users!patient_id (full_name, email, phone),
        hospital:hospitals!hospital_id (name, address)
      `)
      .eq('doctor_id', doctorId)
      .eq('status', 'booked')
      .gte('appointment_time', start.toISOString())
      .lt('appointment_time', end.toISOString());
    if (appointmentError) throw appointmentError;

    const { data: leave, error: leaveError } = await supabase
      .from('doctor_time_off')
      .insert({
        doctor_id: doctorId,
        start_datetime: start.toISOString(),
        end_datetime: end.toISOString(),
        reason: String(reason).trim()
      })
      .select('*')
      .single();
    if (leaveError) throw leaveError;

    const appointmentIds = (affectedAppointments || []).map(appointment => appointment.id);
    if (appointmentIds.length) {
      const { error: cancellationError } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .in('id', appointmentIds);

      if (cancellationError) {
        await supabase.from('doctor_time_off').delete().eq('id', leave.id).eq('doctor_id', doctorId);
        throw cancellationError;
      }
    }

    Promise.allSettled((affectedAppointments || []).flatMap(appointment => {
      const appointmentTime = new Date(appointment.appointment_time).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short'
      });
      const location = appointment.hospital?.address
        ? `${appointment.hospital.name}, ${appointment.hospital.address}`
        : (appointment.hospital?.name || 'the clinic');
      const message = `Swasthya Sarthi update: Your ${appointmentTime} appointment with ${doctor.full_name} at ${location} was cancelled because the doctor is on emergency leave. Please rebook another available slot.`;
      return [
        sendSMS(appointment.patient_id, appointment.patient?.phone, message, 'emergency_leave_cancellation', { appointmentId: appointment.id }),
        sendEmail(appointment.patient_id, appointment.patient?.email, 'Appointment cancelled - doctor emergency leave', `<p>${message}</p>`, 'emergency_leave_cancellation', { appointmentId: appointment.id })
      ];
    })).catch(error => console.error('[EMERGENCY LEAVE NOTIFICATION ERROR]', error));

    return res.status(201).json({
      message: appointmentIds.length
        ? `Emergency leave applied and ${appointmentIds.length} affected appointment${appointmentIds.length === 1 ? '' : 's'} cancelled`
        : 'Emergency leave applied. No booked appointments were affected.',
      timeOff: leave,
      cancelledAppointments: appointmentIds.length
    });
  } catch (error) {
    return res.status(500).json({
      error: { message: error.message || 'Failed to apply emergency leave', code: 'INTERNAL_ERROR' }
    });
  }
});

// DELETE /api/doctors/:id/time-off/:timeOffId
// Deletes a registered time-off range
router.delete('/doctors/:id/time-off/:timeOffId', authenticateUser, requireRole('doctor'), verifyDoctorSelf, async (req, res) => {
  const { id: doctorId, timeOffId } = req.params;

  try {
    const { error } = await supabase
      .from('doctor_time_off')
      .delete()
      .eq('id', timeOffId)
      .eq('doctor_id', doctorId);

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to delete time-off block', code: 'DB_ERROR' }
      });
    }

    return res.status(200).json({
      message: 'Time-off block deleted successfully'
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error deleting time-off', code: 'INTERNAL_ERROR' }
    });
  }
});

export default router;
