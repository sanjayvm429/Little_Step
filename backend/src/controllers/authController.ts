import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { ApiError, asyncHandler } from '../utils/errors.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { config } from '../config/index.js';

const REFRESH_COOKIE = 'ls_refresh';

function setRefreshCookie(res: Response, token: string, rememberMe: boolean) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

function publicUser(u: { _id: unknown; fullName: string; email: string; role: string; isEmailVerified: boolean }) {
  return { id: u._id, fullName: u.fullName, email: u.email, role: u.role, isEmailVerified: u.isEmailVerified };
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { fullName, email, phone, password, role = 'parent' } = req.body;

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) throw new ApiError(409, 'An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, 12);
  const emailVerifyToken = crypto.randomBytes(32).toString('hex');

  const user = await User.create({
    fullName,
    email: email.toLowerCase(),
    phone,
    passwordHash,
    role,
    emailVerifyToken,
    emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  // TODO: send verification email via notification service
  res.status(201).json({
    success: true,
    message: 'Account created. Please check your email to verify your account.',
    user: publicUser(user),
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, rememberMe = false } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) throw new ApiError(401, 'Invalid email or password');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new ApiError(401, 'Invalid email or password');

  const payload = { sub: user._id.toString(), role: user.role, email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  user.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  await user.save();

  setRefreshCookie(res, refreshToken, rememberMe);

  res.json({ success: true, accessToken, user: publicUser(user) });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw new ApiError(401, 'Refresh token missing');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new ApiError(401, 'Invalid refresh token');
  }

  const user = await User.findById(payload.sub);
  if (!user?.refreshTokenHash) throw new ApiError(401, 'Session expired');

  const ok = await bcrypt.compare(token, user.refreshTokenHash);
  if (!ok) throw new ApiError(401, 'Session expired');

  const newPayload = { sub: user._id.toString(), role: user.role, email: user.email };
  const accessToken = signAccessToken(newPayload);
  const newRefresh = signRefreshToken(newPayload);
  user.refreshTokenHash = await bcrypt.hash(newRefresh, 10);
  await user.save();

  setRefreshCookie(res, newRefresh, true);
  res.json({ success: true, accessToken, user: publicUser(user) });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await User.findByIdAndUpdate(payload.sub, { $unset: { refreshTokenHash: 1 } });
    } catch {
      // ignore invalid token on logout
    }
  }
  clearRefreshCookie(res);
  res.json({ success: true, message: 'Logged out' });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });

  // Always respond the same to avoid user enumeration
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = token;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();
    // TODO: send reset email via notification service
    console.log(`[auth] Password reset token for ${email}: ${token}`);
  }

  res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body;
  const user = await User.findOne({
    passwordResetToken: token,
    passwordResetExpires: { $gt: new Date() },
  });
  if (!user) throw new ApiError(400, 'Invalid or expired reset token');

  user.passwordHash = await bcrypt.hash(password, 12);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokenHash = undefined;
  await user.save();

  res.json({ success: true, message: 'Password updated. Please log in.' });
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.params;
  const user = await User.findOne({
    emailVerifyToken: token,
    emailVerifyExpires: { $gt: new Date() },
  });
  if (!user) throw new ApiError(400, 'Invalid or expired verification token');

  user.isEmailVerified = true;
  user.emailVerifyToken = undefined;
  user.emailVerifyExpires = undefined;
  await user.save();

  res.json({ success: true, message: 'Email verified' });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.sub).select('-passwordHash -refreshTokenHash');
  if (!user) throw new ApiError(404, 'User not found');
  res.json({ success: true, user: publicUser(user) });
});
