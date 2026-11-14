import { Request, Response } from 'express';
import { Attendance } from '../models/Attendance.js';
import { Child } from '../models/Child.js';
import { ApiError, asyncHandler } from '../utils/errors.js';
import { notify } from '../services/notificationService.js';
import { getApprovedChildIds, assertTeacherChildAccess } from '../services/permissionService.js';
import { ParentChildRelationship } from '../models/ParentChildRelationship.js';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export const listAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  const { childId, date, from, to } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = {};
  if (childId) filter.child = childId;
  if (date) filter.date = startOfDay(new Date(date));
  if (from || to) {
    filter.date = {};
    if (from) (filter.date as Record<string, Date>).$gte = startOfDay(new Date(from));
    if (to) (filter.date as Record<string, Date>).$lte = startOfDay(new Date(to));
  }

  if (role === 'parent') {
    const ids = await getApprovedChildIds(sub);
    filter.child = { $in: ids };
    if (childId) {
      const { assertParentChildAccess } = await import('../services/permissionService.js');
      await assertParentChildAccess(sub, childId);
      filter.child = childId;
    }
  } else if (role === 'teacher') {
    const { Classroom } = await import('../models/Classroom.js');
    const classrooms = await Classroom.find({ teacher: sub }).select('_id');
    const classIds = classrooms.map((c) => c._id);
    const children = await Child.find({ $or: [{ teacher: sub }, { classroom: { $in: classIds } }] }).select('_id');
    filter.child = { $in: children.map((c) => c._id) };
  }

  const records = await Attendance.find(filter).populate('child', 'fullName admissionNumber').sort({ date: -1 }).limit(500);
  res.json({ success: true, attendance: records });
});

export const checkIn = asyncHandler(async (req: Request, res: Response) => {
  const { childId, notes } = req.body;
  const { role, sub } = req.user!;
  if (role === 'parent') throw new ApiError(403, 'Only staff can mark attendance');

  const child = await Child.findById(childId);
  if (!child) throw new ApiError(404, 'Child not found');
  if (role === 'teacher') await assertTeacherChildAccess(sub, childId);

  const today = startOfDay(new Date());
  const record = await Attendance.findOneAndUpdate(
    { child: childId, date: today },
    {
      $set: { checkIn: new Date(), status: 'present', markedBy: sub, notes, classroom: child.classroom },
      $setOnInsert: { child: childId, date: today },
    },
    { upsert: true, new: true }
  );

  // notify approved parents
  const rels = await ParentChildRelationship.find({ child: childId, status: 'approved' });
  await Promise.all(
    rels.map((r) =>
      notify({
        userId: r.parent.toString(),
        type: 'check_in',
        title: `${child.fullName} checked in`,
        body: `${child.fullName} was checked in at ${new Date().toLocaleTimeString()}.`,
        data: { childId, attendanceId: record._id },
      })
    )
  );

  res.json({ success: true, attendance: record });
});

export const checkOut = asyncHandler(async (req: Request, res: Response) => {
  const { childId, notes } = req.body;
  const { role, sub } = req.user!;
  if (role === 'parent') throw new ApiError(403, 'Only staff can mark attendance');

  const child = await Child.findById(childId);
  if (!child) throw new ApiError(404, 'Child not found');
  if (role === 'teacher') await assertTeacherChildAccess(sub, childId);

  const today = startOfDay(new Date());
  const record = await Attendance.findOneAndUpdate(
    { child: childId, date: today },
    { $set: { checkOut: new Date(), markedBy: sub, ...(notes ? { notes } : {}) } },
    { new: true }
  );
  if (!record) throw new ApiError(404, 'No check-in record for today');

  const rels = await ParentChildRelationship.find({ child: childId, status: 'approved' });
  await Promise.all(
    rels.map((r) =>
      notify({
        userId: r.parent.toString(),
        type: 'check_out',
        title: `${child.fullName} checked out`,
        body: `${child.fullName} was checked out at ${new Date().toLocaleTimeString()}.`,
        data: { childId, attendanceId: record._id },
      })
    )
  );

  res.json({ success: true, attendance: record });
});

export const markStatus = asyncHandler(async (req: Request, res: Response) => {
  const { childId, date, status, notes } = req.body;
  const { role, sub } = req.user!;
  if (role === 'parent') throw new ApiError(403, 'Only staff can mark attendance');

  const child = await Child.findById(childId);
  if (!child) throw new ApiError(404, 'Child not found');
  if (role === 'teacher') await assertTeacherChildAccess(sub, childId);

  const day = startOfDay(new Date(date));
  const record = await Attendance.findOneAndUpdate(
    { child: childId, date: day },
    { $set: { status, markedBy: sub, notes, classroom: child.classroom } },
    { upsert: true, new: true }
  );
  res.json({ success: true, attendance: record });
});
