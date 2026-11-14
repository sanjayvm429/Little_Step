import { Request, Response } from 'express';
import { Notification } from '../models/Notification.js';
import { ApiError, asyncHandler } from '../utils/errors.js';

export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const { unreadOnly } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { user: req.user!.sub };
  if (unreadOnly === 'true') filter.isRead = false;
  const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(100);
  const unreadCount = await Notification.countDocuments({ user: req.user!.sub, isRead: false });
  res.json({ success: true, notifications, unreadCount });
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user!.sub },
    { isRead: true },
    { new: true }
  );
  if (!notification) throw new ApiError(404, 'Notification not found');
  res.json({ success: true, notification });
});

export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  await Notification.updateMany({ user: req.user!.sub, isRead: false }, { isRead: true });
  res.json({ success: true, message: 'All notifications marked as read' });
});
