import { errorResponse, successResponse } from '../../utils/response.js';
import {
  deleteMyAvailabilityException,
  listMyAvailability,
  listMyAvailabilityExceptions,
  updateMyAvailability,
  upsertMyAvailabilityException,
} from './availability.service.js';
import {
  validateAvailabilityExceptionDate,
  validateAvailabilityExceptionPayload,
  validateAvailabilityPayload,
} from './availability.validators.js';

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

export const listMyAvailabilityExceptionsHandler = async (req, res, next) => {
  try {
    const exceptions = await listMyAvailabilityExceptions(req.user);
    return successResponse(res, exceptions, 'Availability exceptions fetched successfully');
  } catch (error) {
    return next(error);
  }
};

export const upsertMyAvailabilityExceptionHandler = async (req, res, next) => {
  try {
    const dateErrors = validateAvailabilityExceptionDate(req.params.date);
    const payloadErrors = validateAvailabilityExceptionPayload(req.body);
    const errors = [...dateErrors, ...payloadErrors];

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const availabilityException = await upsertMyAvailabilityException(req.params.date, req.body, req.user);
    return successResponse(res, availabilityException, 'Availability exception saved successfully');
  } catch (error) {
    return next(error);
  }
};

export const deleteMyAvailabilityExceptionHandler = async (req, res, next) => {
  try {
    const errors = validateAvailabilityExceptionDate(req.params.date);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const deleted = await deleteMyAvailabilityException(req.params.date, req.user);

    if (!deleted) {
      return errorResponse(res, 'Availability exception not found', 404);
    }

    return successResponse(res, null, 'Availability exception deleted successfully');
  } catch (error) {
    return next(error);
  }
};
