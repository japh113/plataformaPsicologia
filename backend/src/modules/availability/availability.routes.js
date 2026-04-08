import { Router } from 'express';
import { listMyAvailabilityHandler, updateMyAvailabilityHandler } from './availability.controller.js';

const router = Router();

router.get('/me', listMyAvailabilityHandler);
router.put('/me', updateMyAvailabilityHandler);

export default router;
