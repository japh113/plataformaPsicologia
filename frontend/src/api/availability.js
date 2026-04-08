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
