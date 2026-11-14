import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Camera, CalendarCheck, Bell, ArrowRight, Baby } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Child, Camera as CameraType, AppNotification, Activity } from '../../types';

function age(dob: string) {
  const d = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  let months = now.getMonth() - d.getMonth();
  if (months < 0) { years--; months += 12; }
  return `${years}y ${months}m`;
}

export default function ParentDashboard() {
  const { user } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [attendanceToday, setAttendanceToday] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [c, cam, n, a, att] = await Promise.all([
          api.get('/children'),
          api.get('/cameras'),
          api.get('/notifications'),
          api.get('/activities'),
          api.get('/attendance'),
        ]);
        setChildren(c.data.children);
        setCameras(cam.data.cameras);
        setNotifications(n.data.notifications.slice(0, 5));
        setActivities(a.data.activities.slice(0, 6));
        const today = new Date().toISOString().slice(0, 10);
        setAttendanceToday(att.data.attendance.filter((x: { date: string; status: string }) => x.date.startsWith(today) && x.status !== 'absent').length);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-slate-400">Loading dashboard…</div>;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="card bg-gradient-to-r from-brand-blue/20 to-brand-purple/20">
        <h2 className="text-2xl font-bold text-slate-900">Welcome back, {user?.fullName?.split(' ')[0]}! 👋</h2>
        <p className="mt-1 text-sm text-slate-600">Here's what's happening with your little ones today.</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'My Children', value: children.length, icon: Users, color: 'bg-brand-blue/30 text-sky-600' },
          { label: 'Active Cameras', value: cameras.filter(c => c.status === 'online').length, icon: Camera, color: 'bg-brand-purple/30 text-purple-600' },
          { label: "Today's Attendance", value: attendanceToday, icon: CalendarCheck, color: 'bg-brand-green/30 text-emerald-600' },
          { label: 'Unread Notifications', value: notifications.filter(n => !n.isRead).length, icon: Bell, color: 'bg-brand-pink/30 text-pink-600' },
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Children */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">My Children</h3>
            <Link to="/parent/children" className="text-sm font-medium text-brand-primary hover:underline">View all</Link>
          </div>
          {children.length === 0 ? (
            <div className="card text-center text-slate-500">
              <Baby className="mx-auto mb-2 text-slate-300" size={40} />
              <p>No children linked yet. Request access using your child's admission number.</p>
              <Link to="/parent/children" className="btn-primary mt-4 inline-block">Add child</Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {children.map((child) => (
                <div key={child._id} className="card">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-purple/20 text-lg font-bold text-purple-600">
                      {child.fullName[0]}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">{child.fullName}</div>
                      <div className="text-xs text-slate-500">{age(child.dateOfBirth)} • {typeof child.classroom === 'object' ? child.classroom?.name : '—'}</div>
                    </div>
                  </div>
                  <Link to="/parent/live" className="btn-secondary mt-4 w-full text-xs">View live camera</Link>
                </div>
              ))}
            </div>
          )}

          {/* Recent activities */}
          <h3 className="pt-2 text-lg font-bold text-slate-900">Recent Activities</h3>
          <div className="card divide-y divide-slate-100">
            {activities.length === 0 && <p className="py-4 text-sm text-slate-500">No activities yet.</p>}
            {activities.map((a) => (
              <div key={a._id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">{a.title}</div>
                  <div className="text-xs text-slate-500 capitalize">{a.category} • {new Date(a.date).toLocaleDateString()}</div>
                </div>
                <span className={`badge ${a.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : a.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{a.status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Notifications */}
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Notifications</h3>
            <Link to="/parent/notifications" className="text-sm font-medium text-brand-primary hover:underline">View all</Link>
          </div>
          <div className="card divide-y divide-slate-100">
            {notifications.length === 0 && <p className="py-4 text-sm text-slate-500">No notifications.</p>}
            {notifications.map((n) => (
              <div key={n._id} className={`py-3 ${!n.isRead ? 'bg-brand-blue/10 -mx-5 px-5' : ''}`}>
                <div className="text-sm font-medium text-slate-900">{n.title}</div>
                <div className="text-xs text-slate-500">{n.body}</div>
                <div className="mt-1 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
          <Link to="/parent/live" className="btn-primary mt-4 flex w-full items-center justify-center gap-2">
            <Camera size={18} /> Live Monitoring <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
