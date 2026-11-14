import { useEffect, useRef, useState } from 'react';
import { Play, Search, AlertCircle, Video, Clock } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { Camera as CameraType, NvrDevice, RecordingPlayback, RecordingSegment } from '../../types';
import HlsPlayer from '../../components/HlsPlayer';

interface ActivePlayback extends RecordingPlayback {
  cameraId: string;
}

export default function Playback() {
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [nvrs, setNvrs] = useState<NvrDevice[]>([]);
  const [selectedNvrId, setSelectedNvrId] = useState('');
  const [cameraId, setCameraId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [segments, setSegments] = useState<RecordingSegment[]>([]);
  const [capability, setCapability] = useState<{ supported: boolean; reason?: string } | null>(null);
  const [playing, setPlaying] = useState<ActivePlayback | null>(null);
  const [loading, setLoading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const [unsupported, setUnsupported] = useState('');
  const playbackRequest = useRef(0);
  const searchRequest = useRef(0);
  const playingRef = useRef<ActivePlayback | null>(null);

  const stopPlaybackSession = async (session: ActivePlayback) => {
    await api.delete(`/playback/cameras/${session.cameraId}/playback/${encodeURIComponent(session.sessionId)}`);
  };

  useEffect(() => {
    (async () => {
      try {
        const [camRes, nvrRes] = await Promise.all([api.get('/cameras'), api.get('/nvrs')]);
        const nvrCams = camRes.data.cameras.filter((c: CameraType) => c.nvr && c.isEnabled);
        setCameras(nvrCams);
        setNvrs(nvrRes.data.nvrs);
      } catch (err) { setError(getErrorMessage(err)); }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCapability(null);
    setUnsupported('');
    if (!cameraId) return () => { cancelled = true; };
    (async () => {
      try {
        const res = await api.get(`/playback/cameras/${cameraId}/capability`);
        if (cancelled) return;
        setCapability(res.data);
        setUnsupported(res.data.supported ? '' : (res.data.reason ?? 'Playback is not supported for this camera'));
      } catch (err) {
        if (!cancelled) setUnsupported(getErrorMessage(err));
      }
    })();
    return () => { cancelled = true; };
  }, [cameraId]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => () => {
    const active = playingRef.current;
    if (active) {
      void stopPlaybackSession(active).catch(err => {
        console.error('[Playback cleanup error]', getErrorMessage(err));
      });
    }
  }, []);

  const search = async () => {
    if (!cameraId) return;
    const requestId = ++searchRequest.current;
    setError('');
    setSegments([]);
    setLoading(true);
    try {
      const startDate = new Date(`${date}T${startTime}:00`);
      const endDate = new Date(`${date}T${endTime}:00`);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
        throw new Error('Choose a valid time range with the end later than the start.');
      }
      const res = await api.get(`/playback/cameras/${cameraId}/recordings`, {
        params: { start: startDate.toISOString(), end: endDate.toISOString() },
      });
      if (requestId !== searchRequest.current) return;
      setSegments(res.data.segments);
      if (res.data.segments.length === 0) setError('No recordings found for the selected period.');
    } catch (err) {
      if (requestId === searchRequest.current) setError(getErrorMessage(err));
    } finally {
      if (requestId === searchRequest.current) setLoading(false);
    }
  };

  const play = async (seg: RecordingSegment) => {
    const requestId = ++playbackRequest.current;
    const selectedCameraId = cameraId;
    setError('');
    try {
      if (playing) {
        await stopPlaybackSession(playing);
        setPlaying(null);
      }
      const res = await api.post(`/playback/cameras/${selectedCameraId}/playback`, {
        start: seg.startTime, end: seg.endTime,
      });
      const session = { ...res.data.playback, cameraId: selectedCameraId } as ActivePlayback;
      if (requestId !== playbackRequest.current || selectedCameraId !== cameraId) {
        await stopPlaybackSession(session);
        return;
      }
      setPlaying(session);
    } catch (err) { setError(getErrorMessage(err)); }
  };

  const stop = async () => {
    if (!playing) return;
    setStopping(true);
    setError('');
    try {
      await stopPlaybackSession(playing);
      setPlaying(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setStopping(false);
    }
  };

  const clearPlayback = () => {
    playbackRequest.current += 1;
    searchRequest.current += 1;
    if (playing) {
      void stopPlaybackSession(playing).catch(err => setError(getErrorMessage(err)));
    }
    setPlaying(null);
    setSegments([]);
  };

  const cameraNvrId = (camera: CameraType) => typeof camera.nvr === 'string' ? camera.nvr : camera.nvr?._id ?? '';
  const filteredCameras = selectedNvrId ? cameras.filter(camera => cameraNvrId(camera) === selectedNvrId) : cameras;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Playback</h2>
        <p className="text-sm text-slate-500">Search and play recorded footage from NVR cameras</p>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label">NVR</label>
            <select
              className="input"
              value={selectedNvrId}
              onChange={event => {
                const nvrId = event.target.value;
                clearPlayback();
                setSelectedNvrId(nvrId);
                setCameraId('');
                setCapability(null);
                setUnsupported('');
              }}
            >
              <option value="">All NVRs</option>
              {nvrs.map(nvr => <option key={nvr._id} value={nvr._id}>{nvr.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Camera</label>
            <select className="input" value={cameraId} onChange={e => {
              clearPlayback();
              setCameraId(e.target.value);
            }}>
              <option value="">Select camera…</option>
              {filteredCameras.map(c => (
                <option key={c._id} value={c._id}>
                  {c.name} — {typeof c.nvr === 'object' ? c.nvr?.name : nvrs.find(nvr => nvr._id === cameraNvrId(c))?.name ?? ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">From</label>
              <input type="time" className="input" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="time" className="input" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="mt-4">
          <button onClick={search} disabled={!cameraId || loading} className="btn-primary">
            {loading ? 'Searching…' : <><Search size={16} /> Search Recordings</>}
          </button>
        </div>
      </div>

      {unsupported && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
          <AlertCircle size={16} /> {unsupported}
        </div>
      )}
      {capability?.supported && (
        <div className="text-sm text-emerald-700">Recording playback is available for this camera.</div>
      )}
      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}

      {/* Player */}
      {playing && (
        <div className="card overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div className="font-semibold text-slate-900">Now Playing</div>
            <button onClick={() => { void stop(); }} disabled={stopping} className="text-sm text-slate-600 hover:text-slate-900 disabled:opacity-50">
              {stopping ? 'Stopping…' : 'Stop playback'}
            </button>
          </div>
          <div className="aspect-video bg-slate-900">
            {playing.hlsUrl ? (
              <HlsPlayer className="h-full w-full" mode="recording" src={playing.hlsUrl} />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">The recording stream was not provided by the NVR.</div>
            )}
          </div>
        </div>
      )}

      {/* Segments */}
      {segments.length > 0 && (
        <div className="card">
          <h3 className="mb-3 font-semibold text-slate-900">Available Recordings ({segments.length})</h3>
          <div className="space-y-2">
            {segments.map((seg, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3">
                <div className="flex items-center gap-3">
                  <Clock size={16} className="text-slate-400" />
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      {new Date(seg.startTime).toLocaleTimeString()} — {new Date(seg.endTime).toLocaleTimeString()}
                    </div>
                    <div className="text-xs text-slate-500">{new Date(seg.startTime).toLocaleDateString()}</div>
                  </div>
                </div>
                <button onClick={() => play(seg)} className="btn-primary px-3 py-1.5 text-xs">
                  <Play size={14} /> Play
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {cameras.length === 0 && (
        <div className="card text-center text-slate-500">
          <Video className="mx-auto mb-2 text-slate-300" size={40} />
          <p>No NVR-linked cameras found. Add an NVR and discover cameras first.</p>
        </div>
      )}
    </div>
  );
}
