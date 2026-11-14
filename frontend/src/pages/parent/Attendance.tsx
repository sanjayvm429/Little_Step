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

export default function ParentAttendance() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/attendance');
        setRecords(res.data.attendance);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Attendance</h2>
        <p className="text-sm text-slate-500">Check-in and check-out history for your children</p>
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
            {!loading && records.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                <CalendarCheck className="mx-auto mb-2 text-slate-300" size={32} /> No attendance records yet.
              </td></tr>
            )}
            {records.map((r) => (
              <tr key={r._id} className="hover:bg-slate-50">
                <td className="px-5 py-3">{new Date(r.date).toLocaleDateString()}</td>
                <td className="px-5 py-3 font-medium">{typeof r.child === 'object' ? r.child.fullName : '—'}</td>
                <td className="px-5 py-3">{r.checkIn ? new Date(r.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td className="px-5 py-3">{r.checkOut ? new Date(r.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td className="px-5 py-3"><span className={`badge ${statusColor[r.status]}`}>{r.status.replace('_', ' ')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
