import { Router } from 'express';
import {
  listUsers,
  updateUser,
  deleteUser,
  listRelationships,
  reviewRelationship,
  getStats,
  getAttendanceReport,
} from '../controllers/adminController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, authorize('admin'));

router.get('/stats', getStats);
router.get('/users', listUsers);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.get('/relationships', listRelationships);
router.put('/relationships/:id/review', reviewRelationship);
router.get('/reports/attendance', getAttendanceReport);

export default router;
