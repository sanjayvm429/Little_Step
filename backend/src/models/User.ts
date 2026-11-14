import mongoose, { Document, Schema } from 'mongoose';

export type UserRole = 'parent' | 'teacher' | 'admin';

export interface IUser extends Document {
  fullName: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: UserRole;
  isEmailVerified: boolean;
  refreshTokenHash?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  emailVerifyToken?: string;
  emailVerifyExpires?: Date;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['parent', 'teacher', 'admin'], required: true, index: true },
    isEmailVerified: { type: Boolean, default: false },
    refreshTokenHash: { type: String },
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
    emailVerifyToken: { type: String },
    emailVerifyExpires: { type: Date },
    avatarUrl: { type: String },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);
