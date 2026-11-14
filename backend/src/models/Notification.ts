import mongoose, { Document, Schema } from 'mongoose';

export type NotificationType =
  | 'check_in'
  | 'check_out'
  | 'activity'
  | 'photo'
  | 'message'
  | 'announcement'
  | 'pickup'
  | 'safety'
  | 'camera_status';

export interface INotification extends Document {
  user: mongoose.Types.ObjectId; // recipient
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['check_in', 'check_out', 'activity', 'photo', 'message', 'announcement', 'pickup', 'safety', 'camera_status'],
      required: true,
    },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
