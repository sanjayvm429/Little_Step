import mongoose, { Document, Schema } from 'mongoose';

export type RelationshipStatus = 'pending' | 'approved' | 'rejected';

export interface IParentChildRelationship extends Document {
  parent: mongoose.Types.ObjectId;
  child: mongoose.Types.ObjectId;
  relationship: string; // mother, father, guardian...
  status: RelationshipStatus;
  permissions: { canViewCamera: boolean; canViewActivities: boolean; canViewAttendance: boolean };
  createdAt: Date;
  updatedAt: Date;
}

const relSchema = new Schema<IParentChildRelationship>(
  {
    parent: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    child: { type: Schema.Types.ObjectId, ref: 'Child', required: true },
    relationship: { type: String, required: true, trim: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    permissions: {
      canViewCamera: { type: Boolean, default: false },
      canViewActivities: { type: Boolean, default: true },
      canViewAttendance: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

relSchema.index({ parent: 1, child: 1 }, { unique: true });

export const ParentChildRelationship = mongoose.model<IParentChildRelationship>(
  'ParentChildRelationship',
  relSchema
);
