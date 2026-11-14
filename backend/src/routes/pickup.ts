import { Router } from 'express';
import {
  listPickupAuthorizations,
  createPickupAuthorization,
  reviewPickupAuthorization,
  deletePickupAuthorization,
} from '../controllers/pickupController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', listPickupAuthorizations);
router.post('/', authorize('parent'), createPickupAuthorization);
router.put('/:id/review', authorize('admin'), reviewPickupAuthorization);
router.delete('/:id', deletePickupAuthorization);

export default router;
