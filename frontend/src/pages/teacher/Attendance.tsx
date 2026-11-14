import { useEffect, useState } from 'react';
import { CalendarCheck, LogIn, LogOut } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { AttendanceRecord, Child } from '../../types';

const statusColor: Record<string, string> = {
  present: 'bg-emerald-100 text-emerald-700',
  absent: 'bg-rose-100 text-rose-700',
  late: 'bg-amber-100 text-amber-700',
  early_departure: 'bg-sky-100 text-sky-700',
};

export default function TeacherAttendance() {
  const [children, setChildren] = useState<Child[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    try {
      const [ch, att] = await Promise.all([api.get('/children'), api.get('/attendance')]);
      setChildren(ch.data.children);
      setRecords(att.data.attendance);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const today = new Date().toISOString().slice(0, 10);
  const todayRecords = records.filter(r => r.date.startsWith(today));

  const checkIn = async (childId: string) => {
    setError(''); setSuccess('');
    try {
      await api.post('/attendance/check-in', { childId });
      setSuccess('Checked in successfully.');
      load();
    } catch (err) { setError(getErrorMessage(err)); }
  };

  const checkOut = async (childId: string) => {
    setError(''); setSuccess('');
    try {
      await api.post('/attendance/check-out', { childId });
      setSuccess('Checked out successfully.');
      load();
    } catch (err) { setError(getErrorMessage(err)); }
  };

  const markAbsent = async (childId: string) => {
    setError(''); setSuccess('');
    try {
      await api.post('/attendance/status', { childId, date: today, status: 'absent' });
      setSuccess('Marked absent.');
      load();
    } catch (err) { setError(getErrorMessage(err)); }
  };

  const getRecord = (childId: string) => todayRecords.find(r => (typeof r.child === 'object' ? r.child._id : r.child) === childId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Attendance</h2>
        <p className="text-sm text-slate-500">Mark check-in / check-out for your children</p>
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
      {success && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{success}</div>}

      {loading ? <p className="text-slate-400">Loading…</p> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">Child</th>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">Status</th>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">Check-in</th>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">Check-out</th>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {children.map((child) => {
                const rec = getRecord(child._id);
                return (
                  <tr key={child._id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium">{child.fullName}</td>
                    <td className="px-5 py-3">
                      {rec ? <span className={`badge ${statusColor[rec.status]}`}>{rec.status.replace('_', ' ')}</span> : <span className="badge bg-slate-100 text-slate-500">not marked</span>}
                    </td>
                    <td className="px-5 py-3">{rec?.checkIn ? new Date(rec.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="px-5 py-3">{rec?.checkOut ? new Date(rec.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        {!rec?.checkIn && <button onClick={() => checkIn(child._id)} className="btn-secondary px-3 py-1.5 text-xs"><LogIn size={14} /> In</button>}
                        {rec?.checkIn && !rec?.checkOut && <button onClick={() => checkOut(child._id)} className="btn-secondary px-3 py-1.5 text-xs"><LogOut size={14} /> Out</button>}
                        {!rec && <button onClick={() => markAbsent(child._id)} className="btn-danger px-3 py-1.5 text-xs">Absent</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {children.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400"><CalendarCheck className="mx-auto mb-2 text-slate-300" size={32} />No children assigned.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
