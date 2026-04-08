import { apiRequest } from './client';

export const getPatients = async () => {
  const response = await apiRequest('/patients');
  return response.data;
};

export const createPatient = async (payload) => {
  const response = await apiRequest('/patients', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const updatePatient = async (id, payload) => {
  const response = await apiRequest(`/patients/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const createPatientTask = async (patientId, payload) => {
  const response = await apiRequest(`/patients/${patientId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const updatePatientTask = async (patientId, taskId, payload) => {
  const response = await apiRequest(`/patients/${patientId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const deletePatientTask = async (patientId, taskId) => {
  const response = await apiRequest(`/patients/${patientId}/tasks/${taskId}`, {
    method: 'DELETE',
  });

  return response.data;
};

export const createPatientSession = async (patientId, payload) => {
  const response = await apiRequest(`/patients/${patientId}/sessions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const updatePatientSession = async (patientId, sessionId, payload) => {
  const response = await apiRequest(`/patients/${patientId}/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const deletePatientSession = async (patientId, sessionId) => {
  const response = await apiRequest(`/patients/${patientId}/sessions/${sessionId}`, {
    method: 'DELETE',
  });

  return response.data;
};
