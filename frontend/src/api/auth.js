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

export const getBackofficeUsers = async () => {
  const response = await apiRequest('/auth/users');
  return response.data;
};

export const getPendingPsychologists = async () => {
  const response = await apiRequest('/auth/psychologists/pending');
  return response.data;
};

export const reviewPsychologist = async (userId, payload) => {
  const response = await apiRequest(`/auth/psychologists/${userId}/review`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const logout = () => {
  clearAuthToken();
};
