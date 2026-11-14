import mongoose, { Document, Schema } from 'mongoose';

export interface IChild extends Document {
  fullName: string;
  dateOfBirth: Date;
  gender?: 'male' | 'female' | 'other';
  photoUrl?: string;
  admissionNumber: string;
  classroom?: mongoose.Types.ObjectId;
  teacher?: mongoose.Types.ObjectId;
  emergencyContacts: { name: string; phone: string; relationship: string }[];
  medicalInfo?: { allergies?: string[]; conditions?: string[]; notes?: string };
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const childSchema = new Schema<IChild>(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    dateOfBirth: { type: Date, required: true },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    photoUrl: { type: String },
    admissionNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    classroom: { type: Schema.Types.ObjectId, ref: 'Classroom' },
    teacher: { type: Schema.Types.ObjectId, ref: 'User' },
    emergencyContacts: [
      {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        relationship: { type: String, required: true },
      },
    ],
    medicalInfo: {
      allergies: [{ type: String }],
      conditions: [{ type: String }],
      notes: { type: String },
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

childSchema.index({ classroom: 1 });
childSchema.index({ fullName: 'text' });

export const Child = mongoose.model<IChild>('Child', childSchema);
