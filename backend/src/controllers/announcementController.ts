import { Request, Response } from 'express';
import { Announcement } from '../models/Announcement.js';
import { User } from '../models/User.js';
import { Child } from '../models/Child.js';
import { ParentChildRelationship } from '../models/ParentChildRelationship.js';
import { ApiError, asyncHandler } from '../utils/errors.js';
import { notifyMany } from '../services/notificationService.js';

export const listAnnouncements = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  let filter: Record<string, unknown> = {};

  if (role === 'parent') {
    // announcements targeted to all parents, or to classrooms of approved children, or selected
    const childIds = (
      await ParentChildRelationship.find({ parent: sub, status: 'approved' }).select('child')
    ).map((r) => r.child);
    const children = await Child.find({ _id: { $in: childIds } }).select('classroom');
    const classIds = [...new Set(children.map((c) => c.classroom?.toString()).filter(Boolean))];
    filter = {
      $or: [
        { audience: 'all_parents' },
        { audience: 'classroom', classroom: { $in: classIds } },
        { audience: 'selected', recipients: sub },
      ],
    };
  } else if (role === 'teacher') {
    const { Classroom } = await import('../models/Classroom.js');
    const classrooms = await Classroom.find({ teacher: sub }).select('_id');
    const classIds = classrooms.map((c) => c._id);
    filter = {
      $or: [
        { audience: 'classroom', classroom: { $in: classIds } },
        { createdBy: sub },
      ],
    };
  }

  const announcements = await Announcement.find(filter).sort({ createdAt: -1 }).limit(100).populate('createdBy', 'fullName');
  res.json({ success: true, announcements });
});

export const createAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  if (role === 'parent') throw new ApiError(403, 'Parents cannot create announcements');

  const { title, body, audience, classroom, recipients } = req.body;
  const announcement = await Announcement.create({
    title,
    body,
    audience,
    classroom,
    recipients,
    createdBy: sub,
  });

  // resolve recipients and notify
  let userIds: string[] = [];
  if (audience === 'all_parents') {
    const parents = await User.find({ role: 'parent' }).select('_id');
    userIds = parents.map((p) => p._id.toString());
  } else if (audience === 'classroom' && classroom) {
    const children = await Child.find({ classroom }).select('_id');
    const rels = await ParentChildRelationship.find({
      child: { $in: children.map((c) => c._id) },
      status: 'approved',
    }).select('parent');
    userIds = [...new Set(rels.map((r) => r.parent.toString()))];
  } else if (audience === 'selected' && Array.isArray(recipients)) {
    userIds = recipients;
  }

  await notifyMany(
    userIds.map((uid) => ({
      userId: uid,
      type: 'announcement' as const,
      title,
      body: body.slice(0, 200),
      data: { announcementId: announcement._id },
    }))
  );

  res.status(201).json({ success: true, announcement });
});

export const deleteAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) throw new ApiError(404, 'Announcement not found');
  if (role !== 'admin' && announcement.createdBy.toString() !== sub) {
    throw new ApiError(403, 'You can only delete your own announcements');
  }
  await Announcement.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Announcement deleted' });
});
