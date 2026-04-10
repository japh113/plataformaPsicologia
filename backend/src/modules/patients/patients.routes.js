import { Router } from 'express';
import {
  listPatients,
  getPatient,
  createPatientHandler,
  updatePatientHandler,
  deletePatientHandler,
  upsertPatientInterviewHandler,
  createPatientTaskHandler,
  updatePatientTaskHandler,
  deletePatientTaskHandler,
  createPatientObjectiveHandler,
  updatePatientObjectiveHandler,
  deletePatientObjectiveHandler,
  createPatientClinicalNoteHandler,
  updatePatientClinicalNoteHandler,
  deletePatientClinicalNoteHandler,
} from './patients.controller.js';

const router = Router();

router.get('/', listPatients);
router.get('/:id', getPatient);
router.post('/', createPatientHandler);
router.put('/:id', updatePatientHandler);
router.delete('/:id', deletePatientHandler);
router.put('/:id/interview', upsertPatientInterviewHandler);

router.post('/:id/tasks', createPatientTaskHandler);
router.patch('/:id/tasks/:taskId', updatePatientTaskHandler);
router.delete('/:id/tasks/:taskId', deletePatientTaskHandler);
router.post('/:id/objectives', createPatientObjectiveHandler);
router.patch('/:id/objectives/:objectiveId', updatePatientObjectiveHandler);
router.delete('/:id/objectives/:objectiveId', deletePatientObjectiveHandler);
router.post('/:id/clinical-notes', createPatientClinicalNoteHandler);
router.patch('/:id/clinical-notes/:clinicalNoteId', updatePatientClinicalNoteHandler);
router.delete('/:id/clinical-notes/:clinicalNoteId', deletePatientClinicalNoteHandler);

export default router;
