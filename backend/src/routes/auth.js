import { Router } from 'express';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();
const profilePhotoBucket = 'profile-photos';
const profilePhotoMaxBytes = 2 * 1024 * 1024;
const profilePhotoTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function validImageSignature(buffer, mimeType) {
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === 'image/webp') {
    return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

async function ensureProfilePhotoBucket() {
  const { data: bucket, error } = await supabaseAdmin.storage.getBucket(profilePhotoBucket);
  if (!error && bucket) {
    if (!bucket.public) {
      const { error: updateError } = await supabaseAdmin.storage.updateBucket(profilePhotoBucket, {
        public: true,
        fileSizeLimit: profilePhotoMaxBytes,
        allowedMimeTypes: Object.keys(profilePhotoTypes)
      });
      if (updateError) throw updateError;
    }
    return;
  }

  const { error: createError } = await supabaseAdmin.storage.createBucket(profilePhotoBucket, {
    public: true,
    fileSizeLimit: profilePhotoMaxBytes,
    allowedMimeTypes: Object.keys(profilePhotoTypes)
  });
  if (createError && !/already exists/i.test(createError.message || '')) throw createError;
}

// ==========================================
// PATIENT AUTHENTICATION
// ==========================================

// Patient Signup
router.post('/patient/signup', async (req, res) => {
  const { email, password, fullName, phone, dateOfBirth, gender, allergies, chronicConditions } = req.body;

  if (!email || !password || !fullName) {
    return res.status(400).json({
      error: { message: 'Email, password, and full name are required', code: 'VALIDATION_ERROR' }
    });
  }

  let authUser = null;

  try {
    // 1. Create auth user in Supabase (with standard signUp)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    });

    if (authError || !authData?.user) {
      return res.status(400).json({
        error: { message: authError?.message || 'Failed to create auth user', code: 'AUTH_ERROR' }
      });
    }

    authUser = authData.user;

    // 2. Create database user profile in public.users
    const { error: dbError } = await supabase
      .from('users')
      .insert({
        id: authUser.id,
        role: 'patient',
        full_name: fullName,
        phone: phone || null,
        email: email
      });

    if (dbError) {
      // Rollback auth user creation if possible
      try {
        await supabase.auth.admin.deleteUser(authUser.id);
      } catch (err) {
        console.warn('Could not delete auth user during rollback:', err.message);
      }
      return res.status(400).json({
        error: { message: dbError.message || 'Failed to create user record', code: 'DB_ERROR' }
      });
    }

    // 3. Create patient profile
    const { error: profileError } = await supabase
      .from('patient_profiles')
      .insert({
        user_id: authUser.id,
        date_of_birth: dateOfBirth || null,
        gender: gender || null,
        allergies: allergies || [],
        chronic_conditions: chronicConditions || []
      });

    if (profileError) {
      // Rollback user record and auth user
      try {
        await supabase.from('users').delete().eq('id', authUser.id);
        await supabase.auth.admin.deleteUser(authUser.id);
      } catch (err) {
        console.warn('Could not cleanup auth user during rollback:', err.message);
      }
      return res.status(400).json({
        error: { message: profileError.message || 'Failed to create patient profile', code: 'DB_ERROR' }
      });
    }

    return res.status(201).json({
      message: 'Patient registered successfully',
      user: { id: authUser.id, email, role: 'patient', full_name: fullName }
    });

  } catch (error) {
    if (authUser) {
      try {
        await supabase.from('users').delete().eq('id', authUser.id);
        await supabase.auth.admin.deleteUser(authUser.id);
      } catch (err) {
        console.error('Failed to cleanup user after signup failure:', err);
      }
    }
    return res.status(500).json({
      error: { message: 'Internal server error during registration', code: 'INTERNAL_ERROR' }
    });
  }
});

// Patient Login
router.post('/patient/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: { message: 'Email and password are required', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    // 1. Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData?.user) {
      return res.status(401).json({
        error: { message: authError?.message || 'Invalid email or password', code: 'AUTH_ERROR' }
      });
    }

    const authUser = authData.user;

    // 2. Fetch role and verify it is 'patient'
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (dbError || !dbUser || dbUser.role !== 'patient') {
      return res.status(403).json({
        error: { message: 'This account is not registered as a Patient', code: 'ROLE_MISMATCH' }
      });
    }

    // 3. Confirm profile exists
    const { data: profile, error: profileError } = await supabase
      .from('patient_profiles')
      .select('*')
      .eq('user_id', authUser.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({
        error: { message: 'Patient profile details not found', code: 'PROFILE_NOT_FOUND' }
      });
    }

    return res.status(200).json({
      message: 'Login successful',
      session: authData.session,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        full_name: dbUser.full_name
      }
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error during login', code: 'INTERNAL_ERROR' }
    });
  }
});


// ==========================================
// DOCTOR AUTHENTICATION
// ==========================================

// Doctor Signup
router.post('/doctor/signup', async (req, res) => {
  const { email, password, fullName, phone, specializationId, licenseNo, yearsExperience, bio, hospitalId, hospitalName } = req.body;

  if (!email || !password || !fullName || !specializationId || !licenseNo) {
    return res.status(400).json({
      error: { message: 'Email, password, full name, specialization, and license number are required', code: 'VALIDATION_ERROR' }
    });
  }

  let authUser = null;

  try {
    // 1. Create auth user in Supabase (with standard signUp)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    });

    if (authError || !authData?.user) {
      return res.status(400).json({
        error: { message: authError?.message || 'Failed to create auth user', code: 'AUTH_ERROR' }
      });
    }

    authUser = authData.user;

    // 2. Create database user profile in public.users
    const { error: dbError } = await supabase
      .from('users')
      .insert({
        id: authUser.id,
        role: 'doctor',
        full_name: fullName,
        phone: phone || null,
        email: email
      });

    if (dbError) {
      // Rollback auth user
      try {
        await supabase.auth.admin.deleteUser(authUser.id);
      } catch (err) {
        console.warn('Could not delete auth user during rollback:', err.message);
      }
      return res.status(400).json({
        error: { message: dbError.message || 'Failed to create user record', code: 'DB_ERROR' }
      });
    }

    // 3. Create doctor profile with status='pending'
    const { error: profileError } = await supabase
      .from('doctor_profiles')
      .insert({
        user_id: authUser.id,
        specialization_id: parseInt(specializationId, 10),
        license_no: licenseNo,
        years_experience: yearsExperience ? parseInt(yearsExperience, 10) : 0,
        consultation_fee: req.body.consultationFee ? parseFloat(req.body.consultationFee) : 0.0,
        bio: bio || '',
        status: 'pending' // default is pending anyway
      });

    if (profileError) {
      // Rollback user record and auth user
      try {
        await supabase.from('users').delete().eq('id', authUser.id);
        await supabase.auth.admin.deleteUser(authUser.id);
      } catch (err) {
        console.warn('Could not cleanup auth user during rollback:', err.message);
      }
      return res.status(400).json({
        error: { message: profileError.message || 'Failed to create doctor profile', code: 'DB_ERROR' }
      });
    }

    let resolvedHospitalId = hospitalId || null;
    const typedHospitalName = String(hospitalName || '').trim();
    if (!resolvedHospitalId && typedHospitalName) {
      const { data: matchedHospital, error: hospitalLookupError } = await supabase
        .from('hospitals')
        .select('id')
        .ilike('name', typedHospitalName)
        .limit(1)
        .maybeSingle();

      if (hospitalLookupError) {
        console.warn('Could not resolve typed hospital during doctor signup:', hospitalLookupError.message);
      }
      resolvedHospitalId = matchedHospital?.id || null;
    }

    // 4. Create hospital affiliation if the typed hospital matches an existing hospital.
    if (resolvedHospitalId) {
      const { error: affError } = await supabase
        .from('doctor_hospital_affiliations')
        .insert({
          doctor_id: authUser.id,
          hospital_id: resolvedHospitalId,
          status: 'invited'
        });

      if (affError) {
        // Rollback doctor profile, user record, and auth user
        try {
          await supabase.from('doctor_profiles').delete().eq('user_id', authUser.id);
          await supabase.from('users').delete().eq('id', authUser.id);
          await supabase.auth.admin.deleteUser(authUser.id);
        } catch (err) {
          console.warn('Could not cleanup auth user during rollback:', err.message);
        }
        return res.status(400).json({
          error: { message: affError.message || 'Failed to link doctor to hospital', code: 'DB_ERROR' }
        });
      }
    }

    return res.status(201).json({
      message: 'Doctor registered successfully and is awaiting approval',
      user: { id: authUser.id, email, role: 'doctor', full_name: fullName, status: 'pending' }
    });

  } catch (error) {
    if (authUser) {
      try {
        await supabase.from('users').delete().eq('id', authUser.id);
        await supabase.auth.admin.deleteUser(authUser.id);
      } catch (err) {
        console.error('Failed to cleanup user after signup failure:', err);
      }
    }
    return res.status(500).json({
      error: { message: 'Internal server error during registration', code: 'INTERNAL_ERROR' }
    });
  }
});

// Doctor Login
router.post('/doctor/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: { message: 'Email and password are required', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    // 1. Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData?.user) {
      return res.status(401).json({
        error: { message: authError?.message || 'Invalid email or password', code: 'AUTH_ERROR' }
      });
    }

    const authUser = authData.user;

    // 2. Fetch role and verify it is 'doctor'
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (dbError || !dbUser || dbUser.role !== 'doctor') {
      return res.status(403).json({
        error: { message: 'This account is not registered as a Doctor', code: 'ROLE_MISMATCH' }
      });
    }

    // 3. Get doctor profile details (status)
    const { data: profile, error: profileError } = await supabase
      .from('doctor_profiles')
      .select('*')
      .eq('user_id', authUser.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({
        error: { message: 'Doctor profile details not found', code: 'PROFILE_NOT_FOUND' }
      });
    }

    return res.status(200).json({
      message: 'Login successful',
      session: authData.session,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        full_name: dbUser.full_name,
        status: profile.status // will be 'pending', 'active', or 'rejected'
      }
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error during login', code: 'INTERNAL_ERROR' }
    });
  }
});


// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

// Admin Login
router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: { message: 'Email and password are required', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    // 1. Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData?.user) {
      return res.status(401).json({
        error: { message: authError?.message || 'Invalid email or password', code: 'AUTH_ERROR' }
      });
    }

    const authUser = authData.user;

    // 2. Fetch role and verify it is 'hospital_admin'
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (dbError || !dbUser || dbUser.role !== 'hospital_admin') {
      return res.status(403).json({
        error: { message: 'This account is not registered as a Hospital Admin', code: 'ROLE_MISMATCH' }
      });
    }

    // 3. Verify they administer at least one hospital (admin_id reference check)
    const { data: hospital, error: hospitalError } = await supabase
      .from('hospitals')
      .select('*')
      .eq('admin_id', authUser.id)
      .limit(1);

    if (hospitalError || !hospital || hospital.length === 0) {
      return res.status(403).json({
        error: { message: 'Admin account is not assigned to a hospital', code: 'HOSPITAL_UNASSIGNED' }
      });
    }

    return res.status(200).json({
      message: 'Login successful',
      session: authData.session,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        full_name: dbUser.full_name,
        hospital_id: hospital[0].id
      }
    });

  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error during login', code: 'INTERNAL_ERROR' }
    });
  }
});


// ==========================================
// GENERAL USER DATA
// ==========================================

// Get Current User Profile (Me)
router.get('/me', authenticateUser, async (req, res) => {
  try {
    const user = req.user;

    // Fetch extra role details if applicable
    if (user.role === 'doctor') {
      const { data: profile } = await supabase
        .from('doctor_profiles')
        .select('status, license_no, years_experience, rating_avg, rating_count')
        .eq('user_id', user.id)
        .single();
      return res.status(200).json({ user: { ...user, status: profile?.status } });
    }

    if (user.role === 'hospital_admin') {
      const { data: hospital } = await supabase
        .from('hospitals')
        .select('id, name, address, phone')
        .eq('admin_id', user.id)
        .limit(1);
      const assignedHospital = hospital?.[0] || null;
      return res.status(200).json({
        user: {
          ...user,
          hospital_id: assignedHospital?.id || null,
          hospital_name: assignedHospital?.name || null,
          hospital_address: assignedHospital?.address || null,
          hospital_phone: assignedHospital?.phone || null
        }
      });
    }

    if (user.role === 'patient') {
      const { data: profile, error: profileError } = await supabase
        .from('patient_profiles')
        .select('date_of_birth, gender, allergies, chronic_conditions')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileError) {
        return res.status(500).json({
          error: { message: 'Could not load patient profile details', code: 'DB_ERROR' }
        });
      }

      return res.status(200).json({ user: { ...user, ...(profile || {}) } });
    }

    return res.status(200).json({ user });
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error fetching session details', code: 'INTERNAL_ERROR' }
    });
  }
});

// Upload or replace a doctor/hospital administrator profile photo.
router.post('/me/avatar', authenticateUser, async (req, res) => {
  if (!['doctor', 'hospital_admin'].includes(req.user.role)) {
    return res.status(403).json({
      error: { message: 'Doctor or hospital administrator access is required', code: 'FORBIDDEN' }
    });
  }

  const imageData = String(req.body.imageData || '');
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\r\n]+)$/i.exec(imageData);
  if (!match) {
    return res.status(400).json({
      error: { message: 'Choose a JPEG, PNG, or WebP image', code: 'VALIDATION_ERROR' }
    });
  }

  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > profilePhotoMaxBytes) {
    return res.status(400).json({
      error: { message: 'Profile photo must be smaller than 2 MB', code: 'VALIDATION_ERROR' }
    });
  }
  if (!validImageSignature(buffer, mimeType)) {
    return res.status(400).json({
      error: { message: 'The selected file is not a valid image', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    await ensureProfilePhotoBucket();
    const extension = profilePhotoTypes[mimeType];
    const objectPath = `${req.user.id}/profile.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(profilePhotoBucket)
      .upload(objectPath, buffer, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: true
      });
    if (uploadError) {
      return res.status(500).json({
        error: { message: uploadError.message || 'Could not upload profile photo', code: 'STORAGE_ERROR' }
      });
    }

    const stalePaths = Object.values(profilePhotoTypes)
      .filter(candidate => candidate !== extension)
      .map(candidate => `${req.user.id}/profile.${candidate}`);
    await supabaseAdmin.storage.from(profilePhotoBucket).remove(stalePaths);

    const { data: publicData } = supabaseAdmin.storage.from(profilePhotoBucket).getPublicUrl(objectPath);
    const avatarUrl = `${publicData.publicUrl}?v=${Date.now()}`;
    const currentMetadata = req.authUser?.user_metadata || {};
    const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
      user_metadata: { ...currentMetadata, avatar_url: avatarUrl }
    });
    if (metadataError) {
      return res.status(500).json({
        error: { message: metadataError.message || 'Could not save profile photo', code: 'AUTH_UPDATE_ERROR' }
      });
    }

    return res.status(200).json({
      message: 'Profile photo updated successfully',
      user: { ...req.user, avatar_url: avatarUrl }
    });
  } catch (error) {
    return res.status(500).json({
      error: { message: error.message || 'Internal server error uploading profile photo', code: 'INTERNAL_ERROR' }
    });
  }
});

// Remove the signed-in user's profile photo and restore initials.
router.delete('/me/avatar', authenticateUser, async (req, res) => {
  if (!['doctor', 'hospital_admin'].includes(req.user.role)) {
    return res.status(403).json({
      error: { message: 'Doctor or hospital administrator access is required', code: 'FORBIDDEN' }
    });
  }

  try {
    await ensureProfilePhotoBucket();
    const paths = Object.values(profilePhotoTypes).map(extension => `${req.user.id}/profile.${extension}`);
    const { error: removeError } = await supabaseAdmin.storage.from(profilePhotoBucket).remove(paths);
    if (removeError) {
      return res.status(500).json({
        error: { message: removeError.message || 'Could not remove profile photo', code: 'STORAGE_ERROR' }
      });
    }

    const currentMetadata = req.authUser?.user_metadata || {};
    const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
      user_metadata: { ...currentMetadata, avatar_url: null }
    });
    if (metadataError) {
      return res.status(500).json({
        error: { message: metadataError.message || 'Could not clear profile photo', code: 'AUTH_UPDATE_ERROR' }
      });
    }

    return res.status(200).json({
      message: 'Profile photo removed',
      user: { ...req.user, avatar_url: null }
    });
  } catch (error) {
    return res.status(500).json({
      error: { message: error.message || 'Internal server error removing profile photo', code: 'INTERNAL_ERROR' }
    });
  }
});

// Update the signed-in hospital administrator's personal account details.
router.put('/me/admin', authenticateUser, async (req, res) => {
  if (req.user.role !== 'hospital_admin') {
    return res.status(403).json({
      error: { message: 'Hospital administrator access is required', code: 'FORBIDDEN' }
    });
  }

  const fullName = String(req.body.fullName || '').trim();
  const phone = String(req.body.phone || '').trim();
  if (fullName.length < 2 || fullName.length > 100) {
    return res.status(400).json({
      error: { message: 'Full name must be between 2 and 100 characters', code: 'VALIDATION_ERROR' }
    });
  }
  if (phone && !/^\+?[1-9]\d{1,14}$/.test(phone.replace(/[\s\-()]/g, ''))) {
    return res.status(400).json({
      error: { message: 'Please enter a valid phone number', code: 'VALIDATION_ERROR' }
    });
  }

  try {
    const { error: updateError } = await supabase
      .from('users')
      .update({ full_name: fullName, phone: phone || null })
      .eq('id', req.user.id);
    if (updateError) {
      return res.status(500).json({
        error: { message: updateError.message || 'Could not update administrator profile', code: 'DB_ERROR' }
      });
    }

    const { data: hospital, error: hospitalError } = await supabase
      .from('hospitals')
      .select('id, name, address, phone')
      .eq('admin_id', req.user.id)
      .limit(1);
    if (hospitalError) {
      return res.status(500).json({
        error: { message: 'Could not reload hospital details', code: 'DB_ERROR' }
      });
    }
    const assignedHospital = hospital?.[0] || null;
    return res.status(200).json({
      message: 'Administrator profile updated successfully',
      user: {
        ...req.user,
        full_name: fullName,
        phone: phone || null,
        hospital_id: assignedHospital?.id || null,
        hospital_name: assignedHospital?.name || null,
        hospital_address: assignedHospital?.address || null,
        hospital_phone: assignedHospital?.phone || null
      }
    });
  } catch {
    return res.status(500).json({
      error: { message: 'Internal server error updating administrator profile', code: 'INTERNAL_ERROR' }
    });
  }
});

// Update the signed-in patient's personal profile.
router.put('/me/patient', authenticateUser, async (req, res) => {
  if (req.user.role !== 'patient') {
    return res.status(403).json({
      error: { message: 'Patient access is required', code: 'FORBIDDEN' }
    });
  }

  const fullName = String(req.body.fullName || '').trim();
  const phone = String(req.body.phone || '').trim();
  const dateOfBirth = req.body.dateOfBirth || null;
  const gender = String(req.body.gender || '').trim() || null;
  const listValue = value => {
    const items = Array.isArray(value) ? value : String(value || '').split(',');
    return items
      .filter(item => item !== null && item !== undefined)
      .map(item => String(item).trim())
      .filter(item => item && item.toLowerCase() !== 'null')
      .slice(0, 20);
  };

  if (fullName.length < 2 || fullName.length > 100) {
    return res.status(400).json({
      error: { message: 'Full name must be between 2 and 100 characters', code: 'VALIDATION_ERROR' }
    });
  }

  if (phone && !/^\+?[1-9]\d{1,14}$/.test(phone.replace(/[\s\-()]/g, ''))) {
    return res.status(400).json({
      error: { message: 'Please enter a valid phone number', code: 'VALIDATION_ERROR' }
    });
  }

  if (dateOfBirth) {
    const parsedDate = new Date(`${dateOfBirth}T00:00:00`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate > new Date()) {
      return res.status(400).json({
        error: { message: 'Please enter a valid date of birth', code: 'VALIDATION_ERROR' }
      });
    }
  }

  try {
    const profileUpdates = {
      user_id: req.user.id,
      date_of_birth: dateOfBirth,
      gender,
      allergies: listValue(req.body.allergies),
      chronic_conditions: listValue(req.body.chronicConditions)
    };

    const { error: userError } = await supabase
      .from('users')
      .update({ full_name: fullName, phone: phone || null })
      .eq('id', req.user.id);

    if (userError) {
      return res.status(500).json({
        error: { message: userError.message || 'Could not update account details', code: 'DB_ERROR' }
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from('patient_profiles')
      .upsert(profileUpdates, { onConflict: 'user_id' })
      .select('date_of_birth, gender, allergies, chronic_conditions')
      .single();

    if (profileError) {
      return res.status(500).json({
        error: { message: profileError.message || 'Could not update patient profile', code: 'DB_ERROR' }
      });
    }

    return res.status(200).json({
      message: 'Profile updated successfully',
      user: {
        ...req.user,
        full_name: fullName,
        phone: phone || null,
        ...profile
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: { message: 'Internal server error updating patient profile', code: 'INTERNAL_ERROR' }
    });
  }
});

// Complete Google OAuth Sign-Up
router.post('/complete-signup', async (req, res) => {
  const { role } = req.body;
  const authHeader = req.headers.authorization;

  if (!role || !['patient', 'doctor', 'hospital_admin'].includes(role)) {
    return res.status(400).json({
      error: { message: 'Invalid or missing role parameter', code: 'VALIDATION_ERROR' }
    });
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: { message: 'Missing or malformed authorization header', code: 'UNAUTHORIZED' }
    });
  }

  try {
    const token = authHeader.split(' ')[1];
    
    // Resolve Supabase Auth User from JWT directly (works even if db user row does not exist yet)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        error: { message: authError?.message || 'Invalid or expired session token', code: 'UNAUTHORIZED' }
      });
    }

    // 1. Create row in users table
    const { error: userInsertErr } = await supabase
      .from('users')
      .insert({
        id: user.id,
        role: role,
        full_name: user.user_metadata?.full_name || user.email.split('@')[0],
        email: user.email,
        phone: null
      });

    // Code '23505' represents unique constraint violation (user already exists), which we can safely ignore
    if (userInsertErr && userInsertErr.code !== '23505') {
      return res.status(500).json({
        error: { message: userInsertErr.message || 'Failed to create user record', code: 'DB_ERROR' }
      });
    }

    // 2. Based on role, create profiles
    if (role === 'patient') {
      const { error: profileErr } = await supabase
        .from('patient_profiles')
        .insert({
          user_id: user.id,
          date_of_birth: null,
          gender: null
        });

      if (profileErr && profileErr.code !== '23505') {
        return res.status(500).json({
          error: { message: profileErr.message || 'Failed to create patient profile', code: 'DB_ERROR' }
        });
      }
    } else if (role === 'doctor') {
      // Find the first specialization as a default fallback
      const { data: spec } = await supabase
        .from('specializations')
        .select('id')
        .limit(1)
        .single();
      const specId = spec?.id || 1;

      const { error: profileErr } = await supabase
        .from('doctor_profiles')
        .insert({
          user_id: user.id,
          specialization_id: specId,
          status: 'pending' // pending until hospital admin approves
        });

      if (profileErr && profileErr.code !== '23505') {
        return res.status(500).json({
          error: { message: profileErr.message || 'Failed to create doctor profile', code: 'DB_ERROR' }
        });
      }
    }

    return res.status(200).json({
      success: true,
      role: role,
      redirectTo: `/${role === 'hospital_admin' ? 'admin' : role}/dashboard`
    });

  } catch (error) {
    console.error('Complete signup error:', error);
    return res.status(500).json({
      error: { message: 'Internal server error during account finalization', code: 'INTERNAL_ERROR' }
    });
  }
});

export default router;
