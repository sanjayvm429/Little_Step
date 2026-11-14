import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Baby, Plus, X, Trash2 } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { Child, Classroom } from '../../types';

const schema = z.object({
  fullName: z.string().min(2, 'Name required'),
  dateOfBirth: z.string().min(1, 'DOB required'),
  gender: z.enum(['male', 'female', 'other']).optional(),
  admissionNumber: z.string().min(3, 'Admission number required'),
  classroom: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function AdminChildren() {
  const [children, setChildren] = useState<Child[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const load = async () => {
    try {
      const [c, cl] = await Promise.all([api.get('/children'), api.get('/classrooms')]);
      setChildren(c.data.children);
      setClassrooms(cl.data.classrooms);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const onSubmit = async (data: FormData) => {
    setError(''); setSuccess('');
    try {
      await api.post('/children', { ...data, dateOfBirth: new Date(data.dateOfBirth).toISOString() });
      setSuccess('Child registered.');
      reset();
      setShowForm(false);
      load();
    } catch (err) { setError(getErrorMessage(err)); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this child? This cannot be undone.')) return;
    await api.delete(`/children/${id}`);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Child Management</h2>
          <p className="text-sm text-slate-500">{children.length} children registered</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'Add child'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
            {error && <div className="sm:col-span-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
            {success && <div className="sm:col-span-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{success}</div>}
            <div>
              <label className="label">Full name</label>
              <input className="input" {...register('fullName')} />
              {errors.fullName && <p className="mt-1 text-xs text-rose-500">{errors.fullName.message}</p>}
            </div>
            <div>
              <label className="label">Date of birth</label>
              <input className="input" type="date" {...register('dateOfBirth')} />
              {errors.dateOfBirth && <p className="mt-1 text-xs text-rose-500">{errors.dateOfBirth.message}</p>}
            </div>
            <div>
              <label className="label">Gender</label>
              <select className="input" {...register('gender')}>
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="label">Admission number</label>
              <input className="input" placeholder="LS-XXX" {...register('admissionNumber')} />
              {errors.admissionNumber && <p className="mt-1 text-xs text-rose-500">{errors.admissionNumber.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="label">Classroom</label>
              <select className="input" {...register('classroom')}>
                <option value="">Unassigned</option>
                {classrooms.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary">Register child</button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Name</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Admission #</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">DOB</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Classroom</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Status</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && children.map((c) => (
              <tr key={c._id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium">{c.fullName}</td>
                <td className="px-5 py-3">{c.admissionNumber}</td>
                <td className="px-5 py-3">{new Date(c.dateOfBirth).toLocaleDateString()}</td>
                <td className="px-5 py-3">{typeof c.classroom === 'object' ? c.classroom?.name : '—'}</td>
                <td className="px-5 py-3"><span className={`badge ${c.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{c.status}</span></td>
                <td className="px-5 py-3"><button onClick={() => remove(c._id)} className="text-slate-400 hover:text-rose-500"><Trash2 size={16} /></button></td>
              </tr>
            ))}
            {!loading && children.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400"><Baby className="mx-auto mb-2 text-slate-300" size={32} />No children registered.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
