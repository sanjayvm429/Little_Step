import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Plus, Trash2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { PickupAuthorization, Child } from '../../types';

const schema = z.object({
  childId: z.string().min(1, 'Select a child'),
  name: z.string().min(2, 'Name required'),
  phone: z.string().min(8, 'Valid phone required'),
  relationship: z.string().min(2, 'Relationship required'),
});
type FormData = z.infer<typeof schema>;

const statusIcon = { approved: <CheckCircle2 size={16} className="text-emerald-500" />, rejected: <XCircle size={16} className="text-rose-500" />, pending: <Clock size={16} className="text-amber-500" /> };
const statusColor = { approved: 'bg-emerald-100 text-emerald-700', rejected: 'bg-rose-100 text-rose-700', pending: 'bg-amber-100 text-amber-700' };

export default function ParentPickup() {
  const [records, setRecords] = useState<PickupAuthorization[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const load = async () => {
    try {
      const [p, c] = await Promise.all([api.get('/pickup-authorizations'), api.get('/children')]);
      setRecords(p.data.authorizations);
      setChildren(c.data.children);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); }, []);

  const onSubmit = async (data: FormData) => {
    setError(''); setSuccess('');
    try {
      await api.post('/pickup-authorizations', data);
      setSuccess('Pickup authorization request submitted for admin review.');
      reset();
      setShowForm(false);
      load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this authorization?')) return;
    await api.delete(`/pickup-authorizations/${id}`);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Pickup Authorization</h2>
          <p className="text-sm text-slate-500">Manage who can pick up your child</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus size={16} /> Add authorized person
        </button>
      </div>

      {showForm && (
        <div className="card">
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
            {error && <div className="sm:col-span-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
            {success && <div className="sm:col-span-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{success}</div>}
            <div>
              <label className="label">Child</label>
              <select className="input" {...register('childId')}>
                <option value="">Select child…</option>
                {children.map(c => <option key={c._id} value={c._id}>{c.fullName}</option>)}
              </select>
              {errors.childId && <p className="mt-1 text-xs text-rose-500">{errors.childId.message}</p>}
            </div>
            <div>
              <label className="label">Full name</label>
              <input className="input" placeholder="Person's name" {...register('name')} />
              {errors.name && <p className="mt-1 text-xs text-rose-500">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" placeholder="+91 …" {...register('phone')} />
              {errors.phone && <p className="mt-1 text-xs text-rose-500">{errors.phone.message}</p>}
            </div>
            <div>
              <label className="label">Relationship</label>
              <input className="input" placeholder="e.g. Grandmother, Uncle" {...register('relationship')} />
              {errors.relationship && <p className="mt-1 text-xs text-rose-500">{errors.relationship.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary">Submit for approval</button>
            </div>
          </form>
        </div>
      )}

      <div className="card divide-y divide-slate-100">
        {records.length === 0 && (
          <div className="py-8 text-center text-slate-500">
            <KeyRound className="mx-auto mb-2 text-slate-300" size={32} />
            <p>No authorized pickup persons yet.</p>
          </div>
        )}
        {records.map((r) => (
          <div key={r._id} className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-green/30 text-emerald-600">
                <KeyRound size={18} />
              </div>
              <div>
                <div className="font-medium text-slate-900">{r.name}</div>
                <div className="text-xs text-slate-500">{r.relationship} • {r.phone} • for {typeof r.child === 'object' ? r.child.fullName : ''}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`badge flex items-center gap-1 ${statusColor[r.status]}`}>{statusIcon[r.status]} {r.status}</span>
              <button onClick={() => remove(r._id)} className="text-slate-400 hover:text-rose-500"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
