import express from 'express';
import cors from 'cors';

import healthRoutes from './modules/health/health.routes.js';
import patientsRoutes from './modules/patients/patients.routes.js';
import notFoundMiddleware from './middlewares/notFoundMiddleware.js';
import errorMiddleware from './middlewares/errorMiddleware.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'psicopanel-api' });
});

app.use('/api/health', healthRoutes);
app.use('/api/patients', patientsRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
