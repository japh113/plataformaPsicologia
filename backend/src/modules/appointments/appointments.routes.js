import { Router } from 'express';
import {
  createAppointmentHandler,
  createWaitlistEntryHandler,
  deleteFutureRecurringAppointmentsHandler,
  deleteAppointmentHandler,
  deleteWaitlistEntryHandler,
  getAppointmentHandler,
  listAppointmentsHandler,
  listWaitlistEntriesHandler,
  reorderWaitlistEntriesHandler,
  updateAppointmentHandler,
} from './appointments.controller.js';

const router = Router();

router.get('/', listAppointmentsHandler);
router.get('/waitlist', listWaitlistEntriesHandler);
router.post('/waitlist', createWaitlistEntryHandler);
router.patch('/waitlist/reorder', reorderWaitlistEntriesHandler);
router.delete('/waitlist/:id', deleteWaitlistEntryHandler);
router.get('/:id', getAppointmentHandler);
router.post('/', createAppointmentHandler);
router.patch('/:id', updateAppointmentHandler);
router.delete('/:id/recurrence', deleteFutureRecurringAppointmentsHandler);
router.delete('/:id', deleteAppointmentHandler);

export default router;
