import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, ArrowRight, Baby, CalendarCheck, Camera, CircleAlert, GraduationCap,
  Radio, RefreshCw, School, ShieldCheck, Users, Wifi, WifiOff,
} from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { Camera as CameraType, StreamAccess } from '../../types';
import HlsPlayer from '../../components/HlsPlayer';

interface Stats {
  totalChildren: number;
  totalParents: number;
  totalTeachers: number;
  totalClassrooms: number;
  totalCameras: number;
  onlineCameras: number;
  offlineCameras: number;
  todayAttendance: number;
  pendingApprovals: number;
  pendingPickups: number;
  openIncidents: number;
}

interface Incident {
  _id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  status: string;
  createdAt: string;
  child?: { fullName: string } | string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState('');
  const [incidentError, setIncidentError] = useState('');
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [stream, setStream] = useState<StreamAccess | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [statsResult, camerasResult, incidentsResult] = await Promise.allSettled([
        api.get('/admin/stats'),
        api.get('/cameras', { params: { includeDisabled: 'false' } }),
        api.get('/incidents'),
      ]);
      if (cancelled) return;

      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value.data.stats);
      } else {
        setStatsError(getErrorMessage(statsResult.reason));
      }

      if (camerasResult.status === 'fulfilled') {
        const available = camerasResult.value.data.cameras
          .filter((camera: CameraType) => camera.isEnabled && !camera.isSimulated)
          .sort((a: CameraType, b: CameraType) =>
            cameraPriority(b) - cameraPriority(a)
          );
        setCameras(available);
        setSelectedCameraId(available[0]?._id ?? '');
      } else {
        setStreamError(getErrorMessage(camerasResult.reason));
      }

      function cameraPriority(camera: CameraType): number {
        if (camera.nvr && camera.connectionType === 'http_rtsp' && !camera.isSimulated) return 3;
        if (camera.nvr) return 2;
        return 1;
      }

      if (incidentsResult.status === 'fulfilled') {
        setIncidents(incidentsResult.value.data.incidents.slice(0, 5));
      } else {
        setIncidentError(getErrorMessage(incidentsResult.reason));
      }
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const loadStream = useCallback(async (cameraId: string) => {
    if (!cameraId) {
      setStream(null);
      setStreamError('');
      return;
    }
    setStreamLoading(true);
    setStreamError('');
    setStream(null);
    try {
      const response = await api.get(`/cameras/${cameraId}/stream-access`);
      setStream(response.data.stream);
    } catch (error) {
      setStreamError(getErrorMessage(error));
    } finally {
      setStreamLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStream(selectedCameraId);
  }, [selectedCameraId, loadStream]);

  const percentage = stats?.totalCameras
    ? Math.round((stats.onlineCameras / stats.totalCameras) * 100)
    : 0;
  const metricCards = stats ? [
    { label: 'Cameras online', value: `${stats.onlineCameras}/${stats.totalCameras}`, note: `${percentage}% connected`, icon: Camera, color: 'blue' },
    { label: 'Attendance today', value: stats.todayAttendance, note: 'children checked in', icon: CalendarCheck, color: 'cyan' },
    { label: 'Open incidents', value: stats.openIncidents, note: 'need attention', icon: CircleAlert, color: 'rose' },
    { label: 'Children', value: stats.totalChildren, note: 'active enrollment', icon: Baby, color: 'violet' },
    { label: 'Parents', value: stats.totalParents, note: 'registered families', icon: Users, color: 'amber' },
    { label: 'Classrooms', value: stats.totalClassrooms, note: `${stats.totalTeachers} teachers`, icon: School, color: 'emerald' },
  ] : [];
  const colorClasses: Record<string, string> = {
    blue: 'text-blue-300 bg-blue-500/10 ring-blue-400/20',
    cyan: 'text-cyan-300 bg-cyan-500/10 ring-cyan-400/20',
    rose: 'text-rose-300 bg-rose-500/10 ring-rose-400/20',
    violet: 'text-violet-300 bg-violet-500/10 ring-violet-400/20',
    amber: 'text-amber-300 bg-amber-500/10 ring-amber-400/20',
    emerald: 'text-emerald-300 bg-emerald-500/10 ring-emerald-400/20',
  };
  const severityColor: Record<Incident['severity'], string> = {
    low: 'text-slate-300 bg-slate-700/60',
    medium: 'text-amber-300 bg-amber-500/10',
    high: 'text-orange-300 bg-orange-500/10',
    critical: 'text-rose-300 bg-rose-500/10',
  };

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-400"><RefreshCw size={16} className="mr-2 animate-spin" /> Loading command center…</div>;
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Monitoring overview
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">Command Center</h2>
          <p className="mt-1 text-xs text-slate-500">A real-time overview of your classrooms, cameras, and activity.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/nvrs" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800">
            <Radio size={14} /> Manage NVRs
          </Link>
          <Link to="/admin/live-wall" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500">
            <Camera size={14} /> Open Live Wall <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {statsError && <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">Dashboard metrics could not be loaded: {statsError}</div>}

      {stats && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {metricCards.map(metric => (
            <article key={metric.label} className="rounded-xl border border-slate-800 bg-[#0d121b] p-4 shadow-lg shadow-black/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-400">{metric.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">{metric.value}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{metric.note}</p>
                </div>
                <div className={`rounded-lg p-2.5 ring-1 ${colorClasses[metric.color]}`}><metric.icon size={17} /></div>
              </div>
              {metric.label === 'Cameras online' && (
                <div className="mt-4">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all" style={{ width: `${percentage}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-slate-500">
                    <span><Wifi size={11} className="mr-1 inline text-emerald-400" />{stats.onlineCameras} online</span>
                    <span><WifiOff size={11} className="mr-1 inline text-rose-400" />{stats.offlineCameras} offline</span>
                  </div>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.9fr)]">
        <article className="overflow-hidden rounded-xl border border-slate-800 bg-[#0d121b]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-50" /><span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" /></span>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Live camera</h3>
                <p className="text-[10px] text-slate-500">Preview from your connected NVRs</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label="Select live preview camera"
                className="max-w-[200px] rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-300 outline-none focus:border-blue-500/60"
                value={selectedCameraId}
                onChange={event => setSelectedCameraId(event.target.value)}
              >
                {cameras.length === 0 && <option value="">No cameras available</option>}
                {cameras.map(camera => <option key={camera._id} value={camera._id}>{camera.name}</option>)}
              </select>
              <Link to="/admin/live-wall" className="hidden items-center gap-1 text-xs font-medium text-blue-300 hover:text-blue-200 sm:inline-flex">
                Full view <ArrowRight size={13} />
              </Link>
            </div>
          </div>
          <div className="relative aspect-video bg-[#07090e]">
            {stream && !stream.isSimulated && <HlsPlayer className="h-full w-full" src={stream.hlsUrl} />}
            {(streamLoading || streamError || !stream) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#07090e] px-5 text-center">
                {streamLoading ? <RefreshCw size={22} className="animate-spin text-blue-300" /> : streamError ? <WifiOff size={24} className="text-rose-400" /> : <Camera size={25} className="text-slate-600" />}
                <p className={`text-xs ${streamError ? 'text-rose-300' : 'text-slate-500'}`}>
                  {streamLoading ? 'Connecting to the selected camera…' : streamError || (cameras.length ? 'Select an NVR camera to preview.' : 'Add and enable an NVR camera to see a live preview.')}
                </p>
                {streamError && selectedCameraId && (
                  <button onClick={() => { void loadStream(selectedCameraId); }} className="mt-1 inline-flex items-center gap-1.5 text-xs text-blue-300 hover:text-blue-200">
                    <RefreshCw size={12} /> Retry connection
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-2.5 text-[11px]">
            <div className="flex min-w-0 items-center gap-2 text-slate-300">
              <Camera size={13} className="shrink-0 text-slate-500" />
              <span className="truncate">{cameras.find(camera => camera._id === selectedCameraId)?.name ?? 'No selected camera'}</span>
            </div>
            {stream && <span className="inline-flex items-center gap-1.5 text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live</span>}
          </div>
        </article>

        <article className="flex min-h-[320px] flex-col rounded-xl border border-slate-800 bg-[#0d121b]">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-rose-300" />
              <h3 className="text-sm font-semibold text-slate-100">Latest incidents</h3>
            </div>
            {stats && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">{stats.openIncidents} open</span>}
          </div>
          <div className="flex-1 divide-y divide-slate-800/80">
            {incidentError && <p className="p-4 text-xs text-rose-300">Incident list unavailable: {incidentError}</p>}
            {!incidentError && incidents.length === 0 && (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-6 text-center">
                <ShieldCheck size={26} className="mb-2 text-emerald-400" />
                <p className="text-sm font-medium text-slate-300">No incidents reported</p>
                <p className="mt-1 text-xs text-slate-500">New reports will appear here.</p>
              </div>
            )}
            {incidents.map(incident => (
              <div key={incident._id} className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-200">{incident.type.replace(/[_-]/g, ' ')}</p>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-[9px] font-bold uppercase ${severityColor[incident.severity]}`}>{incident.severity}</span>
                </div>
                <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-400">{incident.description}</p>
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>{typeof incident.child === 'object' ? incident.child?.fullName : incident.status}</span>
                  <span>{new Date(incident.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
          <Link to="/admin/notifications" className="flex items-center justify-between border-t border-slate-800 px-4 py-3 text-xs font-medium text-blue-300 transition hover:bg-slate-800/40">
            Review notifications <ArrowRight size={14} />
          </Link>
        </article>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Link to="/admin/nvrs" className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-[#0d121b] p-4 transition hover:border-slate-700 hover:bg-[#111824]">
          <div className="rounded-lg bg-blue-500/10 p-2.5 text-blue-300"><Radio size={17} /></div>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-200">NVR devices</p><p className="mt-1 text-[10px] text-slate-500">Manage recorders and channels</p></div>
          <ArrowRight size={14} className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
        </Link>
        <Link to="/admin/access-requests" className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-[#0d121b] p-4 transition hover:border-slate-700 hover:bg-[#111824]">
          <div className="rounded-lg bg-violet-500/10 p-2.5 text-violet-300"><Users size={17} /></div>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-200">Family access</p><p className="mt-1 text-[10px] text-slate-500">{stats?.pendingApprovals ?? 0} requests to review</p></div>
          <ArrowRight size={14} className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
        </Link>
        <Link to="/admin/attendance" className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-[#0d121b] p-4 transition hover:border-slate-700 hover:bg-[#111824]">
          <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-300"><GraduationCap size={17} /></div>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-200">School operations</p><p className="mt-1 text-[10px] text-slate-500">Attendance, classes, and activity</p></div>
          <ArrowRight size={14} className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
        </Link>
      </section>
    </div>
  );
}
