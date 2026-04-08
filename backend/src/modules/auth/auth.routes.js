import { Router } from 'express';
import { loginHandler, meHandler } from './auth.controller.js';
import { authenticate } from '../../middlewares/authMiddleware.js';

const router = Router();

router.post('/login', loginHandler);
router.get('/me', authenticate, meHandler);

export default router;
