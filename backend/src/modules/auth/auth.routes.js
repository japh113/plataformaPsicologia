import { getOwnIdentityHandler, updateOwnIdentityHandler, requestVerificationHandler, confirmVerificationHandler } from './identity.controller.js';
import { Router } from 'express';
import {
  acceptCareRelationshipInviteHandler,
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
import { authenticate, authorizeClinical } from '../../middlewares/authMiddleware.js';

const router = Router();

router.post('/login', loginHandler);
router.post('/password-reset/request', requestPasswordResetHandler);
router.post('/password-reset/confirm', confirmPasswordResetHandler);
router.post('/register/patient', registerPatientHandler);
router.post('/register/psychologist', registerPsychologistHandler);
router.get('/identity', authenticate, getOwnIdentityHandler);
router.patch('/identity', authenticate, updateOwnIdentityHandler);
router.post('/verification/:channel/request', authenticate, requestVerificationHandler);
router.post('/verification/:channel/confirm', authenticate, confirmVerificationHandler);
router.get('/me', authenticate, meHandler);
router.get('/psychologists/available', authenticate, listAvailablePsychologistsHandler);
router.get('/users', authenticate, listBackofficeUsersHandler);
router.get('/audit-logs', authenticate, listAuditLogsHandler);
router.get('/care-relationships', authenticate, listCareRelationshipsHandler);
router.post('/care-relationships', authenticate, createCareRelationshipHandler);
router.post('/care-relationships/request', authenticate, authorizeClinical, requestCareRelationshipHandler);
router.post('/care-relationships/invite', authenticate, authorizeClinical, inviteCareRelationshipHandler);
router.post('/care-relationships/accept-code', authenticate, authorizeClinical, acceptCareRelationshipInviteHandler);
router.patch('/care-relationships/:relationshipId', authenticate, updateCareRelationshipHandler);
router.patch('/care-relationships/:relationshipId/respond', authenticate, authorizeClinical, respondToCareRelationshipHandler);
router.get('/psychologists/pending', authenticate, listPendingPsychologistsHandler);
router.patch('/psychologists/:userId/review', authenticate, reviewPsychologistHandler);

export default router;
