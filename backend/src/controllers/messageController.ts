import { Request, Response } from 'express';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { Child } from '../models/Child.js';
import { ApiError, asyncHandler } from '../utils/errors.js';
import { notify } from '../services/notificationService.js';
import { getApprovedChildIds, assertParentChildAccess, assertTeacherChildAccess } from '../services/permissionService.js';
import { ParentChildRelationship } from '../models/ParentChildRelationship.js';

// GET /api/messages?with=<userId>&childId=<id>
export const listMessages = asyncHandler(async (req: Request, res: Response) => {
  const { with: withUser, childId } = req.query as Record<string, string>;
  if (!withUser) throw new ApiError(400, 'Query param "with" (userId) is required');

  // verify relationship: parent<->teacher of approved child, or admin
  const { role, sub } = req.user!;
  if (role !== 'admin') {
    let allowed = false;
    if (role === 'parent') {
      if (childId) {
        await assertParentChildAccess(sub, childId);
        const child = await Child.findById(childId);
        const rels = await ParentChildRelationship.find({ child: childId, status: 'approved' }).select('parent');
        const teacherId = child?.teacher?.toString();
        const classroom = child?.classroom
          ? await (await import('../models/Classroom.js')).Classroom.findById(child.classroom)
          : null;
        const teacherIds = [teacherId, classroom?.teacher?.toString()].filter(Boolean);
        allowed = teacherIds.includes(withUser) || rels.some((r) => r.parent.toString() === withUser);
      }
    } else if (role === 'teacher') {
      // teacher can message parents of their children
      const { Classroom } = await import('../models/Classroom.js');
      const classrooms = await Classroom.find({ teacher: sub }).select('_id');
      const classIds = classrooms.map((c) => c._id);
      const children = await Child.find({ $or: [{ teacher: sub }, { classroom: { $in: classIds } }] }).select('_id');
      const rels = await ParentChildRelationship.find({
        child: { $in: children.map((c) => c._id) },
        status: 'approved',
        parent: withUser,
      });
      allowed = rels.length > 0;
    }
    if (!allowed) throw new ApiError(403, 'You cannot message this user');
  }

  const messages = await Message.find({
    $or: [
      { sender: sub, recipient: withUser },
      { sender: withUser, recipient: sub },
    ],
  })
    .sort({ createdAt: 1 })
    .limit(200)
    .populate('sender', 'fullName role')
    .populate('recipient', 'fullName role');

  // mark incoming as read
  await Message.updateMany({ sender: withUser, recipient: sub, isRead: false }, { isRead: true, readAt: new Date() });

  res.json({ success: true, messages });
});

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const { recipientId, body, childId } = req.body;
  const { role, sub } = req.user!;

  const recipient = await User.findById(recipientId);
  if (!recipient) throw new ApiError(404, 'Recipient not found');

  // reuse listMessages permission logic by calling it indirectly is complex; do basic checks:
  if (role === 'parent') {
    if (recipient.role !== 'teacher' && recipient.role !== 'admin') throw new ApiError(403, 'Invalid recipient');
    if (childId) await assertParentChildAccess(sub, childId);
  } else if (role === 'teacher') {
    if (recipient.role !== 'parent' && recipient.role !== 'admin') throw new ApiError(403, 'Invalid recipient');
    if (childId) await assertTeacherChildAccess(sub, childId);
    else {
      // ensure recipient is parent of one of teacher's children
      const { Classroom } = await import('../models/Classroom.js');
      const classrooms = await Classroom.find({ teacher: sub }).select('_id');
      const classIds = classrooms.map((c) => c._id);
      const children = await Child.find({ $or: [{ teacher: sub }, { classroom: { $in: classIds } }] }).select('_id');
      const rel = await ParentChildRelationship.findOne({
        parent: recipientId,
        child: { $in: children.map((c) => c._id) },
        status: 'approved',
      });
      if (!rel) throw new ApiError(403, 'Recipient is not a parent of your students');
    }
  } else if (role === 'admin') {
    // admin can message anyone
  }

  const message = await Message.create({ sender: sub, recipient: recipientId, child: childId, body });

  await notify({
    userId: recipientId,
    type: 'message',
    title: 'New message',
    body: body.slice(0, 100),
    data: { messageId: message._id, senderId: sub },
  });

  res.status(201).json({ success: true, message });
});

// GET /api/messages/conversations - list of users the current user can talk to
export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const { role, sub } = req.user!;
  let counterpartIds: string[] = [];

  if (role === 'admin') {
    const users = await User.find({ role: { $in: ['parent', 'teacher'] } }).select('_id');
    counterpartIds = users.map((u) => u._id.toString());
  } else if (role === 'parent') {
    const childIds = await getApprovedChildIds(sub);
    const children = await Child.find({ _id: { $in: childIds } }).select('teacher classroom');
    const { Classroom } = await import('../models/Classroom.js');
    const teacherIds = new Set<string>();
    for (const c of children) {
      if (c.teacher) teacherIds.add(c.teacher.toString());
      if (c.classroom) {
        const cl = await Classroom.findById(c.classroom).select('teacher');
        if (cl?.teacher) teacherIds.add(cl.teacher.toString());
      }
    }
    counterpartIds = [...teacherIds];
  } else if (role === 'teacher') {
    const { Classroom } = await import('../models/Classroom.js');
    const classrooms = await Classroom.find({ teacher: sub }).select('_id');
    const classIds = classrooms.map((c) => c._id);
    const children = await Child.find({ $or: [{ teacher: sub }, { classroom: { $in: classIds } }] }).select('_id');
    const rels = await ParentChildRelationship.find({
      child: { $in: children.map((c) => c._id) },
      status: 'approved',
    }).select('parent');
    counterpartIds = [...new Set(rels.map((r) => r.parent.toString()))];
  }

  const users = await User.find({ _id: { $in: counterpartIds } }).select('fullName email role');
  res.json({ success: true, conversations: users });
});
