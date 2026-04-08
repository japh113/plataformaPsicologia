import { successResponse } from '../../utils/response.js';
import { listMyReminders } from './reminders.service.js';

export const listMyRemindersHandler = async (req, res, next) => {
  try {
    const reminders = await listMyReminders(req.user);
    return successResponse(res, reminders, 'Reminders fetched successfully');
  } catch (error) {
    return next(error);
  }
};
