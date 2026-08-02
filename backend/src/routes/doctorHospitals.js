import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticateUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();

async function verifyAdminOwnsHospital(hospitalId, adminId) {
  const { data, error } = await supabase
    .from('hospitals')
    .select('id, city, admin_id')
    .eq('id', hospitalId)
    .eq('city', 'Delhi')
    .single();

  if (error || !data) {
    return { ok: false, status: 404, message: 'Delhi hospital not found', code: 'NOT_FOUND' };
  }

  if (data.admin_id !== adminId) {
    return { ok: false, status: 403, message: 'You are not authorized to manage this Delhi hospital', code: 'FORBIDDEN' };
  }

  return { ok: true };
}

function normalizeAssociationPayload(body) {
  return {
    working_days: Array.isArray(body.workingDays) ? body.workingDays.map(Number) : null,
    start_time: body.startTime || null,
    end_time: body.endTime || null,
    specialization_id: body.specializationId ? parseInt(body.specializationId, 10) : null,
    consultation_fee: body.consultationFee ? parseFloat(body.consultationFee) : null,
    status: body.status || 'accepted',
    updated_at: new Date().toISOString()
  };
}

// POST /api/doctors-hospitals/associate
router.post('/associate', authenticateUser, requireRole('hospital_admin'), async (req, res) => {
  const { doctorId, hospitalId } = req.body;

  if (!doctorId || !hospitalId) {
    return res.status(400).json({
      error: { message: 'Doctor ID and Hospital ID are required', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    const ownership = await verifyAdminOwnsHospital(hospitalId, req.user.id);
    if (!ownership.ok) {
      return res.status(ownership.status).json({
        error: { message: ownership.message, code: ownership.code }
      });
    }

    const { data: doctor, error: doctorError } = await supabase
      .from('doctor_profiles')
      .select('user_id, status')
      .eq('user_id', doctorId)
      .single();

    if (doctorError || !doctor) {
      return res.status(404).json({
        error: { message: 'Doctor profile not found', code: 'NOT_FOUND' }
      });
    }

    const payload = normalizeAssociationPayload(req.body);

    const { data, error } = await supabase
      .from('doctor_hospital_affiliations')
      .upsert(
        {
          doctor_id: doctorId,
          hospital_id: hospitalId,
          invited_by: req.user.id,
          ...payload
        },
        { onConflict: 'doctor_id,hospital_id' }
      )
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to associate doctor and hospital', code: 'DB_ERROR' }
      });
    }

    return res.status(201).json({
      message: 'Doctor-hospital association saved successfully',
      association: data
    });
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error saving association', code: 'INTERNAL_ERROR' }
    });
  }
});

// PUT /api/doctors-hospitals/:id
router.put('/:id', authenticateUser, requireRole('hospital_admin'), async (req, res) => {
  const { id } = req.params;

  try {
    const { data: association, error: fetchError } = await supabase
      .from('doctor_hospital_affiliations')
      .select('id, hospital_id')
      .eq('id', id)
      .single();

    if (fetchError || !association) {
      return res.status(404).json({
        error: { message: 'Association not found', code: 'NOT_FOUND' }
      });
    }

    const ownership = await verifyAdminOwnsHospital(association.hospital_id, req.user.id);
    if (!ownership.ok) {
      return res.status(ownership.status).json({
        error: { message: ownership.message, code: ownership.code }
      });
    }

    const { data, error } = await supabase
      .from('doctor_hospital_affiliations')
      .update(normalizeAssociationPayload(req.body))
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to update association', code: 'DB_ERROR' }
      });
    }

    return res.status(200).json({
      message: 'Association updated successfully',
      association: data
    });
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error updating association', code: 'INTERNAL_ERROR' }
    });
  }
});

// DELETE /api/doctors-hospitals/:id
router.delete('/:id', authenticateUser, requireRole('hospital_admin'), async (req, res) => {
  const { id } = req.params;

  try {
    const { data: association, error: fetchError } = await supabase
      .from('doctor_hospital_affiliations')
      .select('id, hospital_id')
      .eq('id', id)
      .single();

    if (fetchError || !association) {
      return res.status(404).json({
        error: { message: 'Association not found', code: 'NOT_FOUND' }
      });
    }

    const ownership = await verifyAdminOwnsHospital(association.hospital_id, req.user.id);
    if (!ownership.ok) {
      return res.status(ownership.status).json({
        error: { message: ownership.message, code: ownership.code }
      });
    }

    const { error } = await supabase
      .from('doctor_hospital_affiliations')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      return res.status(400).json({
        error: { message: error.message || 'Failed to remove association', code: 'DB_ERROR' }
      });
    }

    return res.status(200).json({
      message: 'Association removed successfully'
    });
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error removing association', code: 'INTERNAL_ERROR' }
    });
  }
});

export default router;
