import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Plus, Trash2, Wifi, Search, CheckSquare, Square, ArrowLeft, Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { NvrBrand, DiscoveredChannel } from '../../types';

const brands: { value: NvrBrand; label: string }[] = [
  { value: 'hikvision', label: 'Hikvision' },
  { value: 'dahua', label: 'Dahua' },
  { value: 'cpplus', label: 'CP Plus' },
  { value: 'uniview', label: 'Uniview' },
  { value: 'axis', label: 'Axis' },
  { value: 'hanwha', label: 'Hanwha' },
  { value: 'bosch', label: 'Bosch' },
  { value: 'tvt', label: 'TVT' },
  { value: 'honeywell', label: 'Honeywell' },
  { value: 'other', label: 'Other' },
];

const httpRtspSchema = z.object({
  brand: z.string().min(1, 'Select a brand'),
  name: z.string().min(2, 'NVR name required'),
  modelNumber: z.string().optional(),
  location: z.string().min(2, 'Location required'),
  publicIp: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Enter a valid IPv4 address'),
  username: z.string().min(1, 'Username required'),
  password: z.string().min(1, 'Password required'),
  httpPort: z.coerce.number().min(1).max(65535).default(80),
  rtspPort: z.coerce.number().min(1).max(65535).default(554),
});
type HttpRtspForm = z.infer<typeof httpRtspSchema>;

interface DirectCam { name: string; rtspUrl: string; testing?: boolean; testResult?: string }

export default function AddNvr() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'http_rtsp' | 'direct_rtsp'>('http_rtsp');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testing, setTesting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredChannel[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [savedNvrId, setSavedNvrId] = useState<string | null>(null);

  // Direct RTSP state
  const [directBrand, setDirectBrand] = useState<NvrBrand>('other');
  const [directName, setDirectName] = useState('');
  const [directLocation, setDirectLocation] = useState('');
  const [directIp, setDirectIp] = useState('');
  const [directCams, setDirectCams] = useState<DirectCam[]>([{ name: '', rtspUrl: '' }]);
  const [testingAll, setTestingAll] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<HttpRtspForm>({
    resolver: zodResolver(httpRtspSchema),
    defaultValues: { httpPort: 80, rtspPort: 554 },
  });
  const formData = watch();

  const brandSupportsDiscovery = (brand: string) => ['hikvision', 'dahua'].includes(brand);

  // ---- HTTP+RTSP handlers ----
  const testConnection = async () => {
    setError(''); setSuccess(''); setTesting(true);
    try {
      const res = await api.post('/nvrs/test-connection', { ...formData, connectionType: 'http_rtsp' });
      const model = res.data.deviceInfo?.model;
      if (typeof model === 'string' && model && !formData.modelNumber) {
        setValue('modelNumber', model);
      }
      if (res.data.ok) {
        setSuccess(`${res.data.message || 'Connection successful'}${model ? ` Detected model: ${model}.` : ''}`);
      }
      else setError(`${res.data.message || 'Connection failed'}${model ? ` Detected model: ${model}.` : ''}`);
    } catch (err) { setError(getErrorMessage(err)); }
    setTesting(false);
  };

  const discover = async () => {
    setError(''); setSuccess(''); setDiscovering(true);
    setDiscovered([]); setSelected(new Set());
    try {
      const res = await api.post('/nvrs/discover', { ...formData, connectionType: 'http_rtsp' });
      setDiscovered(res.data.channels);
      if (res.data.channels.length === 0) setError('No cameras discovered on this NVR.');
      else setSuccess(`Found ${res.data.channels.length} camera channel(s). Select the ones to add.`);
    } catch (err) { setError(getErrorMessage(err)); }
    setDiscovering(false);
  };

  const saveHttpRtsp = async (data: HttpRtspForm) => {
    setError(''); setSuccess(''); setSaving(true);
    try {
      // Save NVR first
      const nvrRes = await api.post('/nvrs', { ...data, connectionType: 'http_rtsp', skipDiscovery: true });
      const nvrId = nvrRes.data.nvr._id;
      setSavedNvrId(nvrId);
      // Add selected cameras if any
      if (selected.size > 0) {
        const cams = discovered.filter(c => selected.has(c.channelNumber)).map(c => ({
          channelNumber: c.channelNumber, name: c.name, rtspUrl: c.rtspUrl, manualRtspUrl: c.manualRtspUrl,
        }));
        await api.post(`/nvrs/${nvrId}/cameras`, { cameras: cams });
        setSuccess('NVR saved with cameras.');
      } else {
        setSuccess(nvrRes.data.message || 'NVR saved. Add cameras manually via Camera Management or Direct RTSP mode.');
      }
      setTimeout(() => navigate('/admin/nvrs'), 1200);
    } catch (err) { setError(getErrorMessage(err)); }
    setSaving(false);
  };

  const saveNvrOnly = async () => {
    const data = formData as HttpRtspForm;
    setError(''); setSuccess(''); setSaving(true);
    try {
      const nvrRes = await api.post('/nvrs', { ...data, connectionType: 'http_rtsp', skipDiscovery: true });
      setSuccess(nvrRes.data.message || 'NVR saved. Add cameras manually via Camera Management or Direct RTSP mode.');
      setTimeout(() => navigate('/admin/nvrs'), 1200);
    } catch (err) { setError(getErrorMessage(err)); }
    setSaving(false);
  };

  // ---- Direct RTSP handlers ----
  const addDirectCam = () => setDirectCams([...directCams, { name: '', rtspUrl: '' }]);
  const removeDirectCam = (i: number) => setDirectCams(directCams.filter((_, idx) => idx !== i));
  const updateDirectCam = (i: number, field: keyof DirectCam, value: string) => {
    const next = [...directCams];
    next[i] = { ...next[i], [field]: value };
    setDirectCams(next);
  };

  const testDirectStream = async (i: number) => {
    const cam = directCams[i];
    if (!cam.rtspUrl) return;
    const next = [...directCams];
    next[i].testing = true; next[i].testResult = undefined;
    setDirectCams(next);
    try {
      const res = await api.post('/nvrs/test-rtsp', { rtspUrl: cam.rtspUrl });
      next[i].testing = false;
      next[i].testResult = res.data.ok ? 'Reachable' : res.data.message;
    } catch (err) {
      next[i].testing = false;
      next[i].testResult = getErrorMessage(err);
    }
    setDirectCams([...next]);
  };

  const testAllDirect = async () => {
    setTestingAll(true);
    for (let i = 0; i < directCams.length; i++) {
      if (directCams[i].rtspUrl) await testDirectStream(i);
    }
    setTestingAll(false);
  };

  const saveDirect = async () => {
    setError(''); setSuccess(''); setSaving(true);
    try {
      const validCams = directCams.filter(c => c.name.trim() && c.rtspUrl.trim());
      if (validCams.length === 0) throw new Error('Add at least one camera with name and RTSP URL');
      await api.post('/nvrs/direct-rtsp', {
        brand: directBrand, name: directName, location: directLocation, publicIp: directIp,
        cameras: validCams.map(c => ({ name: c.name, rtspUrl: c.rtspUrl })),
      });
      setSuccess('Direct RTSP NVR saved.');
      setTimeout(() => navigate('/admin/nvrs'), 1200);
    } catch (err) { setError(getErrorMessage(err)); }
    setSaving(false);
  };

  const toggleSelect = (ch: number) => {
    const next = new Set(selected);
    if (next.has(ch)) next.delete(ch); else next.add(ch);
    setSelected(next);
  };
  const selectAll = () => setSelected(new Set(discovered.map(c => c.channelNumber)));
  const deselectAll = () => setSelected(new Set());

  const updateManualRtsp = (ch: number, value: string) => {
    setDiscovered(prev => prev.map(c => c.channelNumber === ch ? { ...c, manualRtspUrl: value } : c));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/nvrs')} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><ArrowLeft size={18} /></button>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Add NVR</h2>
          <p className="text-sm text-slate-500">Discover channels and choose which cameras to enable for Live Wall and Playback.</p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button onClick={() => setMode('http_rtsp')} className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition ${mode === 'http_rtsp' ? 'bg-brand-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
          HTTP + RTSP Connection
        </button>
        <button onClick={() => setMode('direct_rtsp')} className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition ${mode === 'direct_rtsp' ? 'bg-brand-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
          Connect Cameras Directly Using RTSP
        </button>
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
      {success && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{success}</div>}

      {mode === 'http_rtsp' ? (
        <form onSubmit={handleSubmit(saveHttpRtsp)} className="card space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">NVR Brand</label>
              <select className="input" {...register('brand')}>
                <option value="">Select brand…</option>
                {brands.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
              {errors.brand && <p className="mt-1 text-xs text-rose-500">{errors.brand.message}</p>}
            </div>
            <div>
              <label className="label">NVR Name</label>
              <input className="input" placeholder="e.g. Main Gate NVR" {...register('name')} />
              {errors.name && <p className="mt-1 text-xs text-rose-500">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Model Number</label>
              <input className="input" placeholder="Optional — detected during connection test" {...register('modelNumber')} />
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input" placeholder="e.g. Building A, Floor 1" {...register('location')} />
              {errors.location && <p className="mt-1 text-xs text-rose-500">{errors.location.message}</p>}
            </div>
            <div>
              <label className="label">Public IP Address</label>
              <input className="input" placeholder="e.g. 203.0.113.10" {...register('publicIp')} />
              {errors.publicIp && <p className="mt-1 text-xs text-rose-500">{errors.publicIp.message}</p>}
            </div>
            <div>
              <label className="label">Username</label>
              <input className="input" placeholder="admin" {...register('username')} />
              {errors.username && <p className="mt-1 text-xs text-rose-500">{errors.username.message}</p>}
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input className="input pr-10" type={showPassword ? 'text' : 'password'} placeholder="••••••••" {...register('password')} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-rose-500">{errors.password.message}</p>}
            </div>
            <div>
              <label className="label">HTTP Port</label>
              <input className="input" type="number" {...register('httpPort', { valueAsNumber: true })} />
            </div>
            <div>
              <label className="label">RTSP Port</label>
              <input className="input" type="number" {...register('rtspPort', { valueAsNumber: true })} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button type="button" onClick={testConnection} disabled={testing} className="btn-secondary">
              {testing ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />} Test Connection
            </button>
            <button type="button" onClick={discover} disabled={discovering || !brandSupportsDiscovery(formData.brand ?? '')} className="btn-secondary">
              {discovering ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Discover Cameras
            </button>
            {!brandSupportsDiscovery(formData.brand ?? '') && formData.brand && (
              <span className="self-center text-xs text-amber-600">Discovery not supported for this brand — use Direct RTSP mode.</span>
            )}
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={saveNvrOnly} disabled={saving} className="btn-secondary">
                {saving ? <Loader2 size={16} className="animate-spin" /> : null} Save NVR Only
              </button>
              <button type="button" onClick={() => navigate('/admin/nvrs')} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? <Loader2 size={16} className="animate-spin" /> : null} Save NVR + Cameras
              </button>
            </div>
          </div>

          {/* Discovered cameras */}
          {discovered.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">Choose Cameras ({discovered.length} discovered)</h3>
                <div className="flex gap-2 text-xs">
                  <button type="button" onClick={selectAll} className="text-brand-primary hover:underline">Select all</button>
                  <button type="button" onClick={deselectAll} className="text-slate-500 hover:underline">Clear</button>
                </div>
              </div>
              <div className="space-y-2">
                {discovered.map((ch) => (
                  <label key={ch.channelNumber} className="block rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 cursor-pointer" onClick={() => toggleSelect(ch.channelNumber)}>
                        {selected.has(ch.channelNumber) ? <CheckSquare size={18} className="text-brand-primary" /> : <Square size={18} className="text-slate-400" />}
                      </div>
                      <input type="checkbox" className="hidden" checked={selected.has(ch.channelNumber)} onChange={() => toggleSelect(ch.channelNumber)} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-slate-900">Camera {ch.channelNumber} — {ch.name}</div>
                          <div className="text-xs text-slate-500">Channel {ch.channelNumber} • {ch.status}</div>
                        </div>
                        <div className="mt-2">
                          <label className="label text-xs">RTSP URL (optional — override auto-detected URL)</label>
                          <input
                            className="input font-mono text-xs"
                            placeholder="rtsp://user:pass@ip:554/..."
                            value={ch.manualRtspUrl || ''}
                            onChange={e => updateManualRtsp(ch.channelNumber, e.target.value)}
                          />
                          <p className="mt-1 text-xs text-slate-400">Leave blank to use auto-detected URL. Use this if discovery fails or returns incorrect URL.</p>
                        </div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              {selected.size > 0 && (
                <p className="mt-3 text-xs text-slate-500">{selected.size} camera(s) will be enabled for Live Wall and Playback. You can change this later with Manage Cameras.</p>
              )}
            </div>
          )}
        </form>
      ) : (
        <div className="card space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">NVR Brand</label>
              <select className="input" value={directBrand} onChange={e => setDirectBrand(e.target.value as NvrBrand)}>
                {brands.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">NVR Name</label>
              <input className="input" placeholder="e.g. Warehouse NVR" value={directName} onChange={e => setDirectName(e.target.value)} />
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input" placeholder="e.g. Warehouse" value={directLocation} onChange={e => setDirectLocation(e.target.value)} />
            </div>
            <div>
              <label className="label">Public IP</label>
              <input className="input" placeholder="e.g. 203.0.113.10" value={directIp} onChange={e => setDirectIp(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Camera Configuration</h3>
              <button type="button" onClick={addDirectCam} className="btn-secondary text-xs"><Plus size={14} /> Add Camera</button>
            </div>
            <div className="space-y-3">
              {directCams.map((cam, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">Camera {i + 1}</span>
                    {directCams.length > 1 && (
                      <button type="button" onClick={() => removeDirectCam(i)} className="text-slate-400 hover:text-rose-500"><Trash2 size={15} /></button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label text-xs">Camera Name</label>
                      <input className="input" placeholder="e.g. Main Gate" value={cam.name} onChange={e => updateDirectCam(i, 'name', e.target.value)} />
                    </div>
                    <div>
                      <label className="label text-xs">RTSP URL</label>
                      <input className="input font-mono text-xs" placeholder="rtsp://user:pass@ip:554/path" value={cam.rtspUrl} onChange={e => updateDirectCam(i, 'rtspUrl', e.target.value)} />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" onClick={() => testDirectStream(i)} disabled={cam.testing || !cam.rtspUrl} className="btn-secondary px-3 py-1.5 text-xs">
                      {cam.testing ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />} Test Stream
                    </button>
                    {cam.testResult && <span className={`text-xs ${cam.testResult === 'Reachable' ? 'text-emerald-600' : 'text-rose-500'}`}>{cam.testResult}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button type="button" onClick={testAllDirect} disabled={testingAll} className="btn-secondary">
              {testingAll ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />} Test All Streams
            </button>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => navigate('/admin/nvrs')} className="btn-secondary">Cancel</button>
              <button type="button" onClick={saveDirect} disabled={saving} className="btn-primary">
                {saving ? <Loader2 size={16} className="animate-spin" /> : null} Save Direct RTSP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
