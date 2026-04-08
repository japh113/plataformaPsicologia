import { Router } from 'express';
import { getAppointments } from '../controllers/appointmentController.js';

const router = Router();
router.get('/', getAppointments);

export default router;
