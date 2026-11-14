import { Request, Response } from 'express';
import { SafetyIncident } from '../models/SafetyIncident.js';
import { Child } from '../models/Child.js';
import { ApiError, asyncHandler } from '../utils/errors.js';
import { notify } from '../services/notificationService.js';
import { assertTeacherChildAccess } from '../services/permissionService.js';
import { ParentChildRelationship } from '../models/ParentChildRelationship.js';

export const listIncidents = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  let filter: Record<string, unknown> = {};

  if (role === 'parent') {
    const childIds = (
      await ParentChildRelationship.find({ parent: sub, status: 'approved' }).select('child')
    ).map((r) => r.child);
    filter.child = { $in: childIds };
  } else if (role === 'teacher') {
    const { Classroom } = await import('../models/Classroom.js');
    const classrooms = await Classroom.find({ teacher: sub }).select('_id');
    const classIds = classrooms.map((c) => c._id);
    const children = await Child.find({ $or: [{ teacher: sub }, { classroom: { $in: classIds } }] }).select('_id');
    filter.child = { $in: children.map((c) => c._id) };
  }

  const incidents = await SafetyIncident.find(filter).populate('child', 'fullName').populate('reportedBy', 'fullName').sort({ createdAt: -1 });
  res.json({ success: true, incidents });
});

export const createIncident = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  if (role === 'parent') throw new ApiError(403, 'Parents cannot report incidents');

  const { childId, type, severity, description, actionsTaken } = req.body;
  if (childId) {
    const child = await Child.findById(childId);
    if (!child) throw new ApiError(404, 'Child not found');
    if (role === 'teacher') await assertTeacherChildAccess(sub, childId);
  }

  const incident = await SafetyIncident.create({
    child: childId,
    type,
    severity,
    description,
    actionsTaken,
    reportedBy: sub,
  });

  // notify admins + parents of the child
  const { User } = await import('../models/User.js');
  const admins = await User.find({ role: 'admin' }).select('_id');
  const child = childId ? await Child.findById(childId) : null;
  const rels = childId ? await ParentChildRelationship.find({ child: childId, status: 'approved' }).select('parent') : [];

  const targets = [...admins.map((a) => a._id.toString()), ...rels.map((r) => r.parent.toString())];
  await Promise.all(
    targets.map((uid) =>
      notify({
        userId: uid,
        type: 'safety',
        title: `Safety incident: ${type}`,
        body: description.slice(0, 200),
        data: { incidentId: incident._id, childId, childName: child?.fullName },
      })
    )
  );

  res.status(201).json({ success: true, incident });
});

export const updateIncident = asyncHandler(async (req: Request, res: Response) => {
  const { role } = req.user!;
  if (role === 'parent') throw new ApiError(403, 'Not allowed');
  const incident = await SafetyIncident.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!incident) throw new ApiError(404, 'Incident not found');
  res.json({ success: true, incident });
});
