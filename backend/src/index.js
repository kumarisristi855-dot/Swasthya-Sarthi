import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import hospitalsRouter from './routes/hospitals.js';
import symptomSearchRouter from './routes/symptomSearch.js';
import appointmentsRouter from './routes/appointments.js';
import doctorsRouter from './routes/doctors.js';
import doctorHospitalsRouter from './routes/doctorHospitals.js';
import directoryRouter from './routes/directory.js';
import outbreaksRouter from './routes/outbreaks.js';
import geolocationRouter from './routes/geolocation.js';
import { startAppointmentReminderScheduler } from './services/notifications/appointmentReminders.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '3mb' }));

// Routes
app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/hospitals', hospitalsRouter);
app.use('/api', symptomSearchRouter);
app.use('/api', appointmentsRouter);
app.use('/api', doctorsRouter);
app.use('/api/doctors-hospitals', doctorHospitalsRouter);
app.use('/api/directory', directoryRouter);
app.use('/api/outbreaks', outbreaksRouter);
app.use('/api/geolocation', geolocationRouter);

// Base route fallback
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: `Cannot ${req.method} ${req.baseUrl || req.path}`,
      code: 'NOT_FOUND'
    }
  });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startAppointmentReminderScheduler();
  });
}

export default app;
