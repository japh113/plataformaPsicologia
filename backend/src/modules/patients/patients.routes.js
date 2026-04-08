import { Router } from 'express';
import {
  listPatients,
  getPatient,
  createPatientHandler,
  updatePatientHandler,
  deletePatientHandler,
  createPatientTaskHandler,
  updatePatientTaskHandler,
  deletePatientTaskHandler,
  createPatientSessionHandler,
  updatePatientSessionHandler,
  deletePatientSessionHandler,
} from './patients.controller.js';

const router = Router();

router.get('/', listPatients);
router.get('/:id', getPatient);
router.post('/', createPatientHandler);
router.put('/:id', updatePatientHandler);
router.delete('/:id', deletePatientHandler);

router.post('/:id/tasks', createPatientTaskHandler);
router.patch('/:id/tasks/:taskId', updatePatientTaskHandler);
router.delete('/:id/tasks/:taskId', deletePatientTaskHandler);
router.post('/:id/sessions', createPatientSessionHandler);
router.patch('/:id/sessions/:sessionId', updatePatientSessionHandler);
router.delete('/:id/sessions/:sessionId', deletePatientSessionHandler);

export default router;
