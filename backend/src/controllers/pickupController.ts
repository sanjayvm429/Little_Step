import { Request, Response } from 'express';
import { PickupAuthorization } from '../models/PickupAuthorization.js';
import { Child } from '../models/Child.js';
import { ApiError, asyncHandler } from '../utils/errors.js';
import { notify } from '../services/notificationService.js';
import { getApprovedChildIds, assertParentChildAccess } from '../services/permissionService.js';
import { ParentChildRelationship } from '../models/ParentChildRelationship.js';

export const listPickupAuthorizations = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  let filter: Record<string, unknown> = {};

  if (role === 'parent') {
    const childIds = await getApprovedChildIds(sub);
    filter.child = { $in: childIds };
  } else if (role === 'teacher') {
    const { Classroom } = await import('../models/Classroom.js');
    const classrooms = await Classroom.find({ teacher: sub }).select('_id');
    const classIds = classrooms.map((c) => c._id);
    const children = await Child.find({ $or: [{ teacher: sub }, { classroom: { $in: classIds } }] }).select('_id');
    filter.child = { $in: children.map((c) => c._id) };
  }

  const records = await PickupAuthorization.find(filter).populate('child', 'fullName').sort({ createdAt: -1 });
  res.json({ success: true, authorizations: records });
});

export const createPickupAuthorization = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  if (role !== 'parent') throw new ApiError(403, 'Only parents can request pickup authorization');

  const { childId, name, phone, relationship } = req.body;
  await assertParentChildAccess(sub, childId);

  const record = await PickupAuthorization.create({
    child: childId,
    name,
    phone,
    relationship,
    requestedBy: sub,
    status: 'pending',
  });

  // notify admins
  const { User } = await import('../models/User.js');
  const admins = await User.find({ role: 'admin' }).select('_id');
  const child = await Child.findById(childId);
  await Promise.all(
    admins.map((a) =>
      notify({
        userId: a._id.toString(),
        type: 'pickup',
        title: 'New pickup authorization request',
        body: `${name} requested pickup access for ${child?.fullName ?? 'a child'}.`,
        data: { pickupId: record._id, childId },
      })
    )
  );

  res.status(201).json({ success: true, authorization: record });
});

export const reviewPickupAuthorization = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  if (role !== 'admin') throw new ApiError(403, 'Admin only');

  const { status } = req.body; // approved | rejected
  const record = await PickupAuthorization.findByIdAndUpdate(
    req.params.id,
    { status, reviewedBy: sub },
    { new: true }
  );
  if (!record) throw new ApiError(404, 'Authorization not found');

  await notify({
    userId: record.requestedBy.toString(),
    type: 'pickup',
    title: `Pickup authorization ${status}`,
    body: `Your pickup authorization request for ${record.name} was ${status}.`,
    data: { pickupId: record._id },
  });

  res.json({ success: true, authorization: record });
});

export const deletePickupAuthorization = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  const record = await PickupAuthorization.findById(req.params.id);
  if (!record) throw new ApiError(404, 'Authorization not found');

  if (role === 'admin') {
    await PickupAuthorization.findByIdAndDelete(req.params.id);
  } else if (role === 'parent' && record.requestedBy.toString() === sub) {
    await PickupAuthorization.findByIdAndDelete(req.params.id);
  } else {
    throw new ApiError(403, 'Not allowed');
  }
  res.json({ success: true, message: 'Authorization removed' });
});
