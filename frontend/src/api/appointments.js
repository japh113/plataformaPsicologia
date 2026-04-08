import { apiRequest } from './client';

export const getAppointments = async ({ date } = {}) => {
  const searchParams = new URLSearchParams();

  if (date) {
    searchParams.set('date', date);
  }

  const query = searchParams.toString();
  const response = await apiRequest(`/appointments${query ? `?${query}` : ''}`);
  return response.data;
};

export const createAppointment = async (payload) => {
  const response = await apiRequest('/appointments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const updateAppointment = async (id, payload) => {
  const response = await apiRequest(`/appointments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const deleteAppointment = async (id) => {
  const response = await apiRequest(`/appointments/${id}`, {
    method: 'DELETE',
  });

  return response.data;
};
