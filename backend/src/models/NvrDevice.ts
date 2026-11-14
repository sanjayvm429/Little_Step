import mongoose, { Document, Schema } from 'mongoose';

export type NvrBrand =
  | 'hikvision' | 'dahua' | 'cpplus' | 'uniview' | 'axis'
  | 'hanwha' | 'bosch' | 'tvt' | 'honeywell' | 'other';

export type NvrConnectionType = 'http_rtsp' | 'direct_rtsp';
export type NvrStatus = 'online' | 'offline' | 'unknown' | 'authentication_failed' | 'connection_error';

export interface INvrDevice extends Document {
  brand: NvrBrand;
  name: string;
  modelNumber?: string;
  location: string;
  publicIp: string;
  usernameEnc?: string; // AES-256-GCM encrypted
  passwordEnc?: string;
  httpPort?: number;
  rtspPort?: number;
  connectionType: NvrConnectionType;
  status: NvrStatus;
  playbackSupported: boolean; // whether recording retrieval is available via adapter
  lastHealthCheck?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const nvrDeviceSchema = new Schema<INvrDevice>(
  {
    brand: {
      type: String,
      required: true,
      enum: ['hikvision', 'dahua', 'cpplus', 'uniview', 'axis', 'hanwha', 'bosch', 'tvt', 'honeywell', 'other'],
    },
    name: { type: String, required: true, trim: true },
    modelNumber: { type: String, trim: true },
    location: { type: String, required: true, trim: true },
    publicIp: { type: String, required: true, trim: true },
    usernameEnc: { type: String },
    passwordEnc: { type: String },
    httpPort: { type: Number, min: 1, max: 65535 },
    rtspPort: { type: Number, min: 1, max: 65535 },
    connectionType: { type: String, enum: ['http_rtsp', 'direct_rtsp'], required: true },
    status: { type: String, enum: ['online', 'offline', 'unknown', 'authentication_failed', 'connection_error'], default: 'unknown' },
    playbackSupported: { type: Boolean, default: false },
    lastHealthCheck: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

nvrDeviceSchema.index({ publicIp: 1, httpPort: 1 });
nvrDeviceSchema.index({ createdBy: 1 });

export const NvrDevice = mongoose.model<INvrDevice>('NvrDevice', nvrDeviceSchema);
