import { Router } from 'express';
import { listAnnouncements, createAnnouncement, deleteAnnouncement } from '../controllers/announcementController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', listAnnouncements);
router.post('/', createAnnouncement);
router.delete('/:id', deleteAnnouncement);

export default router;
