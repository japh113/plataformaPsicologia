import { successResponse, errorResponse } from '../../utils/response.js';
import {
  getAllPatients,
  getPatientById,
  createPatient,
  updatePatient,
  deletePatient,
} from './patients.service.js';
import { validateCreatePatient } from './patients.validators.js';

export const listPatients = (req, res) => {
  const patients = getAllPatients();
  return successResponse(res, patients, 'Patients fetched successfully');
};

export const getPatient = (req, res) => {
  const patient = getPatientById(req.params.id);

  if (!patient) {
    return errorResponse(res, 'Patient not found', 404);
  }

  return successResponse(res, patient, 'Patient fetched successfully');
};

export const createPatientHandler = (req, res) => {
  const errors = validateCreatePatient(req.body);

  if (errors.length > 0) {
    return errorResponse(res, 'Validation error', 400, errors);
  }

  const patient = createPatient(req.body);
  return successResponse(res, patient, 'Patient created successfully', 201);
};

export const updatePatientHandler = (req, res) => {
  const patient = updatePatient(req.params.id, req.body);

  if (!patient) {
    return errorResponse(res, 'Patient not found', 404);
  }

  return successResponse(res, patient, 'Patient updated successfully');
};

export const deletePatientHandler = (req, res) => {
  const deleted = deletePatient(req.params.id);

  if (!deleted) {
    return errorResponse(res, 'Patient not found', 404);
  }

  return successResponse(res, null, 'Patient deleted successfully');
};