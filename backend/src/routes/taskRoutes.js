import { Router } from 'express';
import { getTasks } from '../controllers/taskController.js';

const router = Router();
router.get('/', getTasks);

export default router;
