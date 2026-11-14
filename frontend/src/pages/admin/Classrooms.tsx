import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { School, Plus, X, Trash2 } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { Classroom, User } from '../../types';

const schema = z.object({
  name: z.string().min(2, 'Name required'),
  ageGroup: z.string().min(2, 'Age group required'),
  capacity: z.coerce.number().min(1),
  teacher: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function AdminClassrooms() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const load = async () => {
    try {
      const [c, t] = await Promise.all([api.get('/classrooms'), api.get('/admin/users', { params: { role: 'teacher' } })]);
      setClassrooms(c.data.classrooms);
      setTeachers(t.data.users);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const onSubmit = async (data: FormData) => {
    setError(''); setSuccess('');
    try {
      await api.post('/classrooms', data);
      setSuccess('Classroom created.');
      reset();
      setShowForm(false);
      load();
    } catch (err) { setError(getErrorMessage(err)); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this classroom?')) return;
    await api.delete(`/classrooms/${id}`);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Classroom Management</h2>
          <p className="text-sm text-slate-500">{classrooms.length} classrooms</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'Add classroom'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
            {error && <div className="sm:col-span-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
            {success && <div className="sm:col-span-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{success}</div>}
            <div>
              <label className="label">Name</label>
              <input className="input" placeholder="e.g. Sunshine" {...register('name')} />
              {errors.name && <p className="mt-1 text-xs text-rose-500">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Age group</label>
              <input className="input" placeholder="e.g. 2-3 years" {...register('ageGroup')} />
              {errors.ageGroup && <p className="mt-1 text-xs text-rose-500">{errors.ageGroup.message}</p>}
            </div>
            <div>
              <label className="label">Capacity</label>
              <input className="input" type="number" min={1} {...register('capacity')} />
              {errors.capacity && <p className="mt-1 text-xs text-rose-500">{errors.capacity.message}</p>}
            </div>
            <div>
              <label className="label">Assign teacher</label>
              <select className="input" {...register('teacher')}>
                <option value="">Unassigned</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary">Create classroom</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading && <p className="text-slate-400">Loading…</p>}
        {!loading && classrooms.map((c) => (
          <div key={c._id} className="card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-blue/30 text-sky-600"><School size={22} /></div>
                <div>
                  <div className="font-semibold text-slate-900">{c.name}</div>
                  <div className="text-xs text-slate-500">{c.ageGroup}</div>
                </div>
              </div>
              <button onClick={() => remove(c._id)} className="text-slate-400 hover:text-rose-500"><Trash2 size={16} /></button>
            </div>
            <div className="mt-4 space-y-1 text-sm text-slate-600">
              <div>Capacity: <span className="font-medium">{c.capacity}</span></div>
              <div>Teacher: <span className="font-medium">{typeof c.teacher === 'object' ? c.teacher?.fullName : 'Unassigned'}</span></div>
            </div>
          </div>
        ))}
        {!loading && classrooms.length === 0 && <div className="card col-span-full text-center text-slate-500">No classrooms yet.</div>}
      </div>
    </div>
  );
}
