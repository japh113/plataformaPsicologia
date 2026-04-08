import { Router } from 'express';
import { getNotes } from '../controllers/noteController.js';

const router = Router();
router.get('/', getNotes);

export default router;
