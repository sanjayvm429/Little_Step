import { useEffect, useState } from 'react';
import { KeyRound, CheckCircle2, XCircle, Clock } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { Relationship, PickupAuthorization } from '../../types';

export default function AdminAccessRequests() {
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [pickups, setPickups] = useState<PickupAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    try {
      const [r, p] = await Promise.all([
        api.get('/admin/relationships', { params: { status: 'pending' } }),
        api.get('/pickup-authorizations'),
      ]);
      setRelationships(r.data.relationships);
      setPickups(p.data.authorizations.filter((x: PickupAuthorization) => x.status === 'pending'));
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reviewRel = async (id: string, status: 'approved' | 'rejected') => {
    setError(''); setSuccess('');
    try {
      await api.put(`/admin/relationships/${id}/review`, { status });
      setSuccess(`Relationship ${status}.`);
      load();
    } catch (err) { setError(getErrorMessage(err)); }
  };

  const reviewPickup = async (id: string, status: 'approved' | 'rejected') => {
    setError(''); setSuccess('');
    try {
      await api.put(`/pickup-authorizations/${id}/review`, { status });
      setSuccess(`Pickup authorization ${status}.`);
      load();
    } catch (err) { setError(getErrorMessage(err)); }
  };

  const statusIcon = { approved: <CheckCircle2 size={16} className="text-emerald-500" />, rejected: <XCircle size={16} className="text-rose-500" />, pending: <Clock size={16} className="text-amber-500" /> };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Access Requests</h2>
        <p className="text-sm text-slate-500">Approve parent-child relationships and pickup authorizations</p>
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
      {success && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{success}</div>}

      {loading ? <p className="text-slate-400">Loading…</p> : (
        <>
          {/* Parent-child relationships */}
          <div className="card">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><KeyRound size={18} /> Parent-Child Access Requests</h3>
            <div className="divide-y divide-slate-100">
              {relationships.length === 0 && <p className="py-4 text-sm text-slate-500">No pending requests.</p>}
              {relationships.map((r) => (
                <div key={r._id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium text-slate-900">
                      {typeof r.parent === 'object' ? r.parent.fullName : 'Parent'} → {typeof r.child === 'object' ? r.child.fullName : 'Child'}
                    </div>
                    <div className="text-xs text-slate-500">{r.relationship} • {new Date(r.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => reviewRel(r._id, 'approved')} className="btn-primary px-3 py-1.5 text-xs">Approve</button>
                    <button onClick={() => reviewRel(r._id, 'rejected')} className="btn-danger px-3 py-1.5 text-xs">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pickup authorizations */}
          <div className="card">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><KeyRound size={18} /> Pickup Authorization Requests</h3>
            <div className="divide-y divide-slate-100">
              {pickups.length === 0 && <p className="py-4 text-sm text-slate-500">No pending requests.</p>}
              {pickups.map((p) => (
                <div key={p._id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium text-slate-900">{p.name} ({p.relationship})</div>
                    <div className="text-xs text-slate-500">{p.phone} • for {typeof p.child === 'object' ? p.child.fullName : 'child'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusIcon[p.status]}
                    <button onClick={() => reviewPickup(p._id, 'approved')} className="btn-primary px-3 py-1.5 text-xs">Approve</button>
                    <button onClick={() => reviewPickup(p._id, 'rejected')} className="btn-danger px-3 py-1.5 text-xs">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
