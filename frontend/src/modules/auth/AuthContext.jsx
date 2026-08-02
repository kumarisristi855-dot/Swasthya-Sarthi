/* oxlint-disable react/only-export-components */
import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../../lib/supabase';
import { clearPatientSessionStorage } from '../../lib/patientSession';
import { API_URL } from '../../lib/api';

const AuthContext = createContext(null);

async function fetchCurrentUser(accessToken) {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Could not load account details');
  return data.user;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected image'));
    reader.readAsDataURL(file);
  });
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  // Initialize and check current token
  useEffect(() => {
    async function initAuth() {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          const currentUser = await fetchCurrentUser(storedToken);
          setUser(currentUser);
          setToken(storedToken);
        } catch (error) {
          console.error('Error verifying stored token:', error);
          handleLogoutState();
        }
      } else {
        setLoading(false);
      }
    }
    initAuth();
  }, []);

  // Update loading state once user state is resolved
  useEffect(() => {
    if (user || !token) {
      setLoading(false);
    }
  }, [user, token]);

  const handleLogoutState = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('isDevDemo');
    localStorage.removeItem('isDevDemoDoctor');
    setLoading(false);
  };

  const login = async (email, password, role) => {
    setLoading(true);
    try {
      const authRoute = role === 'hospital_admin' ? 'admin' : role;
      const res = await fetch(`${API_URL}/auth/${authRoute}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Login failed');
      }

      const accessToken = data.session.access_token;
      localStorage.setItem('token', accessToken);
      setToken(accessToken);
      let currentUser = data.user;
      try {
        currentUser = await fetchCurrentUser(accessToken);
      } catch (profileError) {
        console.warn('Could not enrich account details after login:', profileError);
      }
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const signup = async (formData, role) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/${role}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Signup failed');
      }

      setLoading(false);
      return data;
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn('Supabase client logout error:', error);
    } finally {
      if (user?.role === 'patient') clearPatientSessionStorage(user.id);
      handleLogoutState();
    }
  };

  const updatePatientProfile = async profile => {
    if (!token) throw new Error('Your session has expired. Please sign in again.');

    const res = await fetch(`${API_URL}/auth/me/patient`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(profile)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Could not update your profile');
    setUser(data.user);
    return data.user;
  };

  const updateAdminProfile = async profile => {
    if (!token) throw new Error('Your session has expired. Please sign in again.');

    const res = await fetch(`${API_URL}/auth/me/admin`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(profile)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Could not update administrator profile');
    setUser(data.user);
    return data.user;
  };

  const uploadProfilePhoto = async file => {
    if (!token) throw new Error('Your session has expired. Please sign in again.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file?.type)) {
      throw new Error('Choose a JPEG, PNG, or WebP image.');
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new Error('Profile photo must be smaller than 2 MB.');
    }

    const imageData = await readFileAsDataUrl(file);
    const res = await fetch(`${API_URL}/auth/me/avatar`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ imageData })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Could not upload profile photo');
    setUser(current => ({ ...current, avatar_url: data.user.avatar_url }));
    return data.user.avatar_url;
  };

  const removeProfilePhoto = async () => {
    if (!token) throw new Error('Your session has expired. Please sign in again.');
    const res = await fetch(`${API_URL}/auth/me/avatar`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Could not remove profile photo');
    setUser(current => ({ ...current, avatar_url: null }));
  };

  const value = {
    user,
    role: user?.role || null,
    token,
    isAuthenticated: !!user,
    loading,
    login,
    signup,
    updatePatientProfile,
    updateAdminProfile,
    uploadProfilePhoto,
    removeProfilePhoto,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
