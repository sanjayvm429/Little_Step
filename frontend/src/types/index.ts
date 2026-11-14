export type Role = 'parent' | 'teacher' | 'admin';

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  isEmailVerified: boolean;
  phone?: string;
}

export interface Child {
  _id: string;
  fullName: string;
  dateOfBirth: string;
  gender?: string;
  photoUrl?: string;
  admissionNumber: string;
  classroom?: { _id: string; name: string } | string;
  teacher?: { _id: string; fullName: string } | string;
  emergencyContacts?: { name: string; phone: string; relationship: string }[];
  medicalInfo?: { allergies?: string[]; conditions?: string[]; notes?: string };
  status: string;
}

export interface Classroom {
  _id: string;
  name: string;
  ageGroup: string;
  capacity: number;
  teacher?: { _id: string; fullName: string; email: string } | string;
}

export interface Camera {
  _id: string;
  name: string;
  cameraId: string;
  location: string;
  classroom?: { _id: string; name: string } | string;
  nvr?: { _id: string; name: string; brand: NvrBrand; location: string } | string;
  channelNumber?: number;
  connectionType: 'http_rtsp' | 'direct_rtsp' | 'standalone';
  isEnabled: boolean;
  streamKey: string;
  status: 'online' | 'offline' | 'unknown';
  isSimulated: boolean;
  description?: string;
}

export interface AttendanceRecord {
  _id: string;
  child: { _id: string; fullName: string; admissionNumber: string } | string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: 'present' | 'absent' | 'late' | 'early_departure';
  notes?: string;
}

export type ActivityCategory =
  | 'breakfast' | 'lunch' | 'snacks' | 'nap' | 'play'
  | 'learning' | 'indoor' | 'outdoor' | 'art' | 'other';

export interface Activity {
  _id: string;
  child: { _id: string; fullName: string } | string;
  category: ActivityCategory;
  title: string;
  description?: string;
  status: 'planned' | 'in_progress' | 'completed';
  startTime?: string;
  endTime?: string;
  photoUrls: string[];
  date: string;
}

export interface AppNotification {
  _id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export interface Message {
  _id: string;
  sender: { _id: string; fullName: string; role: string } | string;
  recipient: { _id: string; fullName: string; role: string } | string;
  child?: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export interface Announcement {
  _id: string;
  title: string;
  body: string;
  audience: string;
  createdBy: { _id: string; fullName: string } | string;
  createdAt: string;
}

export interface PickupAuthorization {
  _id: string;
  child: { _id: string; fullName: string } | string;
  name: string;
  phone: string;
  relationship: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  createdAt: string;
}

export interface SafetyIncident {
  _id: string;
  child?: { _id: string; fullName: string } | string;
  type: string;
  severity: string;
  description: string;
  status: string;
  createdAt: string;
}

export interface Relationship {
  _id: string;
  parent: { _id: string; fullName: string; email: string } | string;
  child: { _id: string; fullName: string; admissionNumber: string } | string;
  relationship: string;
  status: 'pending' | 'approved' | 'rejected';
  permissions: { canViewCamera: boolean; canViewActivities: boolean; canViewAttendance: boolean };
  createdAt: string;
}

export type NvrBrand = 'hikvision' | 'dahua' | 'cpplus' | 'uniview' | 'axis' | 'hanwha' | 'bosch' | 'tvt' | 'honeywell' | 'other';
export type NvrConnectionType = 'http_rtsp' | 'direct_rtsp';

export interface NvrDevice {
  _id: string;
  brand: NvrBrand;
  name: string;
  modelNumber?: string;
  location: string;
  publicIp: string;
  httpPort?: number;
  rtspPort?: number;
  connectionType: NvrConnectionType;
  status: 'online' | 'offline' | 'unknown' | 'authentication_failed' | 'connection_error';
  playbackSupported: boolean;
  cameraCount?: number;
  capabilities?: { supportsDiscovery: boolean; supportsPlayback: boolean };
  createdAt: string;
}

export interface DiscoveredChannel {
  channelNumber: number;
  name: string;
  status: 'online' | 'offline' | 'unknown';
  rtspUrl?: string;
  manualRtspUrl?: string;
}

export interface RecordingSegment {
  startTime: string;
  endTime: string;
  channel: number;
}

export interface RecordingPlayback {
  sessionId: string;
  hlsUrl?: string;
}

export interface StreamAccess {
  token: string;
  streamKey: string;
  webrtcUrl: string;
  hlsUrl: string;
  expiresIn: string;
  expiresAt: number;
  isSimulated: boolean;
}
