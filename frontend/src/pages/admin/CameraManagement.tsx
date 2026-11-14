import { useEffect, useState } from 'react';
import { Camera, Search, Wifi, WifiOff, Power, Trash2, RefreshCw, Edit3, Video } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { Camera as CameraType, NvrDevice, NvrBrand } from '../../types';

const brandLabels: Record<NvrBrand, string> = {
  hikvision: 'Hikvision', dahua: 'Dahua', cpplus: 'CP Plus', uniview: 'Uniview',
  axis: 'Axis', hanwha: 'Hanwha', bosch: 'Bosch', tvt: 'TVT', honeywell: 'Honeywell', other: 'Other',
};

export default function CameraManagement() {
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [nvrs, setNvrs] = useState<NvrDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterNvr, setFilterNvr] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showDisabled, setShowDisabled] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const load = async () => {
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filterNvr) params.nvr = filterNvr;
      if (filterBrand) params.brand = filterBrand;
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.connectionType = filterType;
      if (showDisabled) params.includeDisabled = 'true';
      const [camRes, nvrRes] = await Promise.all([
        api.get('/cameras', { params }),
        api.get('/nvrs'),
      ]);
      setCameras(camRes.data.cameras);
      setNvrs(nvrRes.data.nvrs);
    } catch (err) { setError(getErrorMessage(err)); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [search, filterNvr, filterBrand, filterStatus, filterType, showDisabled]);

  const testCam = async (id: string) => {
    setTesting(id);
    try {
      await api.post(`/cameras/${id}/test`);
      load();
    } catch (err) { setError(getErrorMessage(err)); }
    setTesting(null);
  };

  const toggle = async (id: string) => {
    try {
      await api.post(`/cameras/${id}/toggle`);
      load();
    } catch (err) { setError(getErrorMessage(err)); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this camera?')) return;
    try {
      await api.delete(`/cameras/${id}`);
      load();
    } catch (err) { setError(getErrorMessage(err)); }
  };

  const nvrName = (cam: CameraType) => typeof cam.nvr === 'object' ? cam.nvr?.name : '—';
  const nvrBrand = (cam: CameraType) => typeof cam.nvr === 'object' ? brandLabels[cam.nvr?.brand ?? 'other'] : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Camera Management</h2>
          <p className="text-sm text-slate-500">{cameras.length} camera(s)</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showDisabled} onChange={e => setShowDisabled(e.target.checked)} className="rounded border-slate-300" />
          Show disabled
        </label>
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search by name…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={filterNvr} onChange={e => setFilterNvr(e.target.value)}>
          <option value="">All NVRs</option>
          {nvrs.map(n => <option key={n._id} value={n._id}>{n.name}</option>)}
        </select>
        <select className="input w-auto" value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
          <option value="">All brands</option>
          {Object.entries(brandLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="input w-auto" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All types</option>
          <option value="http_rtsp">HTTP + RTSP</option>
          <option value="direct_rtsp">Direct RTSP</option>
          <option value="standalone">Standalone</option>
        </select>
        <select className="input w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Camera</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">NVR</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Brand</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Location</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Channel</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Type</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Stream</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Enabled</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={9} className="px-5 py-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && cameras.map((cam) => (
              <tr key={cam._id} className={`hover:bg-slate-50 ${!cam.isEnabled ? 'opacity-50' : ''}`}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Video size={15} className="text-slate-400" />
                    <span className="font-medium">{cam.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3">{nvrName(cam)}</td>
                <td className="px-5 py-3">{nvrBrand(cam)}</td>
                <td className="px-5 py-3">{cam.location}</td>
                <td className="px-5 py-3">{cam.channelNumber ?? '—'}</td>
                <td className="px-5 py-3 text-xs">{cam.connectionType === 'http_rtsp' ? 'HTTP+RTSP' : cam.connectionType === 'direct_rtsp' ? 'Direct RTSP' : 'Standalone'}</td>
                <td className="px-5 py-3">
                  <span className={`badge ${cam.status === 'online' ? 'bg-emerald-100 text-emerald-700' : cam.status === 'offline' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{cam.status}</span>
                </td>
                <td className="px-5 py-3">
                  <button onClick={() => toggle(cam._id)} className={`rounded-lg p-1.5 ${cam.isEnabled ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`} title={cam.isEnabled ? 'Disable' : 'Enable'}>
                    <Power size={15} />
                  </button>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => testCam(cam._id)} disabled={testing === cam._id} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-sky-600" title="Test connection">
                      <RefreshCw size={15} className={testing === cam._id ? 'animate-spin' : ''} />
                    </button>
                    <button onClick={() => remove(cam._id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && cameras.length === 0 && (
              <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-400">
                <Camera className="mx-auto mb-2 text-slate-300" size={36} />
                No cameras found. Add an NVR or configure cameras via Direct RTSP.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
