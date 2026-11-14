import mongoose, { Document, Schema } from 'mongoose';

export interface ICameraAccessPermission extends Document {
  camera: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId; // parent or teacher
  grantedBy: mongoose.Types.ObjectId; // admin
  status: 'active' | 'revoked';
  createdAt: Date;
  updatedAt: Date;
}

const permSchema = new Schema<ICameraAccessPermission>(
  {
    camera: { type: Schema.Types.ObjectId, ref: 'Camera', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
  },
  { timestamps: true }
);

permSchema.index({ camera: 1, user: 1 }, { unique: true });

export const CameraAccessPermission = mongoose.model<ICameraAccessPermission>(
  'CameraAccessPermission',
  permSchema
);
