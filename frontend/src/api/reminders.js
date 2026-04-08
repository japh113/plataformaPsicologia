import { apiRequest } from './client';

export const getMyReminders = async () => {
  const response = await apiRequest('/reminders/me');
  return response.data;
};
