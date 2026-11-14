import { useEffect, useState } from 'react';
import { School } from 'lucide-react';
import api from '../../services/api';
import { Classroom, Child } from '../../types';

export default function TeacherClassrooms() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [cl, ch] = await Promise.all([api.get('/classrooms'), api.get('/children')]);
        setClassrooms(cl.data.classrooms);
        setChildren(ch.data.children);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">My Classrooms</h2>
        <p className="text-sm text-slate-500">Classrooms assigned to you</p>
      </div>
      {loading ? <p className="text-slate-400">Loading…</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classrooms.map((c) => {
            const count = children.filter(ch => typeof ch.classroom === 'object' && ch.classroom?._id === c._id).length;
            return (
              <div key={c._id} className="card">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-blue/30 text-sky-600"><School size={22} /></div>
                  <div>
                    <div className="font-semibold text-slate-900">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.ageGroup}</div>
                  </div>
                </div>
                <div className="mt-4 flex justify-between text-sm">
                  <span className="text-slate-500">Children</span>
                  <span className="font-semibold text-slate-900">{count} / {c.capacity}</span>
                </div>
              </div>
            );
          })}
          {classrooms.length === 0 && <div className="card col-span-full text-center text-slate-500">No classrooms assigned.</div>}
        </div>
      )}
    </div>
  );
}
