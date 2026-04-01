import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? `${window.location.origin}/api` : 'http://localhost:5300/api');

export const AuthContext = createContext(null);

// Try to restore user from sessionStorage for instant load
function getCachedUser() {
  try {
    const cached = sessionStorage.getItem('inv_user');
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getCachedUser);
  const [token, setToken] = useState(localStorage.getItem('inv_token'));
  const [loading, setLoading] = useState(!getCachedUser() && !!localStorage.getItem('inv_token'));

  useEffect(() => {
    if (token) {
      // If we already have a cached user, skip the blocking /me call
      // but still validate in background
      const hasCached = !!getCachedUser();
      if (hasCached && !loading) {
        // Background validate - don't block render
        axios
          .get(`${API_URL}/inventory/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          .then((res) => {
            setUser(res.data.user);
            sessionStorage.setItem('inv_user', JSON.stringify(res.data.user));
          })
          .catch(() => {
            localStorage.removeItem('inv_token');
            sessionStorage.removeItem('inv_user');
            setToken(null);
            setUser(null);
          });
      } else {
        axios
          .get(`${API_URL}/inventory/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          .then((res) => {
            setUser(res.data.user);
            sessionStorage.setItem('inv_user', JSON.stringify(res.data.user));
          })
          .catch(() => {
            localStorage.removeItem('inv_token');
            sessionStorage.removeItem('inv_user');
            setToken(null);
            setUser(null);
          })
          .finally(() => setLoading(false));
      }
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = useCallback(async (email, password) => {
    const res = await axios.post(`${API_URL}/inventory/auth/login`, { email, password });
    const { token: newToken, user: userData } = res.data;
    localStorage.setItem('inv_token', newToken);
    sessionStorage.setItem('inv_user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    return userData;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const res = await axios.post(`${API_URL}/inventory/auth/register`, { name, email, password });
    const { token: newToken, user: userData } = res.data;
    localStorage.setItem('inv_token', newToken);
    sessionStorage.setItem('inv_user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('inv_token');
    sessionStorage.removeItem('inv_user');
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user, token, loading, login, register, logout, isAuthenticated: !!user,
  }), [user, token, loading, login, register, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
