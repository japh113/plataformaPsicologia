import { Router } from 'express';
import {
  createMyUnavailableAvailabilityRangeHandler,
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
router.post('/me/exceptions/range', createMyUnavailableAvailabilityRangeHandler);
router.put('/me/exceptions/:date', upsertMyAvailabilityExceptionHandler);
router.delete('/me/exceptions/:date', deleteMyAvailabilityExceptionHandler);

export default router;
