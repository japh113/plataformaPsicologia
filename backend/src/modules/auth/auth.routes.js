import { Router } from 'express';
import {
  listPendingPsychologistsHandler,
  loginHandler,
  meHandler,
  registerPatientHandler,
  registerPsychologistHandler,
  reviewPsychologistHandler,
} from './auth.controller.js';
import { authenticate } from '../../middlewares/authMiddleware.js';

const router = Router();

router.post('/login', loginHandler);
router.post('/register/patient', registerPatientHandler);
router.post('/register/psychologist', registerPsychologistHandler);
router.get('/me', authenticate, meHandler);
router.get('/psychologists/pending', authenticate, listPendingPsychologistsHandler);
router.patch('/psychologists/:userId/review', authenticate, reviewPsychologistHandler);

export default router;
