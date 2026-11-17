import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.PROD
        ? '/api'   // production: Nginx proxies /api/ → localhost:5000
        : (import.meta.env.VITE_BACKEND_URL ? `${import.meta.env.VITE_BACKEND_URL}/api` : 'http://localhost:5000/api')
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Expired/invalid session → back to login. Not for /auth/* itself: a wrong
        // password is a 401 too, and the page reload would hide the error message.
        const isAuthCall = error.config?.url?.includes('/auth/');
        if (error.response?.status === 401 && !isAuthCall) {
            localStorage.removeItem('token');
            localStorage.removeItem('client');
            window.location.href = '/dashboard/login';
        }
        return Promise.reject(error);
    }
);

/** The logged-in client record, tolerating corrupted/missing localStorage. */
export function getClient() {
    try {
        return JSON.parse(localStorage.getItem('client') || '{}') || {};
    } catch {
        return {};
    }
}

export default api;