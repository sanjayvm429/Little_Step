import mongoose, { Document, Schema } from 'mongoose';

export interface IClassroom extends Document {
  name: string;
  ageGroup: string;
  capacity: number;
  teacher?: mongoose.Types.ObjectId;
  nurseryId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const classroomSchema = new Schema<IClassroom>(
  {
    name: { type: String, required: true, trim: true },
    ageGroup: { type: String, required: true, trim: true }, // e.g. "2-3 years"
    capacity: { type: Number, required: true, min: 1, default: 20 },
    teacher: { type: Schema.Types.ObjectId, ref: 'User' },
    nurseryId: { type: String, default: 'default' },
  },
  { timestamps: true }
);

classroomSchema.index({ name: 1, nurseryId: 1 }, { unique: true });

export const Classroom = mongoose.model<IClassroom>('Classroom', classroomSchema);
