import { useEffect, useState } from 'react';
import { Users, Baby, GraduationCap, School, Camera, Wifi, CalendarCheck, KeyRound, AlertTriangle } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface Stats {
  totalChildren: number; totalParents: number; totalTeachers: number; totalClassrooms: number;
  totalCameras: number; onlineCameras: number; offlineCameras: number; todayAttendance: number;
  pendingApprovals: number; pendingPickups: number; openIncidents: number;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/admin/stats');
        setStats(res.data.stats);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-slate-400">Loading…</div>;
  if (!stats) return <div className="text-rose-500">Failed to load stats.</div>;

  const cards = [
    { label: 'Total Children', value: stats.totalChildren, icon: Baby, color: 'bg-brand-purple/30 text-purple-600' },
    { label: 'Total Parents', value: stats.totalParents, icon: Users, color: 'bg-brand-blue/30 text-sky-600' },
    { label: 'Total Teachers', value: stats.totalTeachers, icon: GraduationCap, color: 'bg-brand-green/30 text-emerald-600' },
    { label: 'Classrooms', value: stats.totalClassrooms, icon: School, color: 'bg-amber-100 text-amber-600' },
    { label: 'Cameras Online', value: `${stats.onlineCameras}/${stats.totalCameras}`, icon: Camera, color: 'bg-sky-100 text-sky-600' },
    { label: "Today's Attendance", value: stats.todayAttendance, icon: CalendarCheck, color: 'bg-emerald-100 text-emerald-600' },
    { label: 'Pending Approvals', value: stats.pendingApprovals, icon: KeyRound, color: 'bg-orange-100 text-orange-600' },
    { label: 'Open Incidents', value: stats.openIncidents, icon: AlertTriangle, color: 'bg-rose-100 text-rose-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="card bg-gradient-to-r from-brand-primary/10 to-brand-purple/20">
        <h2 className="text-2xl font-bold text-slate-900">Welcome, {user?.fullName?.split(' ')[0]}! 👋</h2>
        <p className="mt-1 text-sm text-slate-600">Nursery administration overview.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${c.color}`}><c.icon size={22} /></div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{c.value}</div>
              <div className="text-sm text-slate-500">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><Wifi size={18} className="text-emerald-500" /> Camera Health</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-slate-600">Online</span><span className="font-semibold text-emerald-600">{stats.onlineCameras}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-600">Offline</span><span className="font-semibold text-rose-600">{stats.offlineCameras}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-emerald-500" style={{ width: `${stats.totalCameras ? (stats.onlineCameras / stats.totalCameras) * 100 : 0}%` }} />
            </div>
          </div>
        </div>
        <div className="card">
          <h3 className="mb-4 font-semibold text-slate-900">Pending Tasks</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-600">Parent access requests</span><span className="font-semibold">{stats.pendingApprovals}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Pickup authorizations</span><span className="font-semibold">{stats.pendingPickups}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Safety incidents</span><span className="font-semibold">{stats.openIncidents}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
