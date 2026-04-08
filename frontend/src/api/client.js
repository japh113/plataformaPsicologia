const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const AUTH_TOKEN_STORAGE_KEY = 'psicopanel_auth_token';

const buildHeaders = (headers = {}, hasBody = false) => {
  const nextHeaders = { ...headers };
  const token = getAuthToken();

  if (hasBody) {
    nextHeaders['Content-Type'] = 'application/json';
  }

  if (token) {
    nextHeaders.Authorization = `Bearer ${token}`;
  }

  return nextHeaders;
};

export const getAuthToken = () => window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
export const setAuthToken = (token) => window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
export const clearAuthToken = () => window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);

export const apiRequest = async (path, options = {}) => {
  const hasBody = typeof options.body !== 'undefined';
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: buildHeaders(options.headers, hasBody),
  });

  const contentType = response.headers.get('content-type') || '';
  const responseBody = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const errorMessage = responseBody?.message || 'No se pudo completar la solicitud.';
    throw new Error(errorMessage);
  }

  return responseBody;
};

export { API_BASE_URL };
