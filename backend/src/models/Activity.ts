import mongoose, { Document, Schema } from 'mongoose';

export type ActivityCategory =
  | 'breakfast'
  | 'lunch'
  | 'snacks'
  | 'nap'
  | 'play'
  | 'learning'
  | 'indoor'
  | 'outdoor'
  | 'art'
  | 'other';

export interface IActivity extends Document {
  child: mongoose.Types.ObjectId;
  classroom?: mongoose.Types.ObjectId;
  category: ActivityCategory;
  title: string;
  description?: string;
  status: 'planned' | 'in_progress' | 'completed';
  startTime?: Date;
  endTime?: Date;
  photoUrls: string[];
  recordedBy?: mongoose.Types.ObjectId;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}

const activitySchema = new Schema<IActivity>(
  {
    child: { type: Schema.Types.ObjectId, ref: 'Child', required: true },
    classroom: { type: Schema.Types.ObjectId, ref: 'Classroom' },
    category: {
      type: String,
      enum: ['breakfast', 'lunch', 'snacks', 'nap', 'play', 'learning', 'indoor', 'outdoor', 'art', 'other'],
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String },
    status: { type: String, enum: ['planned', 'in_progress', 'completed'], default: 'completed' },
    startTime: { type: Date },
    endTime: { type: Date },
    photoUrls: [{ type: String }],
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, required: true },
  },
  { timestamps: true }
);

activitySchema.index({ child: 1, date: 1 });
activitySchema.index({ classroom: 1, date: 1 });

export const Activity = mongoose.model<IActivity>('Activity', activitySchema);
