import { Router } from 'express';
import { clearAuth, isAuthenticated, verifyAccessCode } from '../services/authService.js';

const router = Router();

router.get('/auth/status', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

router.post('/auth/verify', verifyAccessCode);

router.post('/auth/logout', clearAuth);

export default router;
