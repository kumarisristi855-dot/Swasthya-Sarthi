import { supabase } from '../lib/supabase.js';

export const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'User authentication required',
          code: 'UNAUTHORIZED'
        }
      });
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          message: `Access denied. Role ${req.user.role} is not authorized for this resource.`,
          code: 'FORBIDDEN'
        }
      });
    }

    // Dev login bypass handles mock users cleanly (skip DB check for fake IDs)
    if (process.env.NODE_ENV === 'development' && (req.user.id === 'demo-patient-uuid' || req.user.id === 'demo-doctor-uuid')) {
      return next();
    }

    // Additional profile table verification
    if (req.user.role === 'patient') {
      const { data: patientProfile, error: profileErr } = await supabase
        .from('patient_profiles')
        .select('user_id')
        .eq('user_id', req.user.id)
        .single();
      
      if (profileErr || !patientProfile) {
        return res.status(403).json({
          error: {
            message: 'Access denied: Patient profile not found in database',
            code: 'FORBIDDEN'
          }
        });
      }
    }

    if (req.user.role === 'doctor') {
      const { data: doctorProfile, error: profileErr } = await supabase
        .from('doctor_profiles')
        .select('user_id')
        .eq('user_id', req.user.id)
        .single();
      
      if (profileErr || !doctorProfile) {
        return res.status(403).json({
          error: {
            message: 'Access denied: Doctor profile not found in database',
            code: 'FORBIDDEN'
          }
        });
      }
    }

    next();
  };
};
