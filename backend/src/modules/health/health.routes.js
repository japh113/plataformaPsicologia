import { Router } from 'express';
import db from '../../config/db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    await db.query('SELECT 1');

    return res.json({
      success: true,
      message: 'API is healthy',
      data: {
        database: 'connected',
      },
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      message: 'API is running but database is unavailable',
      details: [error.message],
    });
  }
});

export default router;
