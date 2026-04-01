import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? window.location.origin : 'http://localhost:5300');

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});
