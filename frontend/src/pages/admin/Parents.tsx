import { useEffect, useState } from 'react';
import { Users, Search } from 'lucide-react';
import api from '../../services/api';
import { User } from '../../types';

export default function AdminParents() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/admin/users', { params: { role: 'parent' } });
        setUsers(res.data.users);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const filtered = users.filter(u => u.fullName.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Parent Management</h2>
          <p className="text-sm text-slate-500">{users.length} registered parents</p>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search parents…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Name</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Email</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Phone</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Verified</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && filtered.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium">{u.fullName}</td>
                <td className="px-5 py-3">{u.email}</td>
                <td className="px-5 py-3">{u.phone ?? '—'}</td>
                <td className="px-5 py-3">{u.isEmailVerified ? <span className="badge bg-emerald-100 text-emerald-700">Verified</span> : <span className="badge bg-amber-100 text-amber-700">Pending</span>}</td>
                <td className="px-5 py-3 text-slate-500">{new Date().toLocaleDateString()}</td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400"><Users className="mx-auto mb-2 text-slate-300" size={32} />No parents found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
