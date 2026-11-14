import { useEffect, useState } from 'react';
import { Activity as ActivityIcon } from 'lucide-react';
import api from '../../services/api';
import { Activity, ActivityCategory } from '../../types';

const categoryLabels: Record<ActivityCategory, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', snacks: 'Snacks', nap: 'Nap time',
  play: 'Play', learning: 'Learning', indoor: 'Indoor', outdoor: 'Outdoor', art: 'Art & Drawing', other: 'Other',
};

export default function AdminActivities() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/activities');
        setActivities(res.data.activities);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Activity Reports</h2>
        <p className="text-sm text-slate-500">All recorded child activities</p>
      </div>
      <div className="card divide-y divide-slate-100">
        {loading && <p className="py-6 text-center text-slate-400">Loading…</p>}
        {!loading && activities.map((a) => (
          <div key={a._id} className="flex items-center justify-between py-3">
            <div>
              <div className="font-medium text-slate-900">{a.title}</div>
              <div className="text-xs text-slate-500 capitalize">{categoryLabels[a.category]} • {typeof a.child === 'object' ? a.child.fullName : ''} • {new Date(a.date).toLocaleDateString()}</div>
            </div>
            <span className={`badge ${a.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : a.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{a.status.replace('_', ' ')}</span>
          </div>
        ))}
        {!loading && activities.length === 0 && <p className="py-6 text-center text-sm text-slate-500"><ActivityIcon className="mx-auto mb-2 text-slate-300" size={32} />No activities recorded.</p>}
      </div>
    </div>
  );
}
