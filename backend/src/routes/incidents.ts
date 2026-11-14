import { Router } from 'express';
import { listIncidents, createIncident, updateIncident } from '../controllers/incidentController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', listIncidents);
router.post('/', authorize('teacher', 'admin'), createIncident);
router.put('/:id', authorize('teacher', 'admin'), updateIncident);

export default router;
