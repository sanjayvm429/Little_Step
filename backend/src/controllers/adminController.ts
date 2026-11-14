import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { User } from '../models/User.js';
import { Child } from '../models/Child.js';
import { ParentChildRelationship } from '../models/ParentChildRelationship.js';
import { Attendance } from '../models/Attendance.js';
import { Activity } from '../models/Activity.js';
import { Camera } from '../models/Camera.js';
import { Classroom } from '../models/Classroom.js';
import { ApiError, asyncHandler } from '../utils/errors.js';
import bcrypt from 'bcryptjs';

// ---- Users ----
export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const { role } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (role) filter.role = role;
  const users = await User.find(filter).select('-passwordHash -refreshTokenHash').sort({ createdAt: -1 });
  res.json({ success: true, users });
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { fullName, phone, role } = req.body;
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { fullName, phone, ...(role ? { role } : {}) },
    { new: true, runValidators: true }
  ).select('-passwordHash -refreshTokenHash');
  if (!user) throw new ApiError(404, 'User not found');
  res.json({ success: true, user });
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  if (req.params.id === req.user!.sub) throw new ApiError(400, 'Cannot delete your own account');
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  res.json({ success: true, message: 'User deleted' });
});

// ---- Relationships ----
export const listRelationships = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  const rels = await ParentChildRelationship.find(filter)
    .populate('parent', 'fullName email phone')
    .populate('child', 'fullName admissionNumber')
    .sort({ createdAt: -1 });
  res.json({ success: true, relationships: rels });
});

export const reviewRelationship = asyncHandler(async (req: Request, res: Response) => {
  const { status, permissions } = req.body; // approved | rejected
  const rel = await ParentChildRelationship.findByIdAndUpdate(
    req.params.id,
    { status, ...(permissions ? { permissions } : {}) },
    { new: true }
  );
  if (!rel) throw new ApiError(404, 'Relationship not found');

  const { notify } = await import('../services/notificationService.js');
  await notify({
    userId: rel.parent.toString(),
    type: 'announcement',
    title: `Child access ${status}`,
    body: `Your access request was ${status}.`,
    data: { relationshipId: rel._id, childId: rel.child },
  });

  res.json({ success: true, relationship: rel });
});

// ---- Dashboard stats ----
export const getStats = asyncHandler(async (_req: Request, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalChildren,
    totalParents,
    totalTeachers,
    totalClassrooms,
    totalCameras,
    onlineCameras,
    todayAttendance,
    pendingApprovals,
    pendingPickups,
    openIncidents,
  ] = await Promise.all([
    Child.countDocuments({ status: 'active' }),
    User.countDocuments({ role: 'parent' }),
    User.countDocuments({ role: 'teacher' }),
    Classroom.countDocuments(),
    Camera.countDocuments(),
    Camera.countDocuments({ status: 'online' }),
    Attendance.countDocuments({ date: today, status: { $in: ['present', 'late'] } }),
    ParentChildRelationship.countDocuments({ status: 'pending' }),
    (await import('../models/PickupAuthorization.js')).PickupAuthorization.countDocuments({ status: 'pending' }),
    (await import('../models/SafetyIncident.js')).SafetyIncident.countDocuments({ status: { $in: ['open', 'investigating'] } }),
  ]);

  res.json({
    success: true,
    stats: {
      totalChildren,
      totalParents,
      totalTeachers,
      totalClassrooms,
      totalCameras,
      onlineCameras,
      offlineCameras: totalCameras - onlineCameras,
      todayAttendance,
      pendingApprovals,
      pendingPickups,
      openIncidents,
    },
  });
});

// ---- Attendance reports ----
export const getAttendanceReport = asyncHandler(async (req: Request, res: Response) => {
  const { from, to, classroomId } = req.query as Record<string, string>;
  const match: Record<string, unknown> = {};
  if (from || to) {
    match.date = {};
    if (from) (match.date as Record<string, Date>).$gte = new Date(from);
    if (to) (match.date as Record<string, Date>).$lte = new Date(to);
  }
  const pipeline: mongoose.PipelineStage[] = [];
  if (Object.keys(match).length) pipeline.push({ $match: match });
  if (classroomId) {
    const children = await Child.find({ classroom: classroomId }).select('_id');
    pipeline.push({ $match: { child: { $in: children.map((c) => c._id) } } });
  }
  pipeline.push(
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } }, absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } }, total: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  );

  const report = await Attendance.aggregate(pipeline);
  res.json({ success: true, report });
});
