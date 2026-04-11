import { errorResponse, successResponse } from '../../utils/response.js';
import {
  createAppointment,
  createWaitlistEntry,
  deleteFutureRecurringAppointments,
  deleteAppointment,
  deleteWaitlistEntry,
  getAppointmentById,
  listAppointments,
  listWaitlistEntries,
  reorderWaitlistEntries,
  updateAppointment,
} from './appointments.service.js';
import {
  validateCreateAppointmentPayload,
  validateCreateWaitlistEntryPayload,
  validateReorderWaitlistEntriesPayload,
  validateUpdateAppointmentPayload,
} from './appointments.validators.js';
import { ensurePsychologist } from '../auth/auth.permissions.js';

export const listAppointmentsHandler = async (req, res, next) => {
  try {
    const appointments = await listAppointments({ date: req.query.date || null, actor: req.user });
    return successResponse(res, appointments, 'Appointments fetched successfully');
  } catch (error) {
    return next(error);
  }
};

export const getAppointmentHandler = async (req, res, next) => {
  try {
    const appointment = await getAppointmentById(req.params.id, req.user);

    if (!appointment) {
      return errorResponse(res, 'Appointment not found', 404);
    }

    return successResponse(res, appointment, 'Appointment fetched successfully');
  } catch (error) {
    return next(error);
  }
};

export const listWaitlistEntriesHandler = async (req, res, next) => {
  try {
    const waitlistEntries = await listWaitlistEntries({ date: req.query.date || null, actor: req.user });
    return successResponse(res, waitlistEntries, 'Waitlist entries fetched successfully');
  } catch (error) {
    return next(error);
  }
};

export const createAppointmentHandler = async (req, res, next) => {
  try {
    ensurePsychologist(req.user);

    const errors = validateCreateAppointmentPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const appointment = await createAppointment(req.body, req.user);

    if (!appointment) {
      return errorResponse(res, 'Patient not found or not accessible', 404);
    }

    return successResponse(res, appointment, 'Appointment created successfully', 201);
  } catch (error) {
    return next(error);
  }
};

export const createWaitlistEntryHandler = async (req, res, next) => {
  try {
    ensurePsychologist(req.user);

    const errors = validateCreateWaitlistEntryPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const waitlistEntry = await createWaitlistEntry(req.body, req.user);

    if (!waitlistEntry) {
      return errorResponse(res, 'Patient not found or not accessible', 404);
    }

    return successResponse(res, waitlistEntry, 'Waitlist entry created successfully', 201);
  } catch (error) {
    return next(error);
  }
};

export const updateAppointmentHandler = async (req, res, next) => {
  try {
    ensurePsychologist(req.user);

    const errors = validateUpdateAppointmentPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const appointment = await updateAppointment(req.params.id, req.body, req.user);

    if (!appointment) {
      return errorResponse(res, 'Appointment not found', 404);
    }

    return successResponse(res, appointment, 'Appointment updated successfully');
  } catch (error) {
    return next(error);
  }
};

export const reorderWaitlistEntriesHandler = async (req, res, next) => {
  try {
    ensurePsychologist(req.user);

    const errors = validateReorderWaitlistEntriesPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const reorderedEntries = await reorderWaitlistEntries(req.body, req.user);
    return successResponse(res, reorderedEntries, 'Waitlist reordered successfully');
  } catch (error) {
    return next(error);
  }
};

export const deleteAppointmentHandler = async (req, res, next) => {
  try {
    ensurePsychologist(req.user);

    const deleted = await deleteAppointment(req.params.id, req.user);

    if (!deleted) {
      return errorResponse(res, 'Appointment not found', 404);
    }

    return successResponse(res, null, 'Appointment deleted successfully');
  } catch (error) {
    return next(error);
  }
};

export const deleteFutureRecurringAppointmentsHandler = async (req, res, next) => {
  try {
    ensurePsychologist(req.user);

    const deleted = await deleteFutureRecurringAppointments(req.params.id, req.user);

    if (!deleted) {
      return errorResponse(res, 'Appointment not found', 404);
    }

    return successResponse(res, deleted, 'Future recurring appointments deleted successfully');
  } catch (error) {
    return next(error);
  }
};

export const deleteWaitlistEntryHandler = async (req, res, next) => {
  try {
    ensurePsychologist(req.user);

    const deleted = await deleteWaitlistEntry(req.params.id, req.user);

    if (!deleted) {
      return errorResponse(res, 'Waitlist entry not found', 404);
    }

    return successResponse(res, null, 'Waitlist entry deleted successfully');
  } catch (error) {
    return next(error);
  }
};
