import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import api from '../../services/api';
import { Child } from '../../types';

export default function TeacherChildren() {
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/children');
        setChildren(res.data.children);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Children</h2>
        <p className="text-sm text-slate-500">Children in your assigned classrooms</p>
      </div>
      {loading ? <p className="text-slate-400">Loading…</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((child) => (
            <div key={child._id} className="card">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-purple/20 text-lg font-bold text-purple-600">{child.fullName[0]}</div>
                <div>
                  <div className="font-semibold text-slate-900">{child.fullName}</div>
                  <div className="text-xs text-slate-500">{child.admissionNumber}</div>
                </div>
              </div>
              <div className="mt-3 text-sm text-slate-600">
                <div>Classroom: <span className="font-medium">{typeof child.classroom === 'object' ? child.classroom?.name : '—'}</span></div>
                <div>DOB: <span className="font-medium">{new Date(child.dateOfBirth).toLocaleDateString()}</span></div>
              </div>
            </div>
          ))}
          {children.length === 0 && <div className="card col-span-full text-center text-slate-500"><Users className="mx-auto mb-2 text-slate-300" size={32} /><p>No children assigned.</p></div>}
        </div>
      )}
    </div>
  );
}
