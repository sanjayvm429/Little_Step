import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Megaphone, Trash2 } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { Announcement, Classroom } from '../../types';

const schema = z.object({
  title: z.string().min(3, 'Title required'),
  body: z.string().min(5, 'Message required'),
  audience: z.enum(['all_parents', 'classroom', 'selected']),
  classroom: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function TeacherAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });
  const audience = watch('audience');

  const load = async () => {
    try {
      const [a, c] = await Promise.all([api.get('/announcements'), api.get('/classrooms')]);
      setAnnouncements(a.data.announcements);
      setClassrooms(c.data.classrooms);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); }, []);

  const onSubmit = async (data: FormData) => {
    setError(''); setSuccess('');
    try {
      await api.post('/announcements', data);
      setSuccess('Announcement sent.');
      reset();
      setShowForm(false);
      load();
    } catch (err) { setError(getErrorMessage(err)); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    await api.delete(`/announcements/${id}`);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Announcements</h2>
          <p className="text-sm text-slate-500">Send updates to parents</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus size={16} /> New announcement
        </button>
      </div>

      {showForm && (
        <div className="card">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
            {success && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{success}</div>}
            <div>
              <label className="label">Title</label>
              <input className="input" placeholder="Announcement title" {...register('title')} />
              {errors.title && <p className="mt-1 text-xs text-rose-500">{errors.title.message}</p>}
            </div>
            <div>
              <label className="label">Message</label>
              <textarea className="input" rows={3} placeholder="Write your announcement…" {...register('body')} />
              {errors.body && <p className="mt-1 text-xs text-rose-500">{errors.body.message}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Audience</label>
                <select className="input" {...register('audience')}>
                  <option value="all_parents">All parents</option>
                  <option value="classroom">Specific classroom</option>
                </select>
              </div>
              {audience === 'classroom' && (
                <div>
                  <label className="label">Classroom</label>
                  <select className="input" {...register('classroom')}>
                    <option value="">Select classroom…</option>
                    {classrooms.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <button type="submit" className="btn-primary">Send announcement</button>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {announcements.map((a) => (
          <div key={a._id} className="card flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-purple/30 text-purple-600"><Megaphone size={18} /></div>
              <div>
                <div className="font-semibold text-slate-900">{a.title}</div>
                <p className="mt-1 text-sm text-slate-600">{a.body}</p>
                <div className="mt-2 text-xs text-slate-400">
                  {new Date(a.createdAt).toLocaleString()} • {a.audience === 'all_parents' ? 'All parents' : 'Classroom'}
                </div>
              </div>
            </div>
            <button onClick={() => remove(a._id)} className="text-slate-400 hover:text-rose-500"><Trash2 size={16} /></button>
          </div>
        ))}
        {announcements.length === 0 && <div className="card text-center text-slate-500">No announcements yet.</div>}
      </div>
    </div>
  );
}
