import { Router } from 'express';
import {
  deleteMyAvailabilityExceptionHandler,
  listMyAvailabilityExceptionsHandler,
  listMyAvailabilityHandler,
  updateMyAvailabilityHandler,
  upsertMyAvailabilityExceptionHandler,
} from './availability.controller.js';

const router = Router();

router.get('/me', listMyAvailabilityHandler);
router.put('/me', updateMyAvailabilityHandler);
router.get('/me/exceptions', listMyAvailabilityExceptionsHandler);
router.put('/me/exceptions/:date', upsertMyAvailabilityExceptionHandler);
router.delete('/me/exceptions/:date', deleteMyAvailabilityExceptionHandler);

export default router;
