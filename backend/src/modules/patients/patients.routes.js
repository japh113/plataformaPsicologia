import { Router } from 'express';
import {
  listPatients,
  getPatient,
  createPatientHandler,
  updatePatientHandler,
  deletePatientHandler,
} from './patients.controller.js';

const router = Router();

router.get('/', listPatients);
router.get('/:id', getPatient);
router.post('/', createPatientHandler);
router.put('/:id', updatePatientHandler);
router.delete('/:id', deletePatientHandler);

export default router;