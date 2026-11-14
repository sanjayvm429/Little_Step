import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { School, Users, CalendarCheck, Activity, MessageSquare, ArrowRight } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Classroom, Child, AttendanceRecord, Activity as ActivityType } from '../../types';

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [cl, ch, att, act] = await Promise.all([
          api.get('/classrooms'), api.get('/children'), api.get('/attendance'), api.get('/activities'),
        ]);
        setClassrooms(cl.data.classrooms);
        setChildren(ch.data.children);
        setAttendance(att.data.attendance);
        setActivities(act.data.activities);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const presentToday = attendance.filter(a => a.date.startsWith(today) && a.status !== 'absent').length;

  if (loading) return <div className="text-slate-400">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="card bg-gradient-to-r from-brand-green/20 to-brand-blue/20">
        <h2 className="text-2xl font-bold text-slate-900">Welcome, {user?.fullName?.split(' ')[0]}! 👋</h2>
        <p className="mt-1 text-sm text-slate-600">Here's your classroom overview for today.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'My Classrooms', value: classrooms.length, icon: School, color: 'bg-brand-blue/30 text-sky-600' },
          { label: 'Total Children', value: children.length, icon: Users, color: 'bg-brand-purple/30 text-purple-600' },
          { label: 'Present Today', value: presentToday, icon: CalendarCheck, color: 'bg-brand-green/30 text-emerald-600' },
          { label: "Today's Activities", value: activities.filter(a => a.date.startsWith(today)).length, icon: Activity, color: 'bg-brand-pink/30 text-pink-600' },
        ].map((s) => (
          <div key={s.label} className="card flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${s.color}`}><s.icon size={22} /></div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{s.value}</div>
              <div className="text-sm text-slate-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">My Classrooms</h3>
            <Link to="/teacher/classrooms" className="text-sm font-medium text-brand-primary hover:underline">View all</Link>
          </div>
          <div className="space-y-3">
            {classrooms.map((c) => (
              <div key={c._id} className="card flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{c.name}</div>
                  <div className="text-xs text-slate-500">{c.ageGroup} • Capacity {c.capacity}</div>
                </div>
                <span className="badge bg-brand-blue/30 text-sky-700">{children.filter(ch => typeof ch.classroom === 'object' && ch.classroom?._id === c._id).length} children</span>
              </div>
            ))}
            {classrooms.length === 0 && <div className="card text-sm text-slate-500">No classrooms assigned yet.</div>}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Recent Activities</h3>
            <Link to="/teacher/activities" className="text-sm font-medium text-brand-primary hover:underline">Manage</Link>
          </div>
          <div className="card divide-y divide-slate-100">
            {activities.slice(0, 6).map((a) => (
              <div key={a._id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">{a.title}</div>
                  <div className="text-xs text-slate-500 capitalize">{a.category} • {typeof a.child === 'object' ? a.child.fullName : ''}</div>
                </div>
                <span className={`badge ${a.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{a.status.replace('_', ' ')}</span>
              </div>
            ))}
            {activities.length === 0 && <p className="py-4 text-sm text-slate-500">No activities yet.</p>}
          </div>
          <Link to="/teacher/messages" className="btn-secondary mt-4 flex w-full items-center justify-center gap-2">
            <MessageSquare size={16} /> Messages <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
