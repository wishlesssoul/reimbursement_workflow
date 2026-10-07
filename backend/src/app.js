import express from 'express';
import cors from 'cors';
import db from './db.js';
import authRoutes from './routes/authRoutes.js';
import requestRoutes from './routes/requestRoutes.js';
import reviewerRoutes from './routes/reviewerRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { requestContext, logEvent } from './middleware/observability.js';

const app = express();

app.use(cors());
app.use(requestContext);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  return res.json({ status: 'ok', database: db.name });
});

app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/reviewer', reviewerRoutes);
app.use('/api/admin', adminRoutes);

app.use((err, req, res, next) => {
  logEvent('http.request.failed', {
    correlationId: req.correlationId,
    method: req.method,
    path: req.path,
    errorName: err.name,
    errorMessage: err.message,
  });
  res.status(500).json({ message: 'Internal server error' });
});

export default app;