import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hsms_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Super-admin society switcher: attach the selected society to GET requests
  // unless the caller already specified one. Scoped users are locked server-side.
  const societyId = localStorage.getItem('hsms_society');
  if (societyId && config.method === 'get' && !config.params?.societyId) {
    config.params = { ...config.params, societyId };
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !location.pathname.startsWith('/login')) {
      localStorage.removeItem('hsms_token');
      localStorage.removeItem('hsms_user');
      location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export function errMsg(e: unknown): string {
  return (e as any)?.response?.data?.error || (e as any)?.message || 'Something went wrong';
}
