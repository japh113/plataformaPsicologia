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

export const getAppointmentWaitlist = async ({ date } = {}) => {
  const searchParams = new URLSearchParams();

  if (date) {
    searchParams.set('date', date);
  }

  const query = searchParams.toString();
  const response = await apiRequest(`/appointments/waitlist${query ? `?${query}` : ''}`);
  return response.data;
};

export const createAppointment = async (payload) => {
  const response = await apiRequest('/appointments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const createAppointmentWaitlistEntry = async (payload) => {
  const response = await apiRequest('/appointments/waitlist', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
};

export const reorderAppointmentWaitlistEntries = async (payload) => {
  const response = await apiRequest('/appointments/waitlist/reorder', {
    method: 'PATCH',
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

export const deleteAppointmentWaitlistEntry = async (id) => {
  const response = await apiRequest(`/appointments/waitlist/${id}`, {
    method: 'DELETE',
  });

  return response.data;
};

export const deleteAppointment = async (id) => {
  const response = await apiRequest(`/appointments/${id}`, {
    method: 'DELETE',
  });

  return response.data;
};

export const deleteFutureRecurringAppointments = async (id) => {
  const response = await apiRequest(`/appointments/${id}/recurrence`, {
    method: 'DELETE',
  });

  return response.data;
};
