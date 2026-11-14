import mongoose, { Document, Schema } from 'mongoose';

export interface IPickupAuthorization extends Document {
  child: mongoose.Types.ObjectId;
  name: string;
  phone: string;
  relationship: string;
  photoUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: mongoose.Types.ObjectId;
  reviewedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const pickupSchema = new Schema<IPickupAuthorization>(
  {
    child: { type: Schema.Types.ObjectId, ref: 'Child', required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    relationship: { type: String, required: true, trim: true },
    photoUrl: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

pickupSchema.index({ child: 1, status: 1 });

export const PickupAuthorization = mongoose.model<IPickupAuthorization>('PickupAuthorization', pickupSchema);
