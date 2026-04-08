import express from 'express';
import cors from 'cors';

import authRoutes from './modules/auth/auth.routes.js';
import healthRoutes from './modules/health/health.routes.js';
import appointmentsRoutes from './modules/appointments/appointments.routes.js';
import availabilityRoutes from './modules/availability/availability.routes.js';
import patientsRoutes from './modules/patients/patients.routes.js';
import { authenticate } from './middlewares/authMiddleware.js';
import notFoundMiddleware from './middlewares/notFoundMiddleware.js';
import errorMiddleware from './middlewares/errorMiddleware.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/appointments', authenticate, appointmentsRoutes);
app.use('/api/availability', authenticate, availabilityRoutes);
app.use('/api/patients', authenticate, patientsRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
