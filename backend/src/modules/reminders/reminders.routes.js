import { Router } from 'express';
import { listMyRemindersHandler } from './reminders.controller.js';

const router = Router();

router.get('/me', listMyRemindersHandler);

export default router;
