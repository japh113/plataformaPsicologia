import { errorResponse, successResponse } from '../../utils/response.js';
import {
  createAppointment,
  deleteAppointment,
  getAppointmentById,
  listAppointments,
  updateAppointment,
} from './appointments.service.js';
import {
  validateCreateAppointmentPayload,
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
