import { Router } from 'express';
import {
  confirmPasswordResetHandler,
  createCareRelationshipHandler,
  inviteCareRelationshipHandler,
  listAuditLogsHandler,
  listAvailablePsychologistsHandler,
  listBackofficeUsersHandler,
  listCareRelationshipsHandler,
  listPendingPsychologistsHandler,
  loginHandler,
  meHandler,
  requestCareRelationshipHandler,
  requestPasswordResetHandler,
  registerPatientHandler,
  registerPsychologistHandler,
  respondToCareRelationshipHandler,
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
router.get('/psychologists/available', authenticate, listAvailablePsychologistsHandler);
router.get('/users', authenticate, listBackofficeUsersHandler);
router.get('/audit-logs', authenticate, listAuditLogsHandler);
router.get('/care-relationships', authenticate, listCareRelationshipsHandler);
router.post('/care-relationships', authenticate, createCareRelationshipHandler);
router.post('/care-relationships/request', authenticate, requestCareRelationshipHandler);
router.post('/care-relationships/invite', authenticate, inviteCareRelationshipHandler);
router.patch('/care-relationships/:relationshipId', authenticate, updateCareRelationshipHandler);
router.patch('/care-relationships/:relationshipId/respond', authenticate, respondToCareRelationshipHandler);
router.get('/psychologists/pending', authenticate, listPendingPsychologistsHandler);
router.patch('/psychologists/:userId/review', authenticate, reviewPsychologistHandler);

export default router;
