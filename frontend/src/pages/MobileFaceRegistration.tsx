import { FormEvent, useEffect, useState } from 'react';
import { Camera, ShieldCheck } from 'lucide-react';
import FaceCapturePanel, {
  emptyFaceValidation,
  FaceImages,
  FaceValidation,
} from '../components/FaceCapturePanel';
import api, { getErrorMessage } from '../services/api';

interface RegistrationInfo {
  employee_id: string;
  full_name?: string;
  expires_at: string;
  mode: 'new_employee' | 'reregister';
}

export default function MobileFaceRegistration() {
  const [token, setToken] = useState('');
  const [registration, setRegistration] = useState<RegistrationInfo | null>(null);
  const [images, setImages] = useState<FaceImages>({});
  const [validation, setValidation] = useState<FaceValidation>(emptyFaceValidation);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const linkToken = window.location.hash.slice(1)
      || window.sessionStorage.getItem('mobile-face-registration-token')
      || '';
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    if (!linkToken) {
      setError('This registration link is invalid or missing. Ask your administrator for a new link.');
      setLoading(false);
      return;
    }
    window.sessionStorage.setItem('mobile-face-registration-token', linkToken);
    setToken(linkToken);
    api.post('/face/mobile-registration/info', { token: linkToken })
      .then((response) => setRegistration(response.data.registration))
      .catch((requestError: unknown) => setError(getErrorMessage(requestError)))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!images.front || !images.left || !images.right) {
      setError('Capture and preview all three face positions before submitting.');
      return;
    }
    if (!consent) {
      setError('Consent is required before face images can be submitted.');
      return;
    }

    const form = new FormData();
    form.append('token', token);
    form.append('consent_confirmed', 'true');
    form.append('front_image', images.front);
    form.append('left_image', images.left);
    form.append('right_image', images.right);
    setSubmitting(true);
    try {
      await api.post('/face/mobile-registration/submit', form);
      window.sessionStorage.removeItem('mobile-face-registration-token');
      setComplete(true);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="admin-theme min-h-screen bg-[#080b11] px-4 py-8 text-slate-200 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="rounded-2xl border border-slate-800 bg-[#0d121b] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300"><Camera size={19} /></div>
            <div><h1 className="text-lg font-bold text-slate-100">LittleSteps · Face registration</h1><p className="text-xs text-slate-400">Secure employee registration</p></div>
          </div>
          {registration && <p className="mt-4 text-sm text-slate-300">Registration for <strong>{registration.full_name || registration.employee_id}</strong>. This link expires {new Date(registration.expires_at).toLocaleString()}.</p>}
        </header>

        {loading && <div className="card text-sm text-slate-400">Checking secure registration link…</div>}
        {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
        {complete && (
          <div role="status" className="card space-y-2 border-emerald-500/30">
            <h2 className="font-semibold text-emerald-300">Face registration complete</h2>
            <p className="text-sm text-slate-300">Your images were submitted securely. This link can no longer be used.</p>
          </div>
        )}

        {!loading && registration && !complete && (
          <form onSubmit={submit} className="card space-y-5">
            <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
              <h2 className="font-semibold text-slate-100">Capture instructions</h2>
              <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-slate-400">
                <li>Allow camera access when your browser asks.</li>
                <li>Use bright, even lighting and remove anything covering your face.</li>
                <li>Capture a front-facing photo, then turn slightly left and right.</li>
                <li>Review each preview. Retake any image before submission.</li>
              </ol>
            </section>

            <FaceCapturePanel
              images={images}
              setImages={setImages}
              validation={validation}
              setValidation={setValidation}
              validateImages={false}
            />

            <label className="flex items-start gap-2 text-sm leading-5 text-slate-400">
              <input type="checkbox" className="mt-1 accent-sky-500" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              I consent to the collection and processing of my face images and biometric templates for employee attendance.
            </label>
            <div className="rounded-lg border border-slate-700 p-3 text-xs text-slate-400">
              <ShieldCheck size={14} className="mr-1 inline text-emerald-400" />
              Images are submitted through the secure application connection, validated on the server, and the registration link is single-use.
            </div>
            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={submitting}>
              {submitting ? 'Submitting securely…' : 'Submit face images'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
