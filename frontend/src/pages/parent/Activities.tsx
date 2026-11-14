import { useEffect, useState } from 'react';
import { Activity as ActivityIcon } from 'lucide-react';
import api from '../../services/api';
import { Activity, ActivityCategory } from '../../types';

const categoryLabels: Record<ActivityCategory, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', snacks: 'Snacks', nap: 'Nap time',
  play: 'Play', learning: 'Learning', indoor: 'Indoor', outdoor: 'Outdoor', art: 'Art & Drawing', other: 'Other',
};

const categoryColors: Record<ActivityCategory, string> = {
  breakfast: 'bg-amber-100 text-amber-700', lunch: 'bg-orange-100 text-orange-700', snacks: 'bg-yellow-100 text-yellow-700',
  nap: 'bg-indigo-100 text-indigo-700', play: 'bg-emerald-100 text-emerald-700', learning: 'bg-sky-100 text-sky-700',
  indoor: 'bg-violet-100 text-violet-700', outdoor: 'bg-lime-100 text-lime-700', art: 'bg-pink-100 text-pink-700', other: 'bg-slate-100 text-slate-600',
};

export default function ParentActivities() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/activities');
        setActivities(res.data.activities);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const filtered = filter ? activities.filter(a => a.category === filter) : activities;

  // group by date
  const byDate = filtered.reduce<Record<string, Activity[]>>((acc, a) => {
    const d = new Date(a.date).toLocaleDateString();
    (acc[d] = acc[d] || []).push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Daily Activities</h2>
          <p className="text-sm text-slate-500">Timeline of your child's day</p>
        </div>
        <select className="input w-auto" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All categories</option>
          {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? <p className="text-slate-400">Loading…</p> : Object.keys(byDate).length === 0 ? (
        <div className="card text-center text-slate-500">
          <ActivityIcon className="mx-auto mb-2 text-slate-300" size={40} />
          <p>No activities recorded yet.</p>
        </div>
      ) : (
        Object.entries(byDate).map(([date, items]) => (
          <div key={date}>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">{date}</h3>
            <div className="relative ml-3 space-y-4 border-l-2 border-slate-200 pl-6">
              {items.map((a) => (
                <div key={a._id} className="relative">
                  <div className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-primary" />
                  <div className="card">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-slate-900">{a.title}</div>
                      <span className={`badge ${categoryColors[a.category]}`}>{categoryLabels[a.category]}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {a.startTime ? new Date(a.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      {a.endTime ? ` – ${new Date(a.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                      {' • '}{typeof a.child === 'object' ? a.child.fullName : ''}
                    </div>
                    {a.description && <p className="mt-2 text-sm text-slate-600">{a.description}</p>}
                    {a.photoUrls?.length > 0 && (
                      <div className="mt-3 flex gap-2">
                        {a.photoUrls.map((url, i) => (
                          <img key={i} src={url} alt="activity" className="h-20 w-20 rounded-lg object-cover" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
