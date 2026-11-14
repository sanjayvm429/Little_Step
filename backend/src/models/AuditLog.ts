import mongoose, { Document, Schema } from 'mongoose';

export interface IAuditLog extends Document {
  actor: mongoose.Types.ObjectId;
  actorRole?: string;
  action: string;
  resource: string;
  resourceId?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const auditSchema = new Schema<IAuditLog>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorRole: { type: String },
    action: { type: String, required: true, index: true }, // e.g. "camera.stream_access"
    resource: { type: String, required: true },
    resourceId: { type: String },
    ip: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditSchema);
