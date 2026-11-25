import { useCallback, useEffect, useState } from 'react';
import { Activity, Camera, Check, RefreshCw, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';

type CameraPurpose = 'check_in' | 'check_out' | 'monitoring';
type CameraStatus = 'active' | 'inactive';

interface FaceCamera {
  camera_id: string;
  external_camera_id?: string;
  camera_name: string;
  department?: string;
  camera_purpose: CameraPurpose;
  status: CameraStatus;
  stream_status: string;
  last_frame_at?: string;
  last_error?: string | null;
}

interface FaceAttendanceRecord {
  attendance_id: number;
  employee_id: string;
  employee_name: string;
  date: string;
  check_in_time?: string;
  check_out_time?: string;
  check_in_camera_name?: string;
  check_out_camera_name?: string;
  recognition_confidence?: number;
  working_duration_seconds?: number;
  attendance_status: 'checked_in' | 'checked_out';
}

interface RecognitionEvent {
  id: number;
  camera_name?: string;
  camera_purpose: string;
  employee_id?: string;
  employee_name?: string;
  confidence?: number;
  event_type: string;
  message?: string;
  created_at: string;
}

interface RecognitionSettings {
  similarity_threshold: number;
  cooldown_seconds: number;
  frame_interval_ms: number;
  mobile_link_ttl_minutes: number;
}

const dateToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
}

function formatDuration(seconds?: number) {
  if (seconds === undefined) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export default function FaceAttendance() {
  const [cameras, setCameras] = useState<FaceCamera[]>([]);
  const [attendance, setAttendance] = useState<FaceAttendanceRecord[]>([]);
  const [events, setEvents] = useState<RecognitionEvent[]>([]);
  const [unknowns, setUnknowns] = useState<RecognitionEvent[]>([]);
  const [activeWorkers, setActiveWorkers] = useState<string[]>([]);
  const [settings, setSettings] = useState<RecognitionSettings>({
    similarity_threshold: 0.363,
    cooldown_seconds: 60,
    frame_interval_ms: 500,
    mobile_link_ttl_minutes: 30,
  });
  const [from, setFrom] = useState(dateToday);
  const [to, setTo] = useState(dateToday);
  const [loading, setLoading] = useState(true);
  const [savingCamera, setSavingCamera] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [snapshot, setSnapshot] = useState<{ id: number; url: string } | null>(null);

  const load = useCallback(async (refreshCameraList = false) => {
    try {
      if (refreshCameraList) {
        const cameraResponse = await api.get('/face/cameras');
        setCameras(cameraResponse.data.cameras);
      }
      const [statusResponse, attendanceResponse] = await Promise.all([
        api.get('/face/recognition/status'),
        api.get('/face/attendance', {
          params: { date_from: from || undefined, date_to: to || undefined, limit: 500 },
        }),
      ]);
      setCameras(statusResponse.data.cameras);
      setEvents(statusResponse.data.recent_events);
      setUnknowns(statusResponse.data.unknown_detections);
      setActiveWorkers(statusResponse.data.active_workers);
      setSettings((current) => ({ ...current, ...statusResponse.data.settings }));
      setAttendance(attendanceResponse.data.attendance);
      setError('');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => () => {
    if (snapshot) URL.revokeObjectURL(snapshot.url);
  }, [snapshot]);

  const updateCamera = async (camera: FaceCamera) => {
    setSavingCamera(camera.camera_id);
    setError('');
    setNotice('');
    try {
      await api.put(`/face/cameras/${encodeURIComponent(camera.camera_id)}`, {
        camera_purpose: camera.camera_purpose,
        department: camera.department || null,
        status: camera.status,
      });
      setNotice(`${camera.camera_name} mapping saved.`);
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSavingCamera(null);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    setError('');
    setNotice('');
    try {
      const response = await api.put('/face/recognition/settings', settings);
      setSettings(response.data.settings);
      setNotice('Recognition settings saved.');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSavingSettings(false);
    }
  };

  const updateCameraDraft = (id: string, patch: Partial<FaceCamera>) => {
    setCameras((current) => current.map((camera) => camera.camera_id === id ? { ...camera, ...patch } : camera));
  };

  const updateSetting = (key: keyof RecognitionSettings, value: number) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const viewSnapshot = async (id: number) => {
    try {
      const response = await api.get(`/face/recognition/unknowns/${id}/snapshot`, { responseType: 'blob' });
      if (snapshot) URL.revokeObjectURL(snapshot.url);
      setSnapshot({ id, url: URL.createObjectURL(response.data) });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-bold text-slate-100">Face Attendance</h2><p className="mt-1 text-sm text-slate-400">Live camera processing, attendance events, and unknown detections.</p></div>
        <button type="button" className="btn-secondary" onClick={() => void load(true)}><RefreshCw size={15} />Refresh</button>
      </div>
      {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card flex items-center gap-3"><Activity className="text-sky-400" size={20} /><div><div className="text-xs text-slate-400">Active processors</div><div className="text-xl font-bold text-slate-100">{activeWorkers.length}</div></div></div>
        <div className="card flex items-center gap-3"><Camera className="text-emerald-400" size={20} /><div><div className="text-xs text-slate-400">Mapped cameras</div><div className="text-xl font-bold text-slate-100">{cameras.length}</div></div></div>
        <div className="card flex items-center gap-3"><ShieldAlert className="text-amber-400" size={20} /><div><div className="text-xs text-slate-400">Recent unknown detections</div><div className="text-xl font-bold text-slate-100">{unknowns.length}</div></div></div>
      </div>

      <section className="card space-y-4">
        <div><h3 className="font-semibold text-slate-100">Camera purpose mapping</h3><p className="text-xs text-slate-400">Uses the existing dashboard camera records and their private MediaMTX paths.</p></div>
        {cameras.length === 0 && <p className="rounded-lg border border-slate-700 p-4 text-sm text-slate-400">No cameras found. Configure cameras under Camera Management first.</p>}
        <div className="space-y-3">
          {cameras.map((camera) => (
            <div key={camera.camera_id} className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900/40 p-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto] lg:items-end">
              <div><div className="font-medium text-slate-200">{camera.camera_name}</div><div className="text-[11px] text-slate-500">{camera.external_camera_id || camera.camera_id}</div><div className={`mt-1 text-xs ${camera.stream_status === 'connected' ? 'text-emerald-400' : 'text-amber-400'}`}>Stream: {camera.stream_status}{camera.last_frame_at ? ` · ${formatTime(camera.last_frame_at)}` : ''}</div></div>
              <label className="label">Attendance purpose<select className="input mt-1" value={camera.camera_purpose} onChange={(event) => updateCameraDraft(camera.camera_id, { camera_purpose: event.target.value as CameraPurpose })}><option value="monitoring">Monitoring only</option><option value="check_in">Check-in</option><option value="check_out">Check-out</option></select></label>
              <label className="label">Department (optional)<input className="input mt-1" value={camera.department || ''} maxLength={100} onChange={(event) => updateCameraDraft(camera.camera_id, { department: event.target.value })} /></label>
              <label className="label">Processing<select className="input mt-1" value={camera.status} onChange={(event) => updateCameraDraft(camera.camera_id, { status: event.target.value as CameraStatus })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
              <button type="button" className="btn-primary" disabled={savingCamera === camera.camera_id} onClick={() => void updateCamera(camera)}><Check size={14} />{savingCamera === camera.camera_id ? 'Saving…' : 'Save'}</button>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-4">
        <div className="flex items-center gap-2"><SlidersHorizontal size={17} className="text-violet-300" /><div><h3 className="font-semibold text-slate-100">Recognition and attendance settings</h3><p className="text-xs text-slate-400">Tune the confidence threshold against your camera footage before enabling attendance cameras.</p></div></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="label">Match threshold<input className="input mt-1" type="number" min="0.1" max="0.95" step="0.001" value={settings.similarity_threshold} onChange={(event) => updateSetting('similarity_threshold', Number(event.target.value))} /></label>
          <label className="label">Duplicate cooldown (seconds)<input className="input mt-1" type="number" min="5" max="3600" value={settings.cooldown_seconds} onChange={(event) => updateSetting('cooldown_seconds', Number(event.target.value))} /></label>
          <label className="label">Frame interval (ms)<input className="input mt-1" type="number" min="100" max="10000" step="100" value={settings.frame_interval_ms} onChange={(event) => updateSetting('frame_interval_ms', Number(event.target.value))} /></label>
          <label className="label">Mobile link expiry (minutes)<input className="input mt-1" type="number" min="1" max="1440" value={settings.mobile_link_ttl_minutes} onChange={(event) => updateSetting('mobile_link_ttl_minutes', Number(event.target.value))} /></label>
        </div>
        <button type="button" className="btn-primary" disabled={savingSettings} onClick={() => void saveSettings()}>{savingSettings ? 'Saving…' : 'Save settings'}</button>
      </section>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-semibold text-slate-100">Employee attendance records</h3><p className="text-xs text-slate-400">{attendance.length} record(s)</p></div><div className="flex gap-2"><label className="label">From<input className="input mt-1" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="label">To<input className="input mt-1" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button type="button" className="btn-secondary self-end" onClick={() => void load()}>Filter</button></div></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b border-slate-700 text-left text-xs text-slate-400"><tr><th className="px-3 py-3">Employee</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Check-in</th><th className="px-3 py-3">Check-out</th><th className="px-3 py-3">Cameras</th><th className="px-3 py-3">Confidence</th><th className="px-3 py-3">Duration</th><th className="px-3 py-3">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-800">
              {loading && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Loading attendance…</td></tr>}
              {!loading && attendance.map((record) => <tr key={record.attendance_id}><td className="px-3 py-3"><div className="font-medium text-slate-200">{record.employee_name}</div><div className="text-xs text-slate-500">{record.employee_id}</div></td><td className="px-3 py-3">{record.date}</td><td className="px-3 py-3">{formatTime(record.check_in_time)}</td><td className="px-3 py-3">{formatTime(record.check_out_time)}</td><td className="px-3 py-3 text-xs text-slate-400">{record.check_in_camera_name || '—'} / {record.check_out_camera_name || '—'}</td><td className="px-3 py-3">{record.recognition_confidence === undefined ? '—' : `${(record.recognition_confidence * 100).toFixed(1)}%`}</td><td className="px-3 py-3">{formatDuration(record.working_duration_seconds)}</td><td className="px-3 py-3"><span className={`badge ${record.attendance_status === 'checked_in' ? 'bg-sky-500/15 text-sky-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{record.attendance_status.replace('_', ' ')}</span></td></tr>)}
              {!loading && attendance.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">No face-attendance records for these dates.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card space-y-3">
          <div><h3 className="font-semibold text-slate-100">Recent recognition events</h3><p className="text-xs text-slate-400">Employee matches and camera activity</p></div>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {events.map((event) => <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 p-3"><div><div className="text-sm font-medium text-slate-200">{event.employee_name || event.event_type.replace(/_/g, ' ')}</div><div className="text-xs text-slate-500">{event.camera_name || 'Camera'} · {event.message || event.camera_purpose}</div></div><div className="shrink-0 text-right text-xs text-slate-400">{formatTime(event.created_at)}{event.confidence !== undefined && <div>{(event.confidence * 100).toFixed(1)}%</div>}</div></div>)}
            {events.length === 0 && <p className="text-sm text-slate-500">No recent events.</p>}
          </div>
        </section>
        <section className="card space-y-3">
          <div><h3 className="font-semibold text-slate-100">Unknown detections</h3><p className="text-xs text-slate-400">Unknown people are logged, never auto-registered.</p></div>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {unknowns.map((event) => <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/15 bg-amber-500/5 p-3"><div><div className="text-sm font-medium text-amber-200">Unknown person</div><div className="text-xs text-slate-400">{event.camera_name || 'Camera'} · {event.camera_purpose}</div><button type="button" className="mt-2 text-xs text-sky-300 hover:text-sky-200" onClick={() => void viewSnapshot(event.id)}>View protected snapshot</button></div><div className="shrink-0 text-right text-xs text-slate-400">{formatTime(event.created_at)}{event.confidence !== undefined && <div>Best match {(event.confidence * 100).toFixed(1)}%</div>}</div></div>)}
            {unknowns.length === 0 && <p className="text-sm text-slate-500">No unknown detections logged.</p>}
          </div>
        </section>
      </div>
      {snapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setSnapshot(null)}>
          <div className="card w-full max-w-2xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="mb-3 font-semibold text-slate-100">Unknown detection snapshot #{snapshot.id}</h3>
            <img src={snapshot.url} alt="Protected unknown-person detection" className="max-h-[70vh] w-full rounded-xl object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
