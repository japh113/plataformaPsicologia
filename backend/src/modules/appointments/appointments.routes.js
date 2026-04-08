import { Router } from 'express';
import {
  createAppointmentHandler,
  deleteAppointmentHandler,
  getAppointmentHandler,
  listAppointmentsHandler,
  updateAppointmentHandler,
} from './appointments.controller.js';

const router = Router();

router.get('/', listAppointmentsHandler);
router.get('/:id', getAppointmentHandler);
router.post('/', createAppointmentHandler);
router.patch('/:id', updateAppointmentHandler);
router.delete('/:id', deleteAppointmentHandler);

export default router;
