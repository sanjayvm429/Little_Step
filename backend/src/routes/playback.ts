import { Router } from 'express';
import { getPlaybackCapability, proxyPlaybackHls, searchRecordings, startPlayback, stopPlayback } from '../controllers/playbackController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.get('/cameras/:cameraId/sessions/:sessionId/hls/*', proxyPlaybackHls);
router.use(authenticate);

router.get('/cameras/:cameraId/capability', getPlaybackCapability);
router.get('/cameras/:cameraId/recordings', searchRecordings);
router.post('/cameras/:cameraId/playback', startPlayback);
router.delete('/cameras/:cameraId/playback/:sessionId', stopPlayback);

export default router;
