import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, X } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { Activity, ActivityCategory, Child } from '../../types';

const schema = z.object({
  childId: z.string().min(1, 'Select a child'),
  category: z.enum(['breakfast','lunch','snacks','nap','play','learning','indoor','outdoor','art','other']),
  title: z.string().min(2, 'Title required'),
  description: z.string().optional(),
  status: z.enum(['planned','in_progress','completed']).default('completed'),
});
type FormData = z.infer<typeof schema>;

const categoryLabels: Record<ActivityCategory, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', snacks: 'Snacks', nap: 'Nap time',
  play: 'Play', learning: 'Learning', indoor: 'Indoor', outdoor: 'Outdoor', art: 'Art & Drawing', other: 'Other',
};

export default function TeacherActivities() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const load = async () => {
    try {
      const [a, c] = await Promise.all([api.get('/activities'), api.get('/children')]);
      setActivities(a.data.activities);
      setChildren(c.data.children);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const onSubmit = async (data: FormData) => {
    setError(''); setSuccess('');
    try {
      await api.post('/activities', data);
      setSuccess('Activity recorded.');
      reset();
      setShowForm(false);
      load();
    } catch (err) { setError(getErrorMessage(err)); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this activity?')) return;
    await api.delete(`/activities/${id}`);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Daily Activities</h2>
          <p className="text-sm text-slate-500">Record and manage child activities</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'Add activity'}
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
              <label className="label">Category</label>
              <select className="input" {...register('category')}>
                {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Title</label>
              <input className="input" placeholder="e.g. Color sorting activity" {...register('title')} />
              {errors.title && <p className="mt-1 text-xs text-rose-500">{errors.title.message}</p>}
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" {...register('status')}>
                <option value="completed">Completed</option>
                <option value="in_progress">In progress</option>
                <option value="planned">Planned</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description (optional)</label>
              <textarea className="input" rows={2} placeholder="Notes about the activity…" {...register('description')} />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary">Save activity</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <p className="text-slate-400">Loading…</p> : (
        <div className="card divide-y divide-slate-100">
          {activities.map((a) => (
            <div key={a._id} className="flex items-center justify-between py-3">
              <div>
                <div className="font-medium text-slate-900">{a.title}</div>
                <div className="text-xs text-slate-500 capitalize">{categoryLabels[a.category]} • {typeof a.child === 'object' ? a.child.fullName : ''} • {new Date(a.date).toLocaleDateString()}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${a.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : a.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{a.status.replace('_', ' ')}</span>
                <button onClick={() => remove(a._id)} className="text-slate-400 hover:text-rose-500"><X size={16} /></button>
              </div>
            </div>
          ))}
          {activities.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No activities recorded yet.</p>}
        </div>
      )}
    </div>
  );
}
