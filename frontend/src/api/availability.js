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
