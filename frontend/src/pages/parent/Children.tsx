import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Baby, Plus, X } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { Child } from '../../types';

const schema = z.object({
  admissionNumber: z.string().min(3, 'Admission number required'),
  relationship: z.string().min(2, 'Relationship required'),
});
type FormData = z.infer<typeof schema>;

export default function ParentChildren() {
  const [children, setChildren] = useState<Child[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const load = async () => {
    try {
      const res = await api.get('/children');
      setChildren(res.data.children);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const onSubmit = async (data: FormData) => {
    setError(''); setSuccess('');
    try {
      await api.post('/children/request-access', data);
      setSuccess('Access request submitted! The nursery admin will review it.');
      reset();
      setShowForm(false);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">My Children</h2>
          <p className="text-sm text-slate-500">Children linked to your account</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'Request access'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h3 className="mb-4 font-semibold text-slate-900">Request child access</h3>
          <p className="mb-4 text-sm text-slate-500">Enter the admission number provided by your nursery. An administrator must approve the request before you can view monitoring data.</p>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
            {error && <div className="sm:col-span-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
            {success && <div className="sm:col-span-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{success}</div>}
            <div>
              <label className="label">Admission number</label>
              <input className="input" placeholder="e.g. LS-001" {...register('admissionNumber')} />
              {errors.admissionNumber && <p className="mt-1 text-xs text-rose-500">{errors.admissionNumber.message}</p>}
            </div>
            <div>
              <label className="label">Your relationship</label>
              <select className="input" {...register('relationship')}>
                <option value="">Select…</option>
                <option value="mother">Mother</option>
                <option value="father">Father</option>
                <option value="guardian">Guardian</option>
                <option value="grandparent">Grandparent</option>
              </select>
              {errors.relationship && <p className="mt-1 text-xs text-rose-500">{errors.relationship.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary">Submit request</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <p className="text-slate-400">Loading…</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((child) => (
            <div key={child._id} className="card">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-purple/20 text-xl font-bold text-purple-600">
                  {child.fullName[0]}
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{child.fullName}</div>
                  <div className="text-xs text-slate-500">{child.admissionNumber}</div>
                </div>
              </div>
              <div className="mt-4 space-y-1 text-sm text-slate-600">
                <div>Classroom: <span className="font-medium">{typeof child.classroom === 'object' ? child.classroom?.name : '—'}</span></div>
                <div>Teacher: <span className="font-medium">{typeof child.teacher === 'object' ? child.teacher?.fullName : '—'}</span></div>
                <div>DOB: <span className="font-medium">{new Date(child.dateOfBirth).toLocaleDateString()}</span></div>
              </div>
              {child.medicalInfo?.allergies?.length ? (
                <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Allergies: {child.medicalInfo.allergies.join(', ')}
                </div>
              ) : null}
            </div>
          ))}
          {children.length === 0 && (
            <div className="card col-span-full text-center text-slate-500">
              <Baby className="mx-auto mb-2 text-slate-300" size={40} />
              <p>No children linked yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
