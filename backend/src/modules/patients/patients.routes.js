import { Router } from 'express';
import {
  listPatients,
  getPatientFollowUpHandler,
  getPatient,
  createPatientHandler,
  updatePatientHandler,
  deletePatientHandler,
  createPatientTaskHandler,
  updatePatientTaskHandler,
  deletePatientTaskHandler,
  createPatientClinicalNoteHandler,
  updatePatientClinicalNoteHandler,
  deletePatientClinicalNoteHandler,
} from './patients.controller.js';

const router = Router();

router.get('/', listPatients);
router.get('/:id', getPatient);
router.get('/:id/follow-up', getPatientFollowUpHandler);
router.post('/', createPatientHandler);
router.put('/:id', updatePatientHandler);
router.delete('/:id', deletePatientHandler);

router.post('/:id/tasks', createPatientTaskHandler);
router.patch('/:id/tasks/:taskId', updatePatientTaskHandler);
router.delete('/:id/tasks/:taskId', deletePatientTaskHandler);
router.post('/:id/clinical-notes', createPatientClinicalNoteHandler);
router.patch('/:id/clinical-notes/:clinicalNoteId', updatePatientClinicalNoteHandler);
router.delete('/:id/clinical-notes/:clinicalNoteId', deletePatientClinicalNoteHandler);

export default router;
