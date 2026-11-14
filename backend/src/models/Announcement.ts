import mongoose, { Document, Schema } from 'mongoose';

export interface IAnnouncement extends Document {
  title: string;
  body: string;
  audience: 'all_parents' | 'classroom' | 'selected';
  classroom?: mongoose.Types.ObjectId;
  recipients?: mongoose.Types.ObjectId[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const announcementSchema = new Schema<IAnnouncement>(
  {
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true },
    audience: { type: String, enum: ['all_parents', 'classroom', 'selected'], required: true },
    classroom: { type: Schema.Types.ObjectId, ref: 'Classroom' },
    recipients: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

announcementSchema.index({ createdAt: -1 });

export const Announcement = mongoose.model<IAnnouncement>('Announcement', announcementSchema);
