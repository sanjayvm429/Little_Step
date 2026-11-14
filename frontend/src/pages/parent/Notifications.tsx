import { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import api from '../../services/api';
import { AppNotification } from '../../types';

const typeColors: Record<string, string> = {
  check_in: 'bg-emerald-100 text-emerald-700',
  check_out: 'bg-sky-100 text-sky-700',
  activity: 'bg-violet-100 text-violet-700',
  photo: 'bg-pink-100 text-pink-700',
  message: 'bg-amber-100 text-amber-700',
  announcement: 'bg-indigo-100 text-indigo-700',
  pickup: 'bg-orange-100 text-orange-700',
  safety: 'bg-rose-100 text-rose-700',
  camera_status: 'bg-slate-100 text-slate-600',
};

export default function ParentNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    await api.put(`/notifications/${id}/read`);
    setNotifications(ns => ns.map(n => n._id === id ? { ...n, isRead: true } : n));
  };

  const markAll = async () => {
    await api.put('/notifications/read-all');
    setNotifications(ns => ns.map(n => ({ ...n, isRead: true })));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Notifications</h2>
          <p className="text-sm text-slate-500">Updates about your children</p>
        </div>
        <button onClick={markAll} className="btn-secondary text-sm"><CheckCheck size={16} /> Mark all read</button>
      </div>

      {loading ? <p className="text-slate-400">Loading…</p> : notifications.length === 0 ? (
        <div className="card text-center text-slate-500">
          <Bell className="mx-auto mb-2 text-slate-300" size={40} />
          <p>No notifications yet.</p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {notifications.map((n) => (
            <button key={n._id} onClick={() => !n.isRead && markRead(n._id)} className={`flex w-full items-start gap-4 py-4 text-left ${!n.isRead ? 'bg-brand-blue/10 -mx-5 px-5' : ''}`}>
              <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${typeColors[n.type] ?? 'bg-slate-100'}`}>
                <Bell size={16} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{n.title}</span>
                  {!n.isRead && <span className="h-2 w-2 rounded-full bg-brand-primary" />}
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>
                <p className="mt-1 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
