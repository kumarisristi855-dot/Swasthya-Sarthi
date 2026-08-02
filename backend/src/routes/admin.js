import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { supabase } from '../lib/supabase.js';
import { authenticateUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { sendSMS, sendEmail } from '../services/notifications/index.js';
import {
  appointmentTypeFor,
  cleanSymptomQuery,
  isMissingAppointmentTypeColumn
} from '../services/booking/appointmentPriority.js';

const router = Router();

// Middleware helper to verify that the logged-in admin owns the hospital
const verifyAdminHospital = async (req, res, next) => {
  const { id: hospitalId } = req.params;

  try {
    const { data: hospital, error } = await supabase
      .from('hospitals')
      .select('admin_id')
      .eq('id', hospitalId)
      .single();

    if (error || !hospital) {
      return res.status(404).json({
        error: { message: 'Hospital not found', code: 'NOT_FOUND' }
      });
    }

    if (hospital.admin_id !== req.user.id) {
      return res.status(403).json({
        error: { message: 'You are not authorized to manage this hospital', code: 'FORBIDDEN' }
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({
      error: { message: 'Internal server error during authorization', code: 'INTERNAL_ERROR' }
    });
  }
};

// ==========================================
// ADMIN ONBOARDING ROUTES
// ==========================================

// Create a doctor account and attach it directly to this hospital.
router.post('/hospitals/:id/doctors/manual', authenticateUser, requireRole('hospital_admin'), verifyAdminHospital, async (req, res) => {
  const { id: hospitalId } = req.params;
  const {
    fullName,
    email,
    phone,
    specializationId,
    licenseNo,
    yearsExperience,
    consultationFee,
    bio,
    workingDays,
    startTime,
    endTime,
    slotDurationMinutes = 30
  } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const parsedSpecialization = Number.parseInt(specializationId, 10);
  const parsedExperience = Number.parseInt(yearsExperience, 10);
  const parsedFee = Number.parseFloat(consultationFee);
  const parsedDuration = Number.parseInt(slotDurationMinutes, 10);
  const parsedDays = Array.isArray(workingDays) ? [...new Set(workingDays.map(Number))].sort() : [];

  if (
    String(fullName || '').trim().length < 3 ||
    !/^\S+@\S+\.\S+$/.test(normalizedEmail) ||
    String(licenseNo || '').trim().length < 3 ||
    !Number.isInteger(parsedSpecialization) ||
    !Number.isInteger(parsedExperience) || parsedExperience < 0 || parsedExperience > 80 ||
    !Number.isFinite(parsedFee) || parsedFee < 0 ||
    parsedDays.length === 0 || parsedDays.some(day => day < 0 || day > 6) ||
    !/^\d{2}:\d{2}$/.test(startTime || '') ||
    !/^\d{2}:\d{2}$/.test(endTime || '') ||
    startTime >= endTime ||
    ![15, 30, 45, 60].includes(parsedDuration)
  ) {
    return res.status(400).json({
      error: { message: 'Enter valid doctor details, at least one working day, and clinic hours', code: 'VALIDATION_ERROR' }
    });
  }

  let createdAuthUserId = null;
  try {
    const [{ data: existingUser, error: existingError }, { data: specialization, error: specializationError }] = await Promise.all([
      supabase.from('users').select('id,role').eq('email', normalizedEmail).maybeSingle(),
      supabase.from('specializations').select('id,name').eq('id', parsedSpecialization).maybeSingle()
    ]);
    if (existingError) throw existingError;
    if (specializationError) throw specializationError;
    if (existingUser) {
      return res.status(409).json({
        error: { message: 'An account already uses this email. Invite that doctor instead.', code: 'ACCOUNT_EXISTS' }
      });
    }
    if (!specialization) {
      return res.status(400).json({
        error: { message: 'Selected specialization does not exist', code: 'INVALID_SPECIALIZATION' }
      });
    }

    const temporaryPassword = `${randomBytes(9).toString('base64url')}aA1!`;
    const { data: authResult, error: authError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: String(fullName).trim(), role: 'doctor', must_change_password: true }
    });
    if (authError) throw authError;
    createdAuthUserId = authResult.user.id;

    const { error: userError } = await supabase.from('users').insert({
      id: createdAuthUserId,
      email: normalizedEmail,
      role: 'doctor',
      full_name: String(fullName).trim(),
      phone: String(phone || '').trim() || null
    });
    if (userError) throw userError;

    const { error: profileError } = await supabase.from('doctor_profiles').insert({
      user_id: createdAuthUserId,
      specialization_id: parsedSpecialization,
      license_no: String(licenseNo).trim(),
      years_experience: parsedExperience,
      consultation_fee: parsedFee,
      bio: String(bio || '').trim() || null,
      status: 'active'
    });
    if (profileError) throw profileError;

    const { error: affiliationError } = await supabase.from('doctor_hospital_affiliations').insert({
      doctor_id: createdAuthUserId,
      hospital_id: hospitalId,
      invited_by: req.user.id,
      status: 'accepted',
      specialization_id: parsedSpecialization,
      consultation_fee: parsedFee,
      working_days: parsedDays,
      start_time: startTime,
      end_time: endTime,
      updated_at: new Date().toISOString()
    });
    if (affiliationError) throw affiliationError;

    const { error: availabilityError } = await supabase.from('doctor_availability').insert(
      parsedDays.map(day => ({
        doctor_id: createdAuthUserId,
        hospital_id: hospitalId,
        day_of_week: day,
        start_time: startTime,
        end_time: endTime,
        slot_duration_minutes: parsedDuration
      }))
    );
    if (availabilityError) throw availabilityError;

    return res.status(201).json({
      message: 'Doctor account created and added to the hospital',
      doctor: {
        id: createdAuthUserId,
        fullName: String(fullName).trim(),
        email: normalizedEmail,
        specialization: specialization.name
      },
      temporaryPassword
    });
  } catch (error) {
    if (createdAuthUserId) {
      await supabase.from('doctor_availability').delete().eq('doctor_id', createdAuthUserId);
      await supabase.from('doctor_hospital_affiliations').delete().eq('doctor_id', createdAuthUserId);
      await supabase.from('doctor_profiles').delete().eq('user_id', createdAuthUserId);
      await supabase.from('users').delete().eq('id', createdAuthUserId);
      await supabase.auth.admin.deleteUser(createdAuthUserId);
    }
    return res.status(500).json({
      error: { message: error.message || 'Failed to create doctor account', code: 'INTERNAL_ERROR' }
    });
  }
});

// Invite a doctor to the hospital by email
router.post('/hospitals/:id/doctors/invite', authenticateUser, requireRole('hospital_admin'), verifyAdminHospital, async (req, res) => {
  const { id: hospitalId } = req.params;
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      error: { message: 'Doctor email is required', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    // 1. Find user by email and verify they are a doctor
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, role')
      .eq('email', email)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        error: { message: 'Doctor with this email is not registered. They must sign up first.', code: 'NOT_FOUND' }
      });
    }

    if (user.role !== 'doctor') {
      return res.status(400).json({
        error: { message: 'This email is not registered as a doctor account', code: 'ROLE_MISMATCH' }
      });
    }

    // 2. Create the affiliation row (invited status)
    const { error: affError } = await supabase
      .from('doctor_hospital_affiliations')
      .insert({
        doctor_id: user.id,
        hospital_id: hospitalId,
        invited_by: req.user.id,
        status: 'invited'
      });

    if (affError) {
      // If already affiliated/invited, handle gracefully
      if (affError.code === '23505') { // unique key violation
        return res.status(400).json({
          error: { message: 'Doctor is already invited to or affiliated with this hospital', code: 'DUPLICATE_AFFILIATION' }
        });
      }
      return res.status(400).json({
        error: { message: affError.message || 'Failed to create invitation', code: 'DB_ERROR' }
      });
    }

    // 3. Trigger invite notification (Email to Doctor)
    (async () => {
      try {
        const { data: hospital } = await supabase.from('hospitals').select('name').eq('id', hospitalId).single();
        const body = `You have been invited to join the medical team at ${hospital?.name || 'our clinic'} as an affiliated doctor. Please sign up or log in to confirm your affiliation.`;
        sendEmail(user.id, email, 'Hospital Affiliation Invitation', `<p>${body}</p>`, 'doctor_invited');
      } catch (err) {
        console.error('[NOTIFICATION TRIGGER ERROR] Invite email failed:', err);
      }
    })();

    return res.status(201).json({
      message: 'Doctor invited successfully',
      affiliation: { doctor_id: user.id, hospital_id: hospitalId, status: 'invited' }
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error during invitation', code: 'INTERNAL_ERROR' }
    });
  }
});

// List doctors awaiting approval for this hospital
router.get('/hospitals/:id/doctors/pending', authenticateUser, requireRole('hospital_admin'), verifyAdminHospital, async (req, res) => {
  const { id: hospitalId } = req.params;

  try {
    // 1. Fetch doctor profiles. The hospital invitation is the pending state;
    // an already-active doctor can still be awaiting approval at a new hospital.
    const { data: profiles, error: profError } = await supabase
      .from('doctor_profiles')
      .select(`
        user_id,
        license_no,
        years_experience,
        bio,
        status,
        users:user_id (id, full_name, email, phone),
        specialization:specializations (name)
      `);

    if (profError) {
      return res.status(400).json({
        error: { message: profError.message || 'Failed to fetch pending doctor profiles', code: 'DB_ERROR' }
      });
    }

    // 2. Fetch affiliations for this hospital with 'invited' status
    const { data: affiliations, error: affError } = await supabase
      .from('doctor_hospital_affiliations')
      .select('doctor_id')
      .eq('hospital_id', hospitalId)
      .eq('status', 'invited');

    if (affError) {
      return res.status(400).json({
        error: { message: affError.message || 'Failed to fetch hospital affiliations', code: 'DB_ERROR' }
      });
    }

    // 3. Filter and map results
    const affDoctorIds = new Set(affiliations.map(a => a.doctor_id));
    const pendingDoctors = profiles
      .filter(p => affDoctorIds.has(p.user_id) && p.users)
      .map(p => ({
        id: p.users.id,
        fullName: p.users.full_name,
        email: p.users.email,
        phone: p.users.phone,
        licenseNo: p.license_no,
        yearsExperience: p.years_experience,
        bio: p.bio,
        specialization: p.specialization?.name || 'General'
      }));

    return res.status(200).json({
      doctors: pendingDoctors
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error fetching pending list', code: 'INTERNAL_ERROR' }
    });
  }
});

// List active doctors affiliated with this hospital for profile/schedule management
router.get('/hospitals/:id/doctors/active', authenticateUser, requireRole('hospital_admin'), verifyAdminHospital, async (req, res) => {
  const { id: hospitalId } = req.params;

  try {
    const { data: affiliations, error } = await supabase
      .from('doctor_hospital_affiliations')
      .select(`
        id,
        doctor_id,
        specialization_id,
        consultation_fee,
        working_days,
        start_time,
        end_time,
        affiliation_specialization:specializations!specialization_id (
          id,
          name
        ),
        doctor:users!doctor_id (
          id,
          full_name,
          email,
          phone,
          doctor_profiles!user_id (
            specialization:specializations!specialization_id (
              id,
              name
            ),
            license_no,
            years_experience,
            consultation_fee,
            status
          )
        )
      `)
      .eq('hospital_id', hospitalId)
      .eq('status', 'accepted');

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to fetch active doctors', code: 'DB_ERROR' }
      });
    }

    const doctors = (affiliations || [])
      .filter(aff => aff.doctor?.doctor_profiles?.status === 'active')
      .map(aff => ({
        associationId: aff.id,
        id: aff.doctor.id,
        fullName: aff.doctor.full_name,
        email: aff.doctor.email,
        phone: aff.doctor.phone,
        licenseNo: aff.doctor.doctor_profiles.license_no,
        yearsExperience: aff.doctor.doctor_profiles.years_experience,
        consultationFee: aff.consultation_fee ?? aff.doctor.doctor_profiles.consultation_fee,
        specializationId: aff.affiliation_specialization?.id ?? aff.doctor.doctor_profiles.specialization?.id,
        specialization: aff.affiliation_specialization?.name ?? aff.doctor.doctor_profiles.specialization?.name ?? 'General Physician',
        workingDays: aff.working_days || [],
        startTime: aff.start_time,
        endTime: aff.end_time
      }));

    return res.status(200).json({ doctors });
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error fetching active doctors', code: 'INTERNAL_ERROR' }
    });
  }
});

// Update hospital-specific doctor profile details.
router.patch('/hospitals/:id/doctors/:doctorId/profile', authenticateUser, requireRole('hospital_admin'), verifyAdminHospital, async (req, res) => {
  const { id: hospitalId, doctorId } = req.params;
  const { specializationId, consultationFee, workingDays, startTime, endTime } = req.body;
  const parsedSpecialization = Number.parseInt(specializationId, 10);
  const parsedFee = Number.parseFloat(consultationFee);
  const parsedDays = Array.isArray(workingDays) ? [...new Set(workingDays.map(Number))] : [];

  if (
    !Number.isInteger(parsedSpecialization) ||
    !Number.isFinite(parsedFee) ||
    parsedFee < 0 ||
    parsedDays.some(day => !Number.isInteger(day) || day < 0 || day > 6) ||
    !startTime ||
    !endTime ||
    startTime >= endTime
  ) {
    return res.status(400).json({
      error: { message: 'Enter a valid specialization, fee, working days, and clinic hours', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    const { data: specialization, error: specializationError } = await supabase
      .from('specializations')
      .select('id')
      .eq('id', parsedSpecialization)
      .maybeSingle();
    if (specializationError || !specialization) {
      return res.status(400).json({
        error: { message: 'Selected specialization does not exist', code: 'INVALID_SPECIALIZATION' }
      });
    }

    const { data, error } = await supabase
      .from('doctor_hospital_affiliations')
      .update({
        specialization_id: parsedSpecialization,
        consultation_fee: parsedFee,
        working_days: parsedDays,
        start_time: startTime,
        end_time: endTime,
        updated_at: new Date().toISOString()
      })
      .eq('doctor_id', doctorId)
      .eq('hospital_id', hospitalId)
      .eq('status', 'accepted')
      .select('id')
      .maybeSingle();

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to update doctor details', code: 'DB_ERROR' }
      });
    }
    if (!data) {
      return res.status(404).json({
        error: { message: 'Active doctor affiliation not found', code: 'NOT_FOUND' }
      });
    }

    return res.status(200).json({ message: 'Doctor details updated successfully' });
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error updating doctor details', code: 'INTERNAL_ERROR' }
    });
  }
});

// Add availability for an active affiliated doctor at this hospital
router.post('/hospitals/:id/doctors/:doctorId/availability', authenticateUser, requireRole('hospital_admin'), verifyAdminHospital, async (req, res) => {
  const { id: hospitalId, doctorId } = req.params;
  const { dayOfWeek, startTime, endTime, slotDurationMinutes } = req.body;

  if (dayOfWeek === undefined || !startTime || !endTime) {
    return res.status(400).json({
      error: { message: 'Day of week, start time, and end time are required', code: 'VALIDATION_ERROR' }
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

    const { data: affiliation, error: affError } = await supabase
      .from('doctor_hospital_affiliations')
      .select('doctor_id')
      .eq('doctor_id', doctorId)
      .eq('hospital_id', hospitalId)
      .eq('status', 'accepted')
      .single();

    if (affError || !affiliation) {
      return res.status(403).json({
        error: { message: 'Doctor is not actively affiliated with this hospital', code: 'FORBIDDEN' }
      });
    }

    const { data: existing, error: existingError } = await supabase
      .from('doctor_availability')
      .select('start_time, end_time')
      .eq('doctor_id', doctorId)
      .eq('hospital_id', hospitalId)
      .eq('day_of_week', parsedDay);
    if (existingError) throw existingError;
    if ((existing || []).some(rule => startTime < rule.end_time && endTime > rule.start_time)) {
      return res.status(409).json({
        error: { message: 'This schedule overlaps an existing availability block', code: 'SCHEDULE_OVERLAP' }
      });
    }

    const { data: newAvailability, error } = await supabase
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
        error: { message: error.message || 'Failed to add doctor availability', code: 'DB_ERROR' }
      });
    }

    return res.status(201).json({
      message: 'Doctor availability added successfully',
      availability: newAvailability
    });
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error adding doctor availability', code: 'INTERNAL_ERROR' }
    });
  }
});

// Remove an availability block owned by this hospital.
router.delete('/hospitals/:id/availability/:availabilityId', authenticateUser, requireRole('hospital_admin'), verifyAdminHospital, async (req, res) => {
  const { id: hospitalId, availabilityId } = req.params;

  try {
    const { data, error } = await supabase
      .from('doctor_availability')
      .delete()
      .eq('id', availabilityId)
      .eq('hospital_id', hospitalId)
      .select('id')
      .maybeSingle();

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to remove availability', code: 'DB_ERROR' }
      });
    }
    if (!data) {
      return res.status(404).json({
        error: { message: 'Availability block not found for this hospital', code: 'NOT_FOUND' }
      });
    }

    return res.status(200).json({ message: 'Availability block removed successfully' });
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error removing availability', code: 'INTERNAL_ERROR' }
    });
  }
});

// Approve a doctor signup and affiliation
router.patch('/hospitals/:id/doctors/:doctorId/approve', authenticateUser, requireRole('hospital_admin'), verifyAdminHospital, async (req, res) => {
  const { id: hospitalId, doctorId } = req.params;

  try {
    // 1. Verify affiliation exists and is 'invited'
    const { data: affiliation, error: affError } = await supabase
      .from('doctor_hospital_affiliations')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('hospital_id', hospitalId)
      .eq('status', 'invited')
      .single();

    if (affError || !affiliation) {
      return res.status(400).json({
        error: { message: 'No pending invitation found for this doctor at this hospital', code: 'AFFILIATION_NOT_FOUND' }
      });
    }

    // 2. Set doctor_profiles.status = 'active'
    const { error: profileError } = await supabase
      .from('doctor_profiles')
      .update({ status: 'active' })
      .eq('user_id', doctorId);

    if (profileError) {
      return res.status(400).json({
        error: { message: profileError.message || 'Failed to activate doctor profile', code: 'DB_ERROR' }
      });
    }

    // 3. Set doctor_hospital_affiliations.status = 'accepted'
    const { error: affUpdateError } = await supabase
      .from('doctor_hospital_affiliations')
      .update({ status: 'accepted' })
      .eq('doctor_id', doctorId)
      .eq('hospital_id', hospitalId);

    if (affUpdateError) {
      // Rollback profile status to pending
      await supabase.from('doctor_profiles').update({ status: 'pending' }).eq('user_id', doctorId);
      return res.status(400).json({
        error: { message: affUpdateError.message || 'Failed to update affiliation status', code: 'DB_ERROR' }
      });
    }

    // 4. Trigger approval notification (Email to Doctor)
    (async () => {
      try {
        const { data: doctor } = await supabase.from('users').select('email').eq('id', doctorId).single();
        const { data: hospital } = await supabase.from('hospitals').select('name').eq('id', hospitalId).single();
        if (doctor) {
          const body = `Your practitioner profile has been approved by the administrators at ${hospital?.name || 'the clinic'} and is now active. You may now set your availability and accept in-person appointment slots.`;
          sendEmail(doctorId, doctor.email, 'Practitioner Access Activated', `<p>${body}</p>`, 'doctor_approved');
        }
      } catch (err) {
        console.error('[NOTIFICATION TRIGGER ERROR] Approval email failed:', err);
      }
    })();

    return res.status(200).json({
      message: 'Doctor approved and activated successfully'
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error during approval', code: 'INTERNAL_ERROR' }
    });
  }
});

// Reject a doctor signup and affiliation
router.patch('/hospitals/:id/doctors/:doctorId/reject', authenticateUser, requireRole('hospital_admin'), verifyAdminHospital, async (req, res) => {
  const { id: hospitalId, doctorId } = req.params;

  try {
    // 1. Verify affiliation exists
    const { data: affiliation, error: affError } = await supabase
      .from('doctor_hospital_affiliations')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('hospital_id', hospitalId)
      .single();

    if (affError || !affiliation) {
      return res.status(400).json({
        error: { message: 'No affiliation record found for this doctor at this hospital', code: 'AFFILIATION_NOT_FOUND' }
      });
    }

    // 2. Revoke only this hospital relationship.
    const { error: affUpdateError } = await supabase
      .from('doctor_hospital_affiliations')
      .update({ status: 'revoked' })
      .eq('doctor_id', doctorId)
      .eq('hospital_id', hospitalId);

    if (affUpdateError) {
      return res.status(400).json({
        error: { message: affUpdateError.message || 'Failed to update affiliation status', code: 'DB_ERROR' }
      });
    }

    // 3. Reject a globally pending profile only when no other hospital has accepted it.
    const { data: profile } = await supabase
      .from('doctor_profiles')
      .select('status')
      .eq('user_id', doctorId)
      .single();
    if (profile?.status === 'pending') {
      const { count } = await supabase
        .from('doctor_hospital_affiliations')
        .select('*', { count: 'exact', head: true })
        .eq('doctor_id', doctorId)
        .eq('status', 'accepted');
      if (!count) {
        await supabase
          .from('doctor_profiles')
          .update({ status: 'rejected' })
          .eq('user_id', doctorId);
      }
    }

    // 4. Trigger rejection notification (Email to Doctor)
    (async () => {
      try {
        const { data: doctor } = await supabase.from('users').select('email').eq('id', doctorId).single();
        const { data: hospital } = await supabase.from('hospitals').select('name').eq('id', hospitalId).single();
        if (doctor) {
          const body = `We regret to inform you that your registration request at ${hospital?.name || 'the clinic'} has been rejected. Please verify your details or contact clinic administration for support.`;
          sendEmail(doctorId, doctor.email, 'Practitioner Registration Update', `<p>${body}</p>`, 'doctor_rejected');
        }
      } catch (err) {
        console.error('[NOTIFICATION TRIGGER ERROR] Rejection email failed:', err);
      }
    })();

    return res.status(200).json({
      message: 'Hospital affiliation rejected successfully'
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error during rejection', code: 'INTERNAL_ERROR' }
    });
  }
});

// GET /api/admin/hospitals/:id/summary
// Dashboard counters for booked patients, upcoming workload, and active doctors
router.get('/hospitals/:id/summary', authenticateUser, requireRole('hospital_admin'), verifyAdminHospital, async (req, res) => {
  const { id: hospitalId } = req.params;

  try {
    const now = new Date();

    const { data: appointments, error: appError } = await supabase
      .from('appointments')
      .select('id, patient_id, status, appointment_time')
      .eq('hospital_id', hospitalId);

    if (appError) {
      return res.status(400).json({
        error: { message: appError.message || 'Failed to load hospital booking summary', code: 'DB_ERROR' }
      });
    }

    const { data: affiliations, error: affError } = await supabase
      .from('doctor_hospital_affiliations')
      .select('doctor_id, status')
      .eq('hospital_id', hospitalId);

    if (affError) {
      return res.status(400).json({
        error: { message: affError.message || 'Failed to load doctor summary', code: 'DB_ERROR' }
      });
    }

    const bookedAppointments = (appointments || []).filter(app => app.status === 'booked');
    const uniqueBookedPatients = new Set(bookedAppointments.map(app => app.patient_id)).size;
    const upcomingBooked = bookedAppointments.filter(app => new Date(app.appointment_time) >= now).length;
    const completedAppointments = (appointments || []).filter(app => app.status === 'completed').length;
    const activeDoctors = (affiliations || []).filter(aff => aff.status === 'accepted').length;
    const pendingDoctors = (affiliations || []).filter(aff => aff.status === 'invited').length;

    return res.status(200).json({
      totalBookedAppointments: bookedAppointments.length,
      totalBookedPatients: uniqueBookedPatients,
      upcomingBooked,
      completedAppointments,
      activeDoctors,
      pendingDoctors
    });
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error loading dashboard summary', code: 'INTERNAL_ERROR' }
    });
  }
});

// PATCH /api/admin/hospitals/:id/appointments/:appointmentId/confirm
// Confirms an existing booked appointment by sending/logging a confirmation notice.
router.patch('/hospitals/:id/appointments/:appointmentId/confirm', authenticateUser, requireRole('hospital_admin'), verifyAdminHospital, async (req, res) => {
  const { id: hospitalId, appointmentId } = req.params;

  try {
    const { data: appointment, error: appError } = await supabase
      .from('appointments')
      .select(`
        id,
        patient_id,
        doctor_id,
        hospital_id,
        appointment_time,
        status,
        patient:users!patient_id (
          full_name,
          email,
          phone
        ),
        doctor:users!doctor_id (
          full_name
        ),
        hospital:hospitals!hospital_id (
          name,
          address
        )
      `)
      .eq('id', appointmentId)
      .eq('hospital_id', hospitalId)
      .single();

    if (appError || !appointment) {
      return res.status(404).json({
        error: { message: 'Appointment not found for this hospital', code: 'NOT_FOUND' }
      });
    }

    if (appointment.status !== 'booked') {
      return res.status(400).json({
        error: { message: 'Only booked appointments can be confirmed', code: 'INVALID_STATUS' }
      });
    }

    const { data: existingConfirmation } = await supabase
      .from('notifications')
      .select('id, sent_at')
      .eq('user_id', appointment.patient_id)
      .eq('type', 'appointment_confirmed')
      .contains('payload', { appointmentId })
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingConfirmation) {
      return res.status(200).json({
        message: 'Appointment was already confirmed',
        alreadyConfirmed: true,
        confirmedAt: existingConfirmation.sent_at
      });
    }

    const appointmentTimeFormatted = new Date(appointment.appointment_time).toLocaleString();
    const locationText = appointment.hospital?.address
      ? `${appointment.hospital.name}, ${appointment.hospital.address}`
      : (appointment.hospital?.name || 'clinic');
    const body = `Confirmed: ${appointment.patient?.full_name || 'your'} appointment with ${appointment.doctor?.full_name || 'your practitioner'} at ${locationText} on ${appointmentTimeFormatted}.`;

    await sendSMS(
      appointment.patient_id,
      appointment.patient?.phone,
      body,
      'appointment_confirmed',
      { appointmentId }
    );
    await sendEmail(appointment.patient_id, appointment.patient?.email, 'Appointment Confirmed', `<p>${body}</p>`, 'appointment_confirmed');

    return res.status(200).json({
      message: 'Appointment confirmation sent successfully',
      confirmedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error confirming appointment', code: 'INTERNAL_ERROR' }
    });
  }
});

// GET /api/admin/hospitals/:id/schedule
// Returns all doctors' upcoming schedules and weekly available blocks for this hospital
router.get('/hospitals/:id/schedule', authenticateUser, requireRole('hospital_admin'), verifyAdminHospital, async (req, res) => {
  const { id: hospitalId } = req.params;

  try {
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));

    // 1. Query upcoming appointments (excluding cancelled)
    const scheduleFields = `
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
        doctor:users!doctor_id (
          id,
          full_name
        )
      `;
    const scheduleQuery = includeType => supabase
      .from('appointments')
      .select(includeType ? `appointment_type,${scheduleFields}` : scheduleFields)
      .eq('hospital_id', hospitalId)
      .neq('status', 'cancelled')
      .gte('appointment_time', startOfToday.toISOString())
      .order('appointment_time', { ascending: true });

    let { data: appointments, error: appError } = await scheduleQuery(true);
    if (isMissingAppointmentTypeColumn(appError)) {
      ({ data: appointments, error: appError } = await scheduleQuery(false));
    }

    if (appError) {
      return res.status(400).json({
        error: { message: appError.message || 'Failed to fetch hospital appointments schedule', code: 'DB_ERROR' }
      });
    }

    // 2. Query weekly available blocks
    const { data: availability, error: availError } = await supabase
      .from('doctor_availability')
      .select(`
        id,
        day_of_week,
        start_time,
        end_time,
        slot_duration_minutes,
        doctor_id,
        doctor:users!doctor_id (
          full_name
        )
      `)
      .eq('hospital_id', hospitalId)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (availError) {
      return res.status(400).json({
        error: { message: availError.message || 'Failed to fetch doctor recurring schedules', code: 'DB_ERROR' }
      });
    }

    const patientIds = [...new Set((appointments || []).map(app => app.patient?.id).filter(Boolean))];
    let confirmationRows = [];
    if (patientIds.length > 0) {
      const confirmationResult = await supabase
        .from('notifications')
        .select('payload, sent_at')
        .eq('type', 'appointment_confirmed')
        .in('user_id', patientIds);
      if (!confirmationResult.error) {
        confirmationRows = confirmationResult.data || [];
      }
    }
    const confirmationByAppointment = new Map(
      confirmationRows
        .filter(row => row.payload?.appointmentId)
        .map(row => [row.payload.appointmentId, row.sent_at])
    );

    const formattedAppointments = (appointments || []).map(app => ({
      id: app.id,
      appointmentTime: app.appointment_time,
      status: app.status,
      appointmentType: appointmentTypeFor(app),
      visitType: 'in_person',
      symptomQuery: cleanSymptomQuery(app.symptom_query),
      confirmationSent: confirmationByAppointment.has(app.id),
      confirmedAt: confirmationByAppointment.get(app.id) || null,
      patient: app.patient ? {
        id: app.patient.id,
        fullName: app.patient.full_name,
        email: app.patient.email,
        phone: app.patient.phone
      } : null,
      doctor: app.doctor ? {
        id: app.doctor.id,
        fullName: app.doctor.full_name
      } : null
    }));

    const formattedAvailability = (availability || []).map(avail => ({
      id: avail.id,
      dayOfWeek: avail.day_of_week,
      startTime: avail.start_time,
      endTime: avail.end_time,
      slotDurationMinutes: avail.slot_duration_minutes,
      doctorId: avail.doctor_id,
      doctorName: avail.doctor?.full_name || 'Unknown Doctor'
    }));

    return res.status(200).json({
      appointments: formattedAppointments,
      availability: formattedAvailability
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error retrieving schedule', code: 'INTERNAL_ERROR' }
    });
  }
});

// GET /api/admin/hospitals/:id/analytics
// Computes daily bookings count (last 30 days), no-show rate, and per-doctor utilization rate
router.get('/hospitals/:id/analytics', authenticateUser, requireRole('hospital_admin'), verifyAdminHospital, async (req, res) => {
  const { id: hospitalId } = req.params;

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

    // 1. Fetch appointments in the last 30 days
    const { data: appointments, error: appError } = await supabase
      .from('appointments')
      .select('appointment_time, status, doctor_id')
      .eq('hospital_id', hospitalId)
      .gte('appointment_time', thirtyDaysAgo.toISOString())
      .order('appointment_time', { ascending: true });

    if (appError) {
      return res.status(400).json({
        error: { message: appError.message || 'Failed to query analytics appointments', code: 'DB_ERROR' }
      });
    }

    // 2. Fetch doctor availability rules for this hospital
    const { data: availabilities, error: availError } = await supabase
      .from('doctor_availability')
      .select('doctor_id, day_of_week, start_time, end_time, slot_duration_minutes')
      .eq('hospital_id', hospitalId);

    if (availError) {
      return res.status(400).json({
        error: { message: availError.message || 'Failed to query recurring availability rules', code: 'DB_ERROR' }
      });
    }

    // 3. Fetch affiliated accepted doctors
    const { data: affiliations, error: affError } = await supabase
      .from('doctor_hospital_affiliations')
      .select(`
        doctor_id,
        doctor:users!doctor_id (
          full_name
        )
      `)
      .eq('hospital_id', hospitalId)
      .eq('status', 'accepted');

    if (affError) {
      return res.status(400).json({
        error: { message: affError.message || 'Failed to fetch clinics affiliations', code: 'DB_ERROR' }
      });
    }

    // --- Analytics Computations ---

    // A. Daily bookings count (last 30 days)
    const dailyCounts = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().split('T')[0];
      dailyCounts[key] = 0;
    }

    (appointments || []).forEach(app => {
      const key = app.appointment_time.split('T')[0];
      if (dailyCounts[key] !== undefined) {
        dailyCounts[key]++;
      }
    });

    const dailyData = Object.keys(dailyCounts).map(date => ({
      date,
      count: dailyCounts[date]
    }));

    // B. No-show rate (completed vs no_show)
    const totalFinished = (appointments || []).filter(a => a.status === 'completed' || a.status === 'no_show');
    const noShows = (appointments || []).filter(a => a.status === 'no_show').length;
    const noShowRate = totalFinished.length > 0 ? parseFloat(((noShows / totalFinished.length) * 100).toFixed(1)) : 0;

    // C. Doctor schedule utilization
    const getSlotsCount = (avail) => {
      const [sh, sm] = avail.start_time.split(':').map(Number);
      const [eh, em] = avail.end_time.split(':').map(Number);
      const totalMins = (eh * 60 + em) - (sh * 60 + sm);
      return Math.max(0, Math.floor(totalMins / avail.slot_duration_minutes));
    };

    const doctorPotentialSlots = {};
    const doctorBookedSlots = {};
    const doctorsMap = {};

    (affiliations || []).forEach(aff => {
      if (aff.doctor) {
        doctorsMap[aff.doctor_id] = aff.doctor.full_name;
        doctorPotentialSlots[aff.doctor_id] = 0;
        doctorBookedSlots[aff.doctor_id] = 0;
      }
    });

    // Sum potential slots over the last 30 days based on weekday occurrences
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const dayOfWeek = d.getUTCDay();

      (availabilities || []).forEach(avail => {
        if (avail.day_of_week === dayOfWeek) {
          const slots = getSlotsCount(avail);
          if (doctorPotentialSlots[avail.doctor_id] !== undefined) {
            doctorPotentialSlots[avail.doctor_id] += slots;
          }
        }
      });
    }

    // Count non-cancelled appointments in the last 30 days
    (appointments || []).forEach(app => {
      if (app.status !== 'cancelled' && doctorBookedSlots[app.doctor_id] !== undefined) {
        doctorBookedSlots[app.doctor_id]++;
      }
    });

    const utilizationData = Object.keys(doctorsMap).map(doctorId => {
      const booked = doctorBookedSlots[doctorId] || 0;
      const potential = doctorPotentialSlots[doctorId] || 0;
      const utilization = potential > 0 ? parseFloat(((booked / potential) * 100).toFixed(1)) : 0;

      return {
        doctorId,
        doctorName: doctorsMap[doctorId],
        booked,
        potential,
        utilization: Math.min(100, utilization)
      };
    });

    return res.status(200).json({
      dailyBookings: dailyData,
      noShowRate,
      doctorUtilization: utilizationData
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error computing analytics', code: 'INTERNAL_ERROR' }
    });
  }
});

export default router;
