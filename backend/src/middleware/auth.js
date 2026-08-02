import { supabase } from '../lib/supabase.js';

export const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          message: 'Missing or malformed authorization header',
          code: 'UNAUTHORIZED'
        }
      });
    }

    const token = authHeader.split(' ')[1];

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        error: {
          message: authError?.message || 'Invalid or expired session token',
          code: 'UNAUTHORIZED'
        }
      });
    }

    // Fetch the user role and details from the database
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (dbError || !dbUser) {
      return res.status(401).json({
        error: {
          message: 'User profile not found in database',
          code: 'UNAUTHORIZED'
        }
      });
    }

    if (process.env.DISABLE_DEVELOPMENT_ACCOUNTS === 'true' && /@test\.com$/i.test(dbUser.email || '')) {
      return res.status(403).json({
        error: {
          message: 'Development accounts are disabled in production',
          code: 'DEVELOPMENT_ACCOUNT_DISABLED'
        }
      });
    }

    // Attach both database fields and safe auth metadata used by profile features.
    req.authUser = user;
    req.user = {
      ...dbUser,
      avatar_url: user.user_metadata?.avatar_url || null
    };
    next();
  } catch (error) {
    return res.status(500).json({
      error: {
        message: 'Internal server error during authentication',
        code: 'INTERNAL_ERROR'
      }
    });
  }
};
