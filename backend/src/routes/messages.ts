import { Router } from 'express';
import { listMessages, sendMessage, listConversations } from '../controllers/messageController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/conversations', listConversations);
router.get('/', listMessages);
router.post('/', sendMessage);

export default router;
