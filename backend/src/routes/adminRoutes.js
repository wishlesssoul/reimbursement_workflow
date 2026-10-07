import express from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { seedDatabase } from '../services/seedService.js';

const router = express.Router();

router.get('/health', requireAuth, requireRole('Admin'), (req, res) => {
  return res.json({ status: 'ok', service: 'reimbursement-backend' });
});

router.get('/users', requireAuth, requireRole('Admin'), (req, res) => {
  const users = db.prepare('SELECT id, email, full_name, role, is_active, created_at FROM users ORDER BY role, full_name').all();
  return res.json({ users });
});

router.post('/seed-demo-data', requireAuth, requireRole('Admin'), (req, res) => {
  seedDatabase();
  return res.json({ message: 'Demo data was loaded successfully.' });
});

export default router;
