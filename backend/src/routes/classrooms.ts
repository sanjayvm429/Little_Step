import { Router } from 'express';
import {
  listClassrooms,
  getClassroom,
  createClassroom,
  updateClassroom,
  deleteClassroom,
} from '../controllers/classroomController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', listClassrooms);
router.get('/:id', getClassroom);
router.post('/', authorize('admin'), createClassroom);
router.put('/:id', authorize('admin'), updateClassroom);
router.delete('/:id', authorize('admin'), deleteClassroom);

export default router;
