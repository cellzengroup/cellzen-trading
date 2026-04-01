import { useMemo } from 'react';
import axios from 'axios';
import { useAuth } from './useAuth';

const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? `${window.location.origin}/api` : 'http://localhost:5300/api');

export function useApi() {
  const { token, logout } = useAuth();

  const api = useMemo(() => {
    const instance = axios.create({
      baseURL: `${API_URL}/inventory`,
    });

    instance.interceptors.request.use((config) => {
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    instance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          logout();
        }
        return Promise.reject(error);
      }
    );

    return instance;
  }, [token, logout]);

  return api;
}
