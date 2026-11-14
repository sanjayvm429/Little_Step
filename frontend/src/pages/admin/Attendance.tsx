import { useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import api from '../../services/api';
import { AttendanceRecord } from '../../types';

const statusColor: Record<string, string> = {
  present: 'bg-emerald-100 text-emerald-700',
  absent: 'bg-rose-100 text-rose-700',
  late: 'bg-amber-100 text-amber-700',
  early_departure: 'bg-sky-100 text-sky-700',
};

export default function AdminAttendance() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = async () => {
    try {
      const res = await api.get('/attendance', { params: { from: from || undefined, to: to || undefined } });
      setRecords(res.data.attendance);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Attendance Reports</h2>
          <p className="text-sm text-slate-500">All attendance records</p>
        </div>
        <div className="flex gap-2">
          <input type="date" className="input w-auto" value={from} onChange={e => setFrom(e.target.value)} />
          <input type="date" className="input w-auto" value={to} onChange={e => setTo(e.target.value)} />
          <button onClick={load} className="btn-primary">Filter</button>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Date</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Child</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Check-in</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Check-out</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && records.map((r) => (
              <tr key={r._id} className="hover:bg-slate-50">
                <td className="px-5 py-3">{new Date(r.date).toLocaleDateString()}</td>
                <td className="px-5 py-3 font-medium">{typeof r.child === 'object' ? r.child.fullName : '—'}</td>
                <td className="px-5 py-3">{r.checkIn ? new Date(r.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td className="px-5 py-3">{r.checkOut ? new Date(r.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td className="px-5 py-3"><span className={`badge ${statusColor[r.status]}`}>{r.status.replace('_', ' ')}</span></td>
              </tr>
            ))}
            {!loading && records.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400"><CalendarCheck className="mx-auto mb-2 text-slate-300" size={32} />No records found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
