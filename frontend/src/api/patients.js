import { apiRequest } from './client';

export const getPatients = async () => {
  const response = await apiRequest('/patients');
  return response.data;
};

export const getPatient = async (id) => {
  const response = await apiRequest(`/patients/${id}`);
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

export const upsertPatientInterview = async (id, payload) => {
  const response = await apiRequest(`/patients/${id}/interview`, {
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

export const createPatientObjective = async (patientId, payload) => {
  const response = await apiRequest(`/patients/${patientId}/objectives`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const updatePatientObjective = async (patientId, objectiveId, payload) => {
  const response = await apiRequest(`/patients/${patientId}/objectives/${objectiveId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const deletePatientObjective = async (patientId, objectiveId) => {
  const response = await apiRequest(`/patients/${patientId}/objectives/${objectiveId}`, {
    method: 'DELETE',
  });

  return response.data;
};

export const createPatientClinicalNote = async (patientId, payload) => {
  const response = await apiRequest(`/patients/${patientId}/clinical-notes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const updatePatientClinicalNote = async (patientId, clinicalNoteId, payload) => {
  const response = await apiRequest(`/patients/${patientId}/clinical-notes/${clinicalNoteId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const deletePatientClinicalNote = async (patientId, clinicalNoteId) => {
  const response = await apiRequest(`/patients/${patientId}/clinical-notes/${clinicalNoteId}`, {
    method: 'DELETE',
  });

  return response.data;
};
