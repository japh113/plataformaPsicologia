import { Router } from 'express';
import { getPatients, getPatientById } from '../controllers/patientController.js';

const router = Router();
router.get('/', getPatients);
router.get('/:id', getPatientById);

export default router;
