import { successResponse, errorResponse } from '../../utils/response.js';
import {
  getAllPatients,
  getPatientById,
  createPatient,
  updatePatient,
  deletePatient,
  createPatientTask,
  updatePatientTask,
  deletePatientTask,
  createPatientObjective,
  updatePatientObjective,
  deletePatientObjective,
  upsertPatientInterview,
  createPatientSession,
  updatePatientSession,
  deletePatientSession,
} from './patients.service.js';
import { validateCreatePatient, validatePatientPayload } from './patients.validators.js';
import {
  validateCreateObjectivePayload,
  validateCreateTaskPayload,
  validateUpdateTaskPayload,
} from './patients.tasks.validators.js';
import { validatePatientInterviewPayload } from './patients.intake.validators.js';
import { validateCreateSessionPayload, validateUpdateSessionPayload } from './patients.sessions.validators.js';
import { createForbiddenError, ensurePsychologist, isPatient } from '../auth/auth.permissions.js';

export const listPatients = async (req, res, next) => {
  try {
    const patients = await getAllPatients(req.user);
    return successResponse(res, patients, 'Patients fetched successfully');
  } catch (error) {
    return next(error);
  }
};

export const getPatient = async (req, res, next) => {
  try {
    const patient = await getPatientById(req.params.id, req.user);

    if (!patient) {
      return errorResponse(res, 'Patient not found', 404);
    }

    return successResponse(res, patient, 'Patient fetched successfully');
  } catch (error) {
    return next(error);
  }
};

export const createPatientHandler = async (req, res, next) => {
  try {
    ensurePsychologist(req.user);

    const errors = validateCreatePatient(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const patient = await createPatient(req.body, req.user);
    return successResponse(res, patient, 'Patient created successfully', 201);
  } catch (error) {
    return next(error);
  }
};

export const updatePatientHandler = async (req, res, next) => {
  try {
    ensurePsychologist(req.user);

    const errors = validatePatientPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const patient = await updatePatient(req.params.id, req.body, req.user);

    if (!patient) {
      return errorResponse(res, 'Patient not found', 404);
    }

    return successResponse(res, patient, 'Patient updated successfully');
  } catch (error) {
    return next(error);
  }
};

export const deletePatientHandler = async (req, res, next) => {
  try {
    ensurePsychologist(req.user);

    const deleted = await deletePatient(req.params.id, req.user);

    if (!deleted) {
      return errorResponse(res, 'Patient not found', 404);
    }

    return successResponse(res, null, 'Patient deleted successfully');
  } catch (error) {
    return next(error);
  }
};

export const upsertPatientInterviewHandler = async (req, res, next) => {
  try {
    const errors = validatePatientInterviewPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const patient = await upsertPatientInterview(req.params.id, req.body, req.user);

    if (!patient) {
      return errorResponse(res, 'Patient not found', 404);
    }

    return successResponse(res, patient, 'Interview saved successfully');
  } catch (error) {
    return next(error);
  }
};

export const createPatientTaskHandler = async (req, res, next) => {
  try {
    ensurePsychologist(req.user);

    const errors = validateCreateObjectivePayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const task = await createPatientTask(req.params.id, req.body, req.user);

    if (!task) {
      return errorResponse(res, 'Patient not found', 404);
    }

    return successResponse(res, task, 'Task created successfully', 201);
  } catch (error) {
    return next(error);
  }
};

export const updatePatientTaskHandler = async (req, res, next) => {
  try {
    const errors = validateUpdateTaskPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    if (isPatient(req.user)) {
      const payloadKeys = Object.keys(req.body);
      const onlyCompletedUpdate = payloadKeys.length === 1 && payloadKeys[0] === 'completed';

      if (!onlyCompletedUpdate) {
        throw createForbiddenError('Patients can only update task completion');
      }
    }

    const task = await updatePatientTask(req.params.id, req.params.taskId, req.body, req.user);

    if (!task) {
      return errorResponse(res, 'Task not found', 404);
    }

    return successResponse(res, task, 'Task updated successfully');
  } catch (error) {
    return next(error);
  }
};

export const deletePatientTaskHandler = async (req, res, next) => {
  try {
    ensurePsychologist(req.user);

    const deleted = await deletePatientTask(req.params.id, req.params.taskId, req.user);

    if (!deleted) {
      return errorResponse(res, 'Task not found', 404);
    }

    return successResponse(res, null, 'Task deleted successfully');
  } catch (error) {
    return next(error);
  }
};

export const createPatientObjectiveHandler = async (req, res, next) => {
  try {
    ensurePsychologist(req.user);

    const errors = validateCreateTaskPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const objective = await createPatientObjective(req.params.id, req.body, req.user);

    if (!objective) {
      return errorResponse(res, 'Patient not found', 404);
    }

    return successResponse(res, objective, 'Objective created successfully', 201);
  } catch (error) {
    return next(error);
  }
};

export const updatePatientObjectiveHandler = async (req, res, next) => {
  try {
    const errors = validateUpdateTaskPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    if (isPatient(req.user)) {
      const payloadKeys = Object.keys(req.body);
      const onlyCompletedUpdate = payloadKeys.length === 1 && payloadKeys[0] === 'completed';

      if (!onlyCompletedUpdate) {
        throw createForbiddenError('Patients can only update objective completion');
      }
    }

    const objective = await updatePatientObjective(req.params.id, req.params.objectiveId, req.body, req.user);

    if (!objective) {
      return errorResponse(res, 'Objective not found', 404);
    }

    return successResponse(res, objective, 'Objective updated successfully');
  } catch (error) {
    return next(error);
  }
};

export const deletePatientObjectiveHandler = async (req, res, next) => {
  try {
    ensurePsychologist(req.user);

    const deleted = await deletePatientObjective(req.params.id, req.params.objectiveId, req.user);

    if (!deleted) {
      return errorResponse(res, 'Objective not found', 404);
    }

    return successResponse(res, null, 'Objective deleted successfully');
  } catch (error) {
    return next(error);
  }
};

export const createPatientSessionHandler = async (req, res, next) => {
  try {
    ensurePsychologist(req.user);

    const errors = validateCreateSessionPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const session = await createPatientSession(req.params.id, req.body, req.user);

    if (!session) {
      return errorResponse(res, 'Patient not found', 404);
    }

    return successResponse(res, session, 'Session created successfully', 201);
  } catch (error) {
    return next(error);
  }
};

export const updatePatientSessionHandler = async (req, res, next) => {
  try {
    ensurePsychologist(req.user);

    const errors = validateUpdateSessionPayload(req.body);

    if (errors.length > 0) {
      return errorResponse(res, 'Validation error', 400, errors);
    }

    const session = await updatePatientSession(req.params.id, req.params.sessionId, req.body, req.user);

    if (!session) {
      return errorResponse(res, 'Session not found', 404);
    }

    return successResponse(res, session, 'Session updated successfully');
  } catch (error) {
    return next(error);
  }
};

export const deletePatientSessionHandler = async (req, res, next) => {
  try {
    ensurePsychologist(req.user);

    const deleted = await deletePatientSession(req.params.id, req.params.sessionId, req.user);

    if (!deleted) {
      return errorResponse(res, 'Session not found', 404);
    }

    return successResponse(res, null, 'Session deleted successfully');
  } catch (error) {
    return next(error);
  }
};
