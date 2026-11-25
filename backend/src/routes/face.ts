import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import {
  createEmployee,
  createRegistrationLink,
  deleteEmployeeFaceData,
  getEmployee,
  getEmployeeFaceImage,
  getFaceAttendance,
  getFaceHealth,
  getMobileRegistrationInfo,
  getRecognitionStatus,
  getRegistrationLinkStatus,
  getUnknownSnapshot,
  listEmployees,
  listFaceCameras,
  processRecognitionFrame,
  submitMobileRegistration,
  updateEmployee,
  updateEmployeeFaces,
  updateFaceCamera,
  updateRecognitionSettings,
  validateFace,
} from '../controllers/faceController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ApiError } from '../utils/errors.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 3, fields: 16 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(new ApiError(400, 'Only JPEG, PNG, and WebP images are accepted'));
      return;
    }
    callback(null, true);
  },
});
const mobileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const faceImages = upload.fields([
  { name: 'front_image', maxCount: 1 },
  { name: 'left_image', maxCount: 1 },
  { name: 'right_image', maxCount: 1 },
]);

router.post('/mobile-registration/info', mobileLimiter, getMobileRegistrationInfo);
router.post(
  '/mobile-registration/submit',
  mobileLimiter,
  faceImages,
  submitMobileRegistration,
);

router.use(authenticate, authorize('admin'));

router.get('/health', getFaceHealth);
router.get('/employees', listEmployees);
router.get('/employees/:employeeId', getEmployee);
router.post('/faces/validate', upload.single('image'), validateFace);
router.post('/employees', faceImages, createEmployee);
router.put('/employees/:employeeId', updateEmployee);
router.put('/employees/:employeeId/faces', faceImages, updateEmployeeFaces);
router.delete('/employees/:employeeId/face-data', deleteEmployeeFaceData);
router.get('/employees/:employeeId/faces/:position', getEmployeeFaceImage);
router.post('/registration-links', createRegistrationLink);
router.get('/registration-links/:tokenId/status', getRegistrationLinkStatus);
router.get('/cameras', listFaceCameras);
router.put('/cameras/:cameraId', updateFaceCamera);
router.get('/attendance', getFaceAttendance);
router.get('/recognition/status', getRecognitionStatus);
router.get('/recognition/unknowns/:eventId/snapshot', getUnknownSnapshot);
router.put('/recognition/settings', updateRecognitionSettings);
router.post(
  '/recognition/process-frame',
  upload.single('frame_image'),
  processRecognitionFrame,
);

export default router;
