import { Router } from 'express';
import {
  listChildren,
  getChild,
  createChild,
  updateChild,
  deleteChild,
  requestChildAccess,
} from '../controllers/childController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', listChildren);
router.get('/:id', getChild);
router.post('/', authorize('admin'), createChild);
router.put('/:id', authorize('admin'), updateChild);
router.delete('/:id', authorize('admin'), deleteChild);
router.post('/request-access', authorize('parent'), requestChildAccess);

export default router;
