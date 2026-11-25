import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Wifi, WifiOff, Maximize2, AlertCircle } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { Camera as CameraType, StreamAccess } from '../../types';
import HlsPlayer from '../../components/HlsPlayer';

export default function ParentLiveMonitoring() {
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [selected, setSelected] = useState<CameraType | null>(null);
  const [stream, setStream] = useState<StreamAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [streamLoading, setStreamLoading] = useState(false);
  const [error, setError] = useState('');
  const initialStreamRequested = useRef(false);
  const retryAttempts = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/cameras');
        setCameras(res.data.cameras);
        if (res.data.cameras.length > 0) setSelected(res.data.cameras[0]);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const openStream = useCallback(async (camera: CameraType) => {
    setSelected(camera);
    setStream(null);
    setError('');
    setStreamLoading(true);
    try {
      const res = await api.get(`/cameras/${camera._id}/stream-access`);
      setStream(res.data.stream);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setStreamLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !selected || initialStreamRequested.current) return;
    initialStreamRequested.current = true;
    void openStream(selected);
  }, [loading, openStream, selected]);

  useEffect(() => {
    if (!error || !selected || streamLoading) return;
    retryAttempts.current += 1;
    const delay = Math.min(1000 * (2 ** (retryAttempts.current - 1)), 30000);
    const timer = window.setTimeout(() => void openStream(selected), delay);
    return () => window.clearTimeout(timer);
  }, [error, openStream, selected, streamLoading]);

  useEffect(() => {
    if (!selected || !stream || stream.isSimulated) return;
    const remaining = stream.expiresAt - Date.now();
    const refreshMargin = Math.min(30000, Math.max(1000, Math.floor(remaining * 0.1)));
    const timer = window.setTimeout(
      () => void openStream(selected),
      Math.max(1000, remaining - refreshMargin),
    );
    return () => window.clearTimeout(timer);
  }, [openStream, selected, stream]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Live Monitoring</h2>
        <p className="text-sm text-slate-500">Authorized classroom cameras only. Streams are permission-controlled.</p>
      </div>

      {loading ? <p className="text-slate-400">Loading cameras…</p> : cameras.length === 0 ? (
        <div className="card text-center text-slate-500">
          <Camera className="mx-auto mb-2 text-slate-300" size={40} />
          <p>No cameras available. Access is granted by the nursery administrator.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Camera list */}
          <div className="space-y-3">
            {cameras.map((cam) => (
              <button
                key={cam._id}
                onClick={() => {
                  retryAttempts.current = 0;
                  void openStream(cam);
                }}
                className={`card w-full text-left transition ${selected?._id === cam._id ? 'ring-2 ring-brand-primary' : 'hover:shadow-md'}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{cam.name}</div>
                    <div className="text-xs text-slate-500">{typeof cam.classroom === 'object' ? cam.classroom?.name : cam.location}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {cam.status === 'online' ? <Wifi size={16} className="text-emerald-500" /> : <WifiOff size={16} className="text-slate-400" />}
                    <span className={`badge ${cam.status === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{cam.status}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Player */}
          <div className="lg:col-span-2">
            <div className="card overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                <div>
                  <div className="font-semibold text-slate-900">{selected?.name ?? 'Select a camera'}</div>
                  <div className="text-xs text-slate-500">{selected?.location}</div>
                </div>
                {stream && (
                  <a href={stream.hlsUrl} target="_blank" rel="noreferrer" className="btn-secondary text-xs">
                    <Maximize2 size={14} /> Open HLS
                  </a>
                )}
              </div>
              <div className="relative aspect-video bg-slate-900">
                {streamLoading && (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-400">Connecting to stream…</div>
                )}
                {error && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-rose-400">
                    <AlertCircle size={40} className="mb-2" />
                    <p className="text-sm">{error}</p>
                  </div>
                )}
                {stream && !streamLoading && !error && (
                  <>
                    {stream.isSimulated ? (
                      <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-slate-400">
                        <Camera size={48} className="mb-3 opacity-50" />
                        <p className="text-sm">Simulated camera stream</p>
                        <p className="mt-1 text-xs opacity-60">streamKey: {stream.streamKey}</p>
                        <p className="mt-3 text-xs opacity-50">HLS: {stream.hlsUrl}</p>
                      </div>
                    ) : (
                      <HlsPlayer
                        className="h-full w-full object-contain"
                        src={stream.hlsUrl}
                        onPlaybackChange={(playing) => {
                          if (playing) retryAttempts.current = 0;
                        }}
                        onFatalError={() => {
                          setError('The live stream stopped. Reconnecting…');
                        }}
                      />
                    )}
                  </>
                )}
                {!selected && !streamLoading && !error && (
                  <div className="flex h-full items-center justify-center text-slate-500">Select a camera to view</div>
                )}
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Streams are authorized per-camera. Raw camera credentials are never exposed to the browser.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
