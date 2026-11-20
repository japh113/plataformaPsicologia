const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const AUTH_TOKEN_STORAGE_KEY = 'psicopanel_auth_token';
const readStoredToken = () => window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
let tabToken = readStoredToken();
let sessionGeneration = 0;

const buildHeaders = (headers = {}, hasBody = false, token) => {
  const nextHeaders = { ...headers };

  if (hasBody) {
    nextHeaders['Content-Type'] = 'application/json';
  }

  if (token) {
    nextHeaders.Authorization = `Bearer ${token}`;
  }

  return nextHeaders;
};

// A different tab may replace storage before this tab receives its storage event.
export const getAuthToken = () => tabToken === readStoredToken() ? tabToken : null;
export const setAuthToken = (token) => {
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  tabToken = token;
  ++sessionGeneration;
};
const detachSession = () => {
  tabToken = null;
  ++sessionGeneration;
};
export const clearAuthToken = () => {
  if (getAuthToken()) window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  detachSession();
};

export const storageEndedSession = (event) => {
  if (
    event.storageArea !== window.localStorage ||
    (event.key !== AUTH_TOKEN_STORAGE_KEY && event.key !== null) ||
    !tabToken ||
    getAuthToken()
  ) return false;
  detachSession();
  return true;
};

const sessionChanged = () => Object.assign(new Error('La sesión cambió. Inicia sesión de nuevo.'), { status: 401 });

export const beginSessionRequest = () => {
  const storedToken = readStoredToken();
  const token = tabToken;
  const generation = sessionGeneration;
  if (token && token !== storedToken) throw sessionChanged();
  const ensureCurrent = () => {
    if (generation !== sessionGeneration || storedToken !== readStoredToken()) throw sessionChanged();
  };
  return { token, ensureCurrent };
};

export const apiRequest = async (path, options = {}) => {
  const { token: requestToken, ensureCurrent } = beginSessionRequest();
  const hasBody = typeof options.body !== 'undefined';
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: buildHeaders(options.headers, hasBody, requestToken),
  });

  ensureCurrent();
  const contentType = response.headers.get('content-type') || '';
  const responseBody = contentType.includes('application/json') ? await response.json() : null;
  ensureCurrent();

  if (!response.ok) {
    if (response.status === 401 && requestToken && getAuthToken() === requestToken) {
      clearAuthToken();
      window.dispatchEvent(new Event('psicopanel-session-ended'));
    }
    const errorMessage = responseBody?.message || 'No se pudo completar la solicitud.';
    const error = new Error([errorMessage, ...(Array.isArray(responseBody?.details) ? responseBody.details : [])].join(' '));
    error.status = response.status;
    error.details = Array.isArray(responseBody?.details) ? responseBody.details : [];
    error.retryAfter = Number(response.headers.get('Retry-After')) || 0;
    throw error;
  }

  return responseBody;
};

export { API_BASE_URL };
