import { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import api from '../../services/api';
import { Activity } from '../../types';

export default function ParentPhotos() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/activities');
        setActivities(res.data.activities.filter((a: Activity) => a.photoUrls?.length > 0));
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const photos = activities.flatMap(a => a.photoUrls.map(url => ({ url, title: a.title, date: a.date, child: a.child })));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Photo Gallery</h2>
        <p className="text-sm text-slate-500">Photos shared by teachers during activities</p>
      </div>

      {loading ? <p className="text-slate-400">Loading…</p> : photos.length === 0 ? (
        <div className="card text-center text-slate-500">
          <ImageIcon className="mx-auto mb-2 text-slate-300" size={40} />
          <p>No photos shared yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {photos.map((p, i) => (
            <div key={i} className="card overflow-hidden p-0">
              <img src={p.url} alt={p.title} className="h-48 w-full object-cover" />
              <div className="p-3">
                <div className="text-sm font-medium text-slate-900">{p.title}</div>
                <div className="text-xs text-slate-500">{new Date(p.date).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
