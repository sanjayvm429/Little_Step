import { Router } from 'express';
import {
  listCameras,
  getCamera,
  createCamera,
  updateCamera,
  deleteCamera,
  getStreamAccess,
  proxyStreamHls,
  testCamera,
  toggleCamera,
  grantCameraAccess,
  revokeCameraAccess,
} from '../controllers/cameraController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.get('/:id/hls/*', proxyStreamHls);
router.use(authenticate);

router.get('/', listCameras);
router.get('/:id', getCamera);
router.get('/:id/stream-access', getStreamAccess);
router.post('/', authorize('admin'), createCamera);
router.put('/:id', authorize('admin'), updateCamera);
router.delete('/:id', authorize('admin'), deleteCamera);
router.post('/:id/toggle', authorize('admin'), toggleCamera);
router.post('/:id/test', authorize('admin'), testCamera);
router.post('/permissions/grant', authorize('admin'), grantCameraAccess);
router.post('/permissions/:cameraId/:userId/revoke', authorize('admin'), revokeCameraAccess);

export default router;
