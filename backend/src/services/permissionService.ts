import { ParentChildRelationship } from '../models/ParentChildRelationship.js';
import { CameraAccessPermission } from '../models/CameraAccessPermission.js';
import { Child } from '../models/Child.js';
import { Camera } from '../models/Camera.js';
import { ApiError } from '../utils/errors.js';
import mongoose from 'mongoose';

/** Returns child IDs a parent is approved to access. */
export async function getApprovedChildIds(parentId: string): Promise<mongoose.Types.ObjectId[]> {
  const rels = await ParentChildRelationship.find({ parent: parentId, status: 'approved' }).select('child');
  return rels.map((r) => r.child as mongoose.Types.ObjectId);
}

/** Throws 403 if parent lacks approved relationship with child. */
export async function assertParentChildAccess(parentId: string, childId: string) {
  const rel = await ParentChildRelationship.findOne({
    parent: parentId,
    child: childId,
    status: 'approved',
  });
  if (!rel) throw new ApiError(403, 'You do not have approved access to this child');
  return rel;
}

/** Teacher can access child if child.teacher === teacherId or child's classroom.teacher === teacherId */
export async function assertTeacherChildAccess(teacherId: string, childId: string) {
  const child = await Child.findById(childId).populate('classroom', 'teacher');
  if (!child) throw new ApiError(404, 'Child not found');
  const classroomTeacher = (child.classroom as unknown as { teacher?: mongoose.Types.ObjectId })?.teacher;
  const ok =
    child.teacher?.toString() === teacherId ||
    classroomTeacher?.toString() === teacherId;
  if (!ok) throw new ApiError(403, 'Child is not assigned to you');
  return child;
}

/** Check camera access: admin/teacher-of-classroom always; parent needs approved relationship + permission. */
export async function assertCameraAccess(userId: string, role: string, cameraId: string) {
  const camera = await Camera.findById(cameraId);
  if (!camera) throw new ApiError(404, 'Camera not found');

  if (role === 'admin') return camera;

  if (role === 'teacher') {
    if (camera.classroom) {
      const { Classroom } = await import('../models/Classroom.js');
      const classroom = await Classroom.findById(camera.classroom);
      if (classroom?.teacher?.toString() === userId) return camera;
    }
    const perm = await CameraAccessPermission.findOne({ camera: cameraId, user: userId, status: 'active' });
    if (perm) return camera;
    throw new ApiError(403, 'You do not have access to this camera');
  }

  // parent
  const perm = await CameraAccessPermission.findOne({ camera: cameraId, user: userId, status: 'active' });
  if (!perm) throw new ApiError(403, 'You do not have access to this camera');

  // ensure at least one approved child is in this camera's classroom
  if (camera.classroom) {
    const childIds = await getApprovedChildIds(userId);
    const count = await Child.countDocuments({ _id: { $in: childIds }, classroom: camera.classroom });
    if (count === 0) throw new ApiError(403, 'Camera is not associated with your approved children');
  }
  return camera;
}
