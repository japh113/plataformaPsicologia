import { apiRequest } from './client';

export const getMyAvailability = async () => {
  const response = await apiRequest('/availability/me');
  return response.data;
};

export const updateMyAvailability = async (entries) => {
  const response = await apiRequest('/availability/me', {
    method: 'PUT',
    body: JSON.stringify({ entries }),
  });

  return response.data;
};

export const getMyAvailabilityExceptions = async () => {
  const response = await apiRequest('/availability/me/exceptions');
  return response.data;
};

export const createMyUnavailableAvailabilityRange = async ({ startDate, endDate }) => {
  const response = await apiRequest('/availability/me/exceptions/range', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate }),
  });

  return response.data;
};

export const updateMyUnavailableAvailabilityRange = async ({
  currentStartDate,
  currentEndDate,
  startDate,
  endDate,
}) => {
  const response = await apiRequest('/availability/me/exceptions/range', {
    method: 'PUT',
    body: JSON.stringify({ currentStartDate, currentEndDate, startDate, endDate }),
  });

  return response.data;
};

export const deleteMyUnavailableAvailabilityRange = async ({ startDate, endDate }) => {
  const response = await apiRequest('/availability/me/exceptions/range', {
    method: 'DELETE',
    body: JSON.stringify({ startDate, endDate }),
  });

  return response.data;
};

export const upsertMyAvailabilityException = async ({ date, isUnavailable, blocks }) => {
  const response = await apiRequest(`/availability/me/exceptions/${date}`, {
    method: 'PUT',
    body: JSON.stringify({ isUnavailable, blocks }),
  });

  return response.data;
};

export const deleteMyAvailabilityException = async (date) => {
  await apiRequest(`/availability/me/exceptions/${date}`, {
    method: 'DELETE',
  });
};
