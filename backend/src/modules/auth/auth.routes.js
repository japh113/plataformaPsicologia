import { Router } from 'express';
import {
  confirmPasswordResetHandler,
  createCareRelationshipHandler,
  listBackofficeUsersHandler,
  listCareRelationshipsHandler,
  listPendingPsychologistsHandler,
  loginHandler,
  meHandler,
  requestPasswordResetHandler,
  registerPatientHandler,
  registerPsychologistHandler,
  reviewPsychologistHandler,
  updateCareRelationshipHandler,
} from './auth.controller.js';
import { authenticate } from '../../middlewares/authMiddleware.js';

const router = Router();

router.post('/login', loginHandler);
router.post('/password-reset/request', requestPasswordResetHandler);
router.post('/password-reset/confirm', confirmPasswordResetHandler);
router.post('/register/patient', registerPatientHandler);
router.post('/register/psychologist', registerPsychologistHandler);
router.get('/me', authenticate, meHandler);
router.get('/users', authenticate, listBackofficeUsersHandler);
router.get('/care-relationships', authenticate, listCareRelationshipsHandler);
router.post('/care-relationships', authenticate, createCareRelationshipHandler);
router.patch('/care-relationships/:relationshipId', authenticate, updateCareRelationshipHandler);
router.get('/psychologists/pending', authenticate, listPendingPsychologistsHandler);
router.patch('/psychologists/:userId/review', authenticate, reviewPsychologistHandler);

export default router;
