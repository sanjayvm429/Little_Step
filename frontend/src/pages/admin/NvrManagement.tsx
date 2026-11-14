import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, Plus, Trash2, RefreshCw, Edit3, Search, Settings2, X, CheckSquare, Square, Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { Camera as CameraType, DiscoveredChannel, NvrDevice, NvrBrand } from '../../types';

const brandLabels: Record<NvrBrand, string> = {
  hikvision: 'Hikvision', dahua: 'Dahua', cpplus: 'CP Plus', uniview: 'Uniview',
  axis: 'Axis', hanwha: 'Hanwha', bosch: 'Bosch', tvt: 'TVT', honeywell: 'Honeywell', other: 'Other',
};

export default function NvrManagement() {
  const [nvrs, setNvrs] = useState<NvrDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [testing, setTesting] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [managing, setManaging] = useState<NvrDevice | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredChannel[]>([]);
  const [registered, setRegistered] = useState<CameraType[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(new Set());
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [savingChannels, setSavingChannels] = useState(false);
  const [manageError, setManageError] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    try {
      const res = await api.get('/nvrs');
      setNvrs(res.data.nvrs);
    } catch (err) { setError(getErrorMessage(err)); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const testConnection = async (id: string) => {
    setTesting(id);
    try {
      const res = await api.post(`/nvrs/${id}/test`);
      setError(res.data.ok ? '' : res.data.message);
      load();
    } catch (err) { setError(getErrorMessage(err)); }
    setTesting(null);
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this NVR? This cannot be undone.')) return;
    try {
      await api.delete(`/nvrs/${id}`);
      load();
    } catch (err) { setError(getErrorMessage(err)); }
  };

  const openCameraManager = async (nvr: NvrDevice) => {
    setManaging(nvr);
    setDiscovered([]);
    setRegistered([]);
    setSelectedChannels(new Set());
    setManageError('');
    setLoadingChannels(true);
    try {
      const cameraResponse = await api.get('/cameras', {
        params: { nvr: nvr._id, includeDisabled: 'true' },
      });
      const cameras = cameraResponse.data.cameras as CameraType[];
      setRegistered(cameras);
      setSelectedChannels(new Set(
        cameras.filter(camera => camera.isEnabled && camera.channelNumber).map(camera => camera.channelNumber!)
      ));

      try {
        const discoveryResponse = await api.post(`/nvrs/${nvr._id}/discover`);
        setDiscovered(discoveryResponse.data.channels);
        if (discoveryResponse.data.channels.length === 0) setManageError('No camera channels were reported by this NVR.');
      } catch (err) {
        setManageError(getErrorMessage(err));
      }
    } catch (err) {
      setManageError(getErrorMessage(err));
    }
    setLoadingChannels(false);
  };

  const toggleChannel = (channelNumber: number) => {
    setSelectedChannels(current => {
      const next = new Set(current);
      if (next.has(channelNumber)) next.delete(channelNumber);
      else next.add(channelNumber);
      return next;
    });
  };

  const saveCameraSelection = async () => {
    if (!managing) return;
    const channelMap = new Map<number, string>();
    for (const channel of discovered) channelMap.set(channel.channelNumber, channel.name);
    for (const camera of registered) {
      if (camera.channelNumber && !channelMap.has(camera.channelNumber)) {
        channelMap.set(camera.channelNumber, camera.name);
      }
    }

    setSavingChannels(true);
    setManageError('');
    try {
      const channels = [...selectedChannels].map(channelNumber => ({
        channelNumber,
        name: channelMap.get(channelNumber) ?? `Camera ${channelNumber}`,
      }));
      const result = await api.put(`/nvrs/${managing._id}/cameras/selection`, { channels });
      setNotice(`Camera selection saved. ${result.data.added} added, ${result.data.enabled} enabled, ${result.data.disabled} disabled.`);
      setManaging(null);
      await load();
    } catch (err) {
      setManageError(getErrorMessage(err));
    } finally {
      setSavingChannels(false);
    }
  };

  const filtered = nvrs.filter(n =>
    n.name.toLowerCase().includes(search.toLowerCase()) ||
    n.publicIp.includes(search) ||
    brandLabels[n.brand].toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (s: string) =>
    s === 'online' ? 'bg-emerald-100 text-emerald-700' :
      s === 'offline' || s === 'connection_error' || s === 'authentication_failed' ? 'bg-rose-100 text-rose-700' :
        'bg-slate-100 text-slate-600';

  const statusLabel = (s: string) => s.replace(/_/g, ' ');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">NVR Management</h2>
          <p className="text-sm text-slate-500">{nvrs.length} NVR device(s) configured</p>
        </div>
        <button onClick={() => navigate('/admin/nvrs/add')} className="btn-primary">
          <Plus size={16} /> Add NVR
        </button>
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
      {notice && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search NVRs…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Brand</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Name</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Location</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Public IP</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Connection</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Cameras</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Status</th>
              <th className="px-5 py-3 text-left font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && filtered.map((n) => (
              <tr key={n._id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium">{brandLabels[n.brand]}</td>
                <td className="px-5 py-3">{n.name}</td>
                <td className="px-5 py-3">{n.location}</td>
                <td className="px-5 py-3 font-mono text-xs">{n.publicIp}:{n.httpPort ?? 80}</td>
                <td className="px-5 py-3">{n.connectionType === 'http_rtsp' ? 'HTTP + RTSP' : 'Direct RTSP'}</td>
                <td className="px-5 py-3">{n.cameraCount ?? 0}</td>
                <td className="px-5 py-3"><span className={`badge ${statusBadge(n.status)}`}>{statusLabel(n.status)}</span></td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => testConnection(n._id)} disabled={testing === n._id} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-sky-600" title="Test connection">
                      <RefreshCw size={15} className={testing === n._id ? 'animate-spin' : ''} />
                    </button>
                    {n.connectionType === 'http_rtsp' && n.capabilities?.supportsDiscovery && (
                      <button
                        onClick={() => openCameraManager(n)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-600"
                        title="Manage discovered camera channels"
                      >
                        <Settings2 size={15} />
                      </button>
                    )}
                    <button onClick={() => navigate(`/admin/nvrs/${n._id}/edit`)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit">
                      <Edit3 size={15} />
                    </button>
                    <button onClick={() => remove(n._id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                <Server className="mx-auto mb-2 text-slate-300" size={36} />
                No NVRs configured. Click "Add NVR" to get started.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {managing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setManaging(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Manage cameras — {managing.name}</h3>
                <p className="mt-1 text-sm text-slate-500">Selected channels will be available in Live Wall and Playback.</p>
              </div>
              <button onClick={() => setManaging(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close camera manager">
                <X size={18} />
              </button>
            </div>

            {manageError && <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{manageError}</div>}
            {loadingChannels ? (
              <div className="flex items-center justify-center gap-2 py-12 text-slate-500"><Loader2 size={18} className="animate-spin" /> Discovering camera channels…</div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between text-xs">
                  <span className="text-slate-500">{selectedChannels.size} selected</span>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setSelectedChannels(new Set([
                        ...discovered.map(channel => channel.channelNumber),
                        ...registered.flatMap(camera => camera.channelNumber ? [camera.channelNumber] : []),
                      ]))}
                      className="text-brand-primary hover:underline"
                    >Select all</button>
                    <button onClick={() => setSelectedChannels(new Set())} className="text-slate-500 hover:underline">Clear</button>
                  </div>
                </div>
                <div className="max-h-[55vh] space-y-2 overflow-y-auto">
                  {(() => {
                    const channels = new Map<number, { name: string; status: string }>();
                    for (const channel of discovered) channels.set(channel.channelNumber, { name: channel.name, status: channel.status });
                    for (const camera of registered) {
                      if (camera.channelNumber && !channels.has(camera.channelNumber)) {
                        channels.set(camera.channelNumber, { name: camera.name, status: 'registered' });
                      }
                    }
                    return [...channels.entries()].sort(([a], [b]) => a - b).map(([channelNumber, channel]) => (
                      <label key={channelNumber} className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
                        <span className="flex items-center gap-3">
                          {selectedChannels.has(channelNumber)
                            ? <CheckSquare size={18} className="text-brand-primary" />
                            : <Square size={18} className="text-slate-400" />}
                          <span>
                            <span className="block text-sm font-medium text-slate-900">{channel.name}</span>
                            <span className="text-xs text-slate-500">Channel {channelNumber} · {channel.status}</span>
                          </span>
                        </span>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={selectedChannels.has(channelNumber)}
                          onChange={() => toggleChannel(channelNumber)}
                        />
                      </label>
                    ));
                  })()}
                  {discovered.length === 0 && registered.length === 0 && !manageError && (
                    <p className="py-8 text-center text-sm text-slate-500">No channels found. Check the NVR connection and try again.</p>
                  )}
                  {discovered.length === 0 && registered.length > 0 && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Discovery is unavailable right now. Existing channels are still shown and can be enabled or disabled.</p>
                  )}
                </div>
              </>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setManaging(null)} className="btn-secondary">Cancel</button>
              <button onClick={saveCameraSelection} disabled={loadingChannels || savingChannels} className="btn-primary">
                {savingChannels ? <Loader2 size={16} className="animate-spin" /> : null} Save camera selection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
