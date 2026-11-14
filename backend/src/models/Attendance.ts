import mongoose, { Document, Schema } from 'mongoose';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'early_departure';

export interface IAttendance extends Document {
  child: mongoose.Types.ObjectId;
  classroom?: mongoose.Types.ObjectId;
  date: Date; // normalized to start of day
  checkIn?: Date;
  checkOut?: Date;
  status: AttendanceStatus;
  markedBy?: mongoose.Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceSchema = new Schema<IAttendance>(
  {
    child: { type: Schema.Types.ObjectId, ref: 'Child', required: true },
    classroom: { type: Schema.Types.ObjectId, ref: 'Classroom' },
    date: { type: Date, required: true },
    checkIn: { type: Date },
    checkOut: { type: Date },
    status: { type: String, enum: ['present', 'absent', 'late', 'early_departure'], default: 'present' },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
  },
  { timestamps: true }
);

attendanceSchema.index({ child: 1, date: 1 }, { unique: true });
attendanceSchema.index({ classroom: 1, date: 1 });

export const Attendance = mongoose.model<IAttendance>('Attendance', attendanceSchema);
