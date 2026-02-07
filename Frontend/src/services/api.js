import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle 401 errors (unauthorized)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only redirect to login if we're not already on a page that handles auth
      const currentPath = window.location.pathname;
      if (!currentPath.includes('/login') && !currentPath.includes('/register') && !currentPath.includes('/auth/callback')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (email, password, name) => api.post('/auth/register', { email, password, name }),
  googleLogin: () => {
    window.location.href = `${API_BASE_URL}/auth/google`;
  },
};

// Subscriptions API
export const subscriptionsAPI = {
  processEmails: (maxResults = 500) =>
    api.post(`/subscriptions/process-emails?maxResults=${maxResults}`),
  getAll: (status) => {
    const url = status ? `/subscriptions?status=${status}` : '/subscriptions';
    return api.get(url);
  },
};

// AI API (for testing)
export const aiAPI = {
  extract: (emailText) => api.post('/ai/extract', { emailText }),
};

// Create a separate axios instance for bank API that doesn't auto-redirect on 401
// This allows us to handle authentication errors gracefully in the component
const bankApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to bank API requests
bankApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Bank API - doesn't auto-redirect, errors are handled in components
export const bankAPI = {
  createLinkToken: () => bankApi.post('/bank/create-link-token'),
  exchangeToken: (publicToken) => bankApi.post('/bank/exchange-token', { publicToken }),
  getStatus: () => bankApi.get('/bank/status'),
  sync: () => bankApi.post('/bank/sync'),
  disconnect: () => bankApi.delete('/bank/disconnect'),
};

export default api;

