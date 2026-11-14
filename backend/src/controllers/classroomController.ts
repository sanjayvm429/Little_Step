import { Request, Response } from 'express';
import { Classroom } from '../models/Classroom.js';
import { ApiError, asyncHandler } from '../utils/errors.js';

export const listClassrooms = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  let filter = {};
  if (role === 'teacher') filter = { teacher: sub };
  const classrooms = await Classroom.find(filter).populate('teacher', 'fullName email');
  res.json({ success: true, classrooms });
});

export const getClassroom = asyncHandler(async (req: Request, res: Response) => {
  const classroom = await Classroom.findById(req.params.id).populate('teacher', 'fullName email');
  if (!classroom) throw new ApiError(404, 'Classroom not found');
  res.json({ success: true, classroom });
});

export const createClassroom = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const classroom = await Classroom.create(req.body);
  res.status(201).json({ success: true, classroom });
});

export const updateClassroom = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const classroom = await Classroom.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!classroom) throw new ApiError(404, 'Classroom not found');
  res.json({ success: true, classroom });
});

export const deleteClassroom = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') throw new ApiError(403, 'Admin only');
  const classroom = await Classroom.findByIdAndDelete(req.params.id);
  if (!classroom) throw new ApiError(404, 'Classroom not found');
  res.json({ success: true, message: 'Classroom deleted' });
});
