import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Baby, CheckCircle2, XCircle } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';

export default function VerifyEmailPage() {
  const { token } = useParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/auth/verify-email/${token}`);
        setStatus('success');
        setMessage(res.data.message);
      } catch (err) {
        setStatus('error');
        setMessage(getErrorMessage(err));
      }
    })();
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="card w-full max-w-md text-center">
        <Link to="/" className="inline-flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary text-white"><Baby size={22} /></div>
          <span className="text-2xl font-bold text-slate-900">LittleSteps</span>
        </Link>
        <div className="mt-8">
          {status === 'loading' && <p className="text-slate-500">Verifying your email…</p>}
          {status === 'success' && (
            <>
              <CheckCircle2 className="mx-auto mb-3 text-emerald-500" size={48} />
              <h1 className="text-xl font-bold text-slate-900">Email verified!</h1>
              <p className="mt-2 text-sm text-slate-600">{message}</p>
              <Link to="/login" className="btn-primary mt-6 inline-block px-8">Go to login</Link>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle className="mx-auto mb-3 text-rose-500" size={48} />
              <h1 className="text-xl font-bold text-slate-900">Verification failed</h1>
              <p className="mt-2 text-sm text-slate-600">{message}</p>
              <Link to="/login" className="btn-secondary mt-6 inline-block px-8">Back to login</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
