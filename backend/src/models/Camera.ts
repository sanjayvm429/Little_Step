import mongoose, { Document, Schema } from 'mongoose';

export type CameraStatus = 'online' | 'offline' | 'unknown';
export type CameraConnectionType = 'http_rtsp' | 'direct_rtsp' | 'standalone';

export interface ICamera extends Document {
  name: string;
  cameraId: string;
  location: string;
  classroom?: mongoose.Types.ObjectId;
  nvr?: mongoose.Types.ObjectId;
  channelNumber?: number;
  connectionType: CameraConnectionType;
  isEnabled: boolean;
  rtspUrlEnc?: string;
  ipAddress?: string;
  rtspPort?: number;
  rtspPath?: string;
  usernameEnc?: string;
  passwordEnc?: string;
  streamKey: string;
  status: CameraStatus;
  isSimulated: boolean;
  description?: string;
  lastHealthCheck?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const cameraSchema = new Schema<ICamera>(
  {
    name: { type: String, required: true, trim: true },
    cameraId: { type: String, required: true, unique: true, trim: true },
    location: { type: String, required: true, trim: true },
    classroom: { type: Schema.Types.ObjectId, ref: 'Classroom' },
    nvr: { type: Schema.Types.ObjectId, ref: 'NvrDevice' },
    channelNumber: { type: Number, min: 1 },
    connectionType: { type: String, enum: ['http_rtsp', 'direct_rtsp', 'standalone'], default: 'standalone' },
    isEnabled: { type: Boolean, default: true },
    rtspUrlEnc: { type: String },
    ipAddress: { type: String },
    rtspPort: { type: Number },
    rtspPath: { type: String },
    usernameEnc: { type: String },
    passwordEnc: { type: String },
    streamKey: { type: String, required: true, unique: true, trim: true },
    status: { type: String, enum: ['online', 'offline', 'unknown'], default: 'unknown' },
    isSimulated: { type: Boolean, default: false },
    description: { type: String },
    lastHealthCheck: { type: Date },
  },
  { timestamps: true }
);

cameraSchema.index({ classroom: 1 });
cameraSchema.index({ nvr: 1 });
cameraSchema.index({ isEnabled: 1 });

export const Camera = mongoose.model<ICamera>('Camera', cameraSchema);
