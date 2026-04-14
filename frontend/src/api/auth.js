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

export const registerPatient = async (payload) => {
  const response = await apiRequest('/auth/register/patient', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const session = response.data;
  setAuthToken(session.token);
  return session;
};

export const registerPsychologist = async (payload) => {
  const response = await apiRequest('/auth/register/psychologist', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const requestPasswordReset = async (payload) => {
  const response = await apiRequest('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const confirmPasswordReset = async (payload) => {
  const response = await apiRequest('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
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

export const getCareRelationships = async () => {
  const response = await apiRequest('/auth/care-relationships');
  return response.data;
};

export const createCareRelationship = async (payload) => {
  const response = await apiRequest('/auth/care-relationships', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const updateCareRelationship = async (relationshipId, payload) => {
  const response = await apiRequest(`/auth/care-relationships/${relationshipId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

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
