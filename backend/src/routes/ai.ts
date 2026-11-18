import { Router } from 'express';
import { interpretHandler } from '../controllers/aiController.js';

const router = Router();

router.post('/interpret', interpretHandler);

export default router;
