import mongoose, { Document, Schema } from 'mongoose';

export interface ISafetyIncident extends Document {
  child?: mongoose.Types.ObjectId;
  classroom?: mongoose.Types.ObjectId;
  reportedBy: mongoose.Types.ObjectId;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  actionsTaken?: string;
  status: 'open' | 'investigating' | 'resolved';
  createdAt: Date;
  updatedAt: Date;
}

const incidentSchema = new Schema<ISafetyIncident>(
  {
    child: { type: Schema.Types.ObjectId, ref: 'Child' },
    classroom: { type: Schema.Types.ObjectId, ref: 'Classroom' },
    reportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, trim: true },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
    description: { type: String, required: true },
    actionsTaken: { type: String },
    status: { type: String, enum: ['open', 'investigating', 'resolved'], default: 'open' },
  },
  { timestamps: true }
);

incidentSchema.index({ status: 1, createdAt: -1 });

export const SafetyIncident = mongoose.model<ISafetyIncident>('SafetyIncident', incidentSchema);
