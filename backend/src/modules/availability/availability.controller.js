import { errorResponse, successResponse } from '../../utils/response.js';
import { listMyAvailability, updateMyAvailability } from './availability.service.js';
import { validateAvailabilityPayload } from './availability.validators.js';

export const listMyAvailabilityHandler = async (req, res, next) => {
  try {
    const availability = await listMyAvailability(req.user);
    return successResponse(res, availability, 'Availability fetched successfully');
  } catch (error) {
    return next(error);
  }
};

export const updateMyAvailabilityHandler = async (req, res, next) => {
  try {
    const errors = validateAvailabilityPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const availability = await updateMyAvailability(req.body.entries, req.user);
    return successResponse(res, availability, 'Availability updated successfully');
  } catch (error) {
    return next(error);
  }
};
