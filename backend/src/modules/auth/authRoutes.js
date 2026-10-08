import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomUUID } from 'crypto';
import db from '../../shared/db.js';
import { config } from '../../shared/config.js';
import { requireAuth } from '../../shared/middleware/auth.js';

const router = express.Router();

function hashRefreshToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function createRefreshSession(userId) {
  const refreshToken = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked)
    VALUES (?, ?, ?, ?, 0)
  `).run(`REF-${randomUUID()}`, userId, hashRefreshToken(refreshToken), expiresAt);
  return refreshToken;
}

function createAccessToken(user) {
  return jwt.sign({
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
  }, config.jwtSecret, { expiresIn: '15m' });
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
  };
}

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(String(email).trim().toLowerCase());

  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const validPassword = bcrypt.compareSync(String(password), user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const token = createAccessToken(user);
  const refreshToken = createRefreshSession(user.id);

  return res.json({
    token,
    refreshToken,
    user: publicUser(user),
  });
});

router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body || {};
  if (typeof refreshToken !== 'string' || !refreshToken) {
    return res.status(400).json({ message: 'A refresh token is required.' });
  }

  const session = db.prepare(`
    SELECT refresh_tokens.id AS session_id, refresh_tokens.user_id, users.id AS id, users.email, users.full_name, users.role, users.is_active
    FROM refresh_tokens
    JOIN users ON users.id = refresh_tokens.user_id
    WHERE refresh_tokens.token_hash = ? AND refresh_tokens.revoked = 0 AND refresh_tokens.expires_at > ?
  `).get(hashRefreshToken(refreshToken), new Date().toISOString());

  if (!session || !session.is_active) {
    return res.status(401).json({ message: 'Refresh token is invalid or expired.' });
  }

  const rotateSession = db.transaction(() => {
    const revoked = db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ? AND revoked = 0').run(session.session_id);
    if (revoked.changes !== 1) return null;
    return createRefreshSession(session.user_id);
  }).immediate();

  if (!rotateSession) {
    return res.status(401).json({ message: 'Refresh token is invalid or expired.' });
  }

  return res.json({
    token: createAccessToken(session),
    refreshToken: rotateSession,
    user: publicUser(session),
  });
});

router.post('/logout', (req, res) => {
  const { refreshToken } = req.body || {};
  if (typeof refreshToken !== 'string' || !refreshToken) {
    return res.status(400).json({ message: 'A refresh token is required.' });
  }

  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?').run(hashRefreshToken(refreshToken));
  return res.json({ message: 'Session revoked successfully.' });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, full_name, role FROM users WHERE id = ?').get(req.user.id);

  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  return res.json({
    user: {
      ...publicUser(user),
    },
  });
});

export default router;
