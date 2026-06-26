import { Router } from 'express';
import { getPublicAppConfig } from '../services/appConfigService.js';

const router = Router();

router.get('/public/config', (_req, res) => {
  res.json(getPublicAppConfig());
});

export default router;
