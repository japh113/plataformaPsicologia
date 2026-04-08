import { apiRequest, clearAuthToken, setAuthToken } from './client';

export const login = async (payload) => {
  const response = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const session = response.data;
  setAuthToken(session.token);
  return session;
};

export const getCurrentUser = async () => {
  const response = await apiRequest('/auth/me');
  return response.data;
};

export const logout = () => {
  clearAuthToken();
};
