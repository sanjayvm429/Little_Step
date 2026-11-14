import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Baby, CheckCircle2 } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';

const schema = z.object({
  password: z.string().min(8, 'At least 8 characters').regex(/[A-Z]/, 'Needs uppercase').regex(/[0-9]/, 'Needs a number'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });
type FormData = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password: data.password });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary text-white"><Baby size={22} /></div>
            <span className="text-2xl font-bold text-slate-900">LittleSteps</span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-slate-900">Set new password</h1>
        </div>
        <div className="card">
          {success ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto mb-3 text-emerald-500" size={40} />
              <p className="text-sm text-slate-600">Password updated. Redirecting to login…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
              {!token && <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">Missing reset token. Use the link from your email.</div>}
              <div>
                <label className="label">New password</label>
                <input className="input" type="password" {...register('password')} />
                {errors.password && <p className="mt-1 text-xs text-rose-500">{errors.password.message}</p>}
              </div>
              <div>
                <label className="label">Confirm password</label>
                <input className="input" type="password" {...register('confirmPassword')} />
                {errors.confirmPassword && <p className="mt-1 text-xs text-rose-500">{errors.confirmPassword.message}</p>}
              </div>
              <button type="submit" disabled={loading || !token} className="btn-primary w-full py-3">
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
