import { Router } from 'express';
import {
  listNvrs,
  getNvr,
  createNvr,
  updateNvr,
  deleteNvr,
  testNvrConnection,
  discoverNvrCameras,
  addNvrCameras,
  updateNvrCameraSelection,
  createDirectRtspNvr,
  testRtspStream,
} from '../controllers/nvrController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Admin-only management
router.get('/', authorize('admin'), listNvrs);
router.get('/:id', authorize('admin'), getNvr);
router.post('/', authorize('admin'), createNvr);
router.put('/:id', authorize('admin'), updateNvr);
router.delete('/:id', authorize('admin'), deleteNvr);
router.post('/:id/test', authorize('admin'), testNvrConnection);
router.post('/:id/discover', authorize('admin'), discoverNvrCameras);
router.post('/:id/cameras', authorize('admin'), addNvrCameras);
router.put('/:id/cameras/selection', authorize('admin'), updateNvrCameraSelection);
router.post('/direct-rtsp', authorize('admin'), createDirectRtspNvr);
router.post('/test-rtsp', authorize('admin'), testRtspStream);
// Unsaved form test/discover (no id)
router.post('/test-connection', authorize('admin'), testNvrConnection);
router.post('/discover', authorize('admin'), discoverNvrCameras);

export default router;
