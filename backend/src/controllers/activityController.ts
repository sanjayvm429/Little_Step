import { Request, Response } from 'express';
import { Activity } from '../models/Activity.js';
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

export const listActivities = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  const { childId, date, from, to, category } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = {};
  if (childId) filter.child = childId;
  if (category) filter.category = category;
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

  const activities = await Activity.find(filter)
    .populate('child', 'fullName')
    .sort({ date: -1, startTime: -1 })
    .limit(500);
  res.json({ success: true, activities });
});

export const createActivity = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  if (role === 'parent') throw new ApiError(403, 'Only staff can record activities');

  const { childId, ...rest } = req.body;
  const child = await Child.findById(childId);
  if (!child) throw new ApiError(404, 'Child not found');
  if (role === 'teacher') await assertTeacherChildAccess(sub, childId);

  const activity = await Activity.create({
    ...rest,
    child: childId,
    classroom: child.classroom,
    recordedBy: sub,
    date: rest.date ? startOfDay(new Date(rest.date)) : startOfDay(new Date()),
  });

  // notify parents
  const rels = await ParentChildRelationship.find({ child: childId, status: 'approved' });
  await Promise.all(
    rels.map((r) =>
      notify({
        userId: r.parent.toString(),
        type: 'activity',
        title: `New activity: ${activity.title}`,
        body: `${child.fullName} — ${activity.category} recorded at ${new Date().toLocaleTimeString()}.`,
        data: { childId, activityId: activity._id },
      })
    )
  );

  res.status(201).json({ success: true, activity });
});

export const updateActivity = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  if (role === 'parent') throw new ApiError(403, 'Only staff can update activities');

  const activity = await Activity.findById(req.params.id);
  if (!activity) throw new ApiError(404, 'Activity not found');
  if (role === 'teacher') await assertTeacherChildAccess(sub, activity.child.toString());

  const updated = await Activity.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  res.json({ success: true, activity: updated });
});

export const deleteActivity = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  if (role === 'parent') throw new ApiError(403, 'Only staff can delete activities');

  const activity = await Activity.findById(req.params.id);
  if (!activity) throw new ApiError(404, 'Activity not found');
  if (role === 'teacher') await assertTeacherChildAccess(sub, activity.child.toString());

  await Activity.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Activity deleted' });
});
