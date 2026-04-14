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

export const getAvailablePsychologists = async () => {
  const response = await apiRequest('/auth/psychologists/available');
  return response.data;
};

export const getPendingPsychologists = async () => {
  const response = await apiRequest('/auth/psychologists/pending');
  return response.data;
};

export const getAuditLogs = async (filters = {}) => {
  const query = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });

  const response = await apiRequest(`/auth/audit-logs${query.toString() ? `?${query.toString()}` : ''}`);
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

export const requestCareRelationship = async (payload) => {
  const response = await apiRequest('/auth/care-relationships/request', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const inviteCareRelationship = async (payload) => {
  const response = await apiRequest('/auth/care-relationships/invite', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const respondToCareRelationship = async (relationshipId, payload) => {
  const response = await apiRequest(`/auth/care-relationships/${relationshipId}/respond`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const acceptCareRelationshipByCode = async (payload) => {
  const response = await apiRequest('/auth/care-relationships/accept-code', {
    method: 'POST',
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
