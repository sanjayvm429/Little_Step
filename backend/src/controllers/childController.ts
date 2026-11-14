import { Request, Response } from 'express';
import { Child } from '../models/Child.js';
import { ParentChildRelationship } from '../models/ParentChildRelationship.js';
import { ApiError, asyncHandler } from '../utils/errors.js';
import { getApprovedChildIds, assertParentChildAccess } from '../services/permissionService.js';

export const listChildren = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  let children;

  if (role === 'admin') {
    children = await Child.find().populate('classroom', 'name').populate('teacher', 'fullName');
  } else if (role === 'teacher') {
    // children assigned to teacher directly or via classroom
    const { Classroom } = await import('../models/Classroom.js');
    const classrooms = await Classroom.find({ teacher: sub }).select('_id');
    const classIds = classrooms.map((c) => c._id);
    children = await Child.find({
      $or: [{ teacher: sub }, { classroom: { $in: classIds } }],
    }).populate('classroom', 'name');
  } else {
    const ids = await getApprovedChildIds(sub);
    children = await Child.find({ _id: { $in: ids } }).populate('classroom', 'name').populate('teacher', 'fullName');
  }

  res.json({ success: true, children });
});

export const getChild = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { role, sub } = req.user!;

  if (role === 'parent') await assertParentChildAccess(sub, id);
  else if (role === 'teacher') {
    const { assertTeacherChildAccess } = await import('../services/permissionService.js');
    await assertTeacherChildAccess(sub, id);
  }

  const child = await Child.findById(id).populate('classroom', 'name').populate('teacher', 'fullName');
  if (!child) throw new ApiError(404, 'Child not found');
  res.json({ success: true, child });
});

export const createChild = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Only administrators can register children');
  const child = await Child.create(req.body);
  res.status(201).json({ success: true, child });
});

export const updateChild = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Only administrators can update children');
  const child = await Child.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
  if (!child) throw new ApiError(404, 'Child not found');
  res.json({ success: true, child });
});

export const deleteChild = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Only administrators can delete children');
  const child = await Child.findByIdAndDelete(id);
  if (!child) throw new ApiError(404, 'Child not found');
  await ParentChildRelationship.deleteMany({ child: id });
  res.json({ success: true, message: 'Child deleted' });
});

// Parent requests access to a child (by admission number)
export const requestChildAccess = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'parent') throw new ApiError(403, 'Only parents can request access');
  const { admissionNumber, relationship } = req.body;

  const child = await Child.findOne({ admissionNumber: admissionNumber.toUpperCase() });
  if (!child) throw new ApiError(404, 'No child found with that admission number');

  const existing = await ParentChildRelationship.findOne({ parent: req.user!.sub, child: child._id });
  if (existing) throw new ApiError(409, 'A relationship request already exists');

  const rel = await ParentChildRelationship.create({
    parent: req.user!.sub,
    child: child._id,
    relationship,
    status: 'pending',
  });

  res.status(201).json({ success: true, relationship: rel });
});
