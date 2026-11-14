import { Router } from 'express';
import { listAttendance, checkIn, checkOut, markStatus } from '../controllers/attendanceController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', listAttendance);
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.post('/status', markStatus);

export default router;
