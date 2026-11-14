import { useEffect, useState, useCallback, useRef } from 'react';
import { Camera, Wifi, WifiOff, Maximize2, RefreshCw, X, LayoutGrid } from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { Camera as CameraType, StreamAccess } from '../../types';
import HlsPlayer from '../../components/HlsPlayer';

type GridSize = 1 | 2 | 3 | 4;

interface CellState {
  camera: CameraType;
  stream?: StreamAccess;
  loading: boolean;
  error?: string;
}

export default function LiveWall() {
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cells, setCells] = useState<CellState[]>([]);
  const [gridSize, setGridSize] = useState<GridSize>(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [fullscreen, setFullscreen] = useState<string | null>(null);
  const refreshing = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/cameras', { params: { includeDisabled: 'false' } });
        const enabled = res.data.cameras
          .filter((c: CameraType) => c.isEnabled)
          .sort((a: CameraType, b: CameraType) =>
            Number(b.connectionType === 'http_rtsp' && Boolean(b.nvr) && !b.isSimulated) -
            Number(a.connectionType === 'http_rtsp' && Boolean(a.nvr) && !a.isSimulated)
          );
        if (cancelled) return;
        setCameras(enabled);
        // Auto-select first N cameras up to grid capacity
        const initial = enabled.slice(0, gridSize * gridSize).map((c: CameraType) => c._id);
        setSelected(new Set(initial));
      } catch (err) {
        if (!cancelled) setLoadError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadStream = useCallback(async (camera: CameraType): Promise<CellState> => {
    try {
      const res = await api.get(`/cameras/${camera._id}/stream-access`);
      return { camera, stream: res.data.stream, loading: false };
    } catch (err) {
      return { camera, loading: false, error: getErrorMessage(err) };
    }
  }, []);

  const refreshCell = useCallback(async (cameraId: string) => {
    const camera = cameras.find(candidate => candidate._id === cameraId);
    if (!camera || refreshing.current.has(cameraId)) return;
    refreshing.current.add(cameraId);
    setCells(prev => prev.map(cell => cell.camera._id === cameraId
      ? { ...cell, loading: !cell.stream, error: undefined }
      : cell));
    try {
      const cell = await loadStream(camera);
      setCells(prev => prev.map(current => current.camera._id === cameraId ? cell : current));
    } finally {
      refreshing.current.delete(cameraId);
    }
  }, [cameras, loadStream]);

  useEffect(() => {
    let cancelled = false;
    const selectedCams = cameras.filter(c => selected.has(c._id));
    setCells(selectedCams.map(c => ({ camera: c, loading: true })));
    selectedCams.forEach(camera => {
      void loadStream(camera).then(cell => {
        if (!cancelled) {
          setCells(prev => prev.map(current => current.camera._id === camera._id ? cell : current));
        }
      });
    });
    return () => { cancelled = true; };
  }, [selected, cameras, loadStream]);

  useEffect(() => {
    const timers = cells.flatMap(cell => {
      if (!cell.stream || cell.stream.isSimulated || !Number.isFinite(cell.stream.expiresAt)) return [];
      const delay = Math.max(1000, cell.stream.expiresAt - Date.now() - 30000);
      return [window.setTimeout(() => { void refreshCell(cell.camera._id); }, delay)];
    });
    return () => timers.forEach(window.clearTimeout);
  }, [cells, refreshCell]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [fullscreen]);

  const updateGridSize = (size: GridSize) => {
    setGridSize(size);
    setSelected(current => new Set([...current].slice(0, size * size)));
    setFullscreen(null);
  };

  const toggleCamera = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    if (next.size > gridSize * gridSize) return;
    setSelected(next);
    if (!next.has(fullscreen ?? '')) setFullscreen(null);
  };

  const selectNvrCameras = () => {
    const nvrCameras = cameras.filter(camera => camera.nvr && !camera.isSimulated);
    setSelected(new Set(nvrCameras.slice(0, gridSize * gridSize).map(camera => camera._id)));
    setFullscreen(null);
  };

  const gridClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  }[gridSize];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Live Wall</h2>
          <p className="text-sm text-slate-500">{selected.size} camera(s) • {gridSize}x{gridSize} grid</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            {[1, 2, 3, 4].map(n => (
              <button key={n} onClick={() => updateGridSize(n as GridSize)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${gridSize === n ? 'bg-brand-primary text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {n}x{n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Camera selector */}
      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><LayoutGrid size={16} /> Select cameras</div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500">{selected.size}/{gridSize * gridSize} selected</span>
            <button onClick={selectNvrCameras} className="text-brand-primary hover:underline">Select NVR cameras</button>
            <button onClick={() => { setSelected(new Set()); setFullscreen(null); }} className="text-slate-500 hover:underline">Clear</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {cameras.map(cam => (
            <button
              key={cam._id}
              onClick={() => toggleCamera(cam._id)}
              disabled={!selected.has(cam._id) && selected.size >= gridSize * gridSize}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${selected.has(cam._id) ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {cam.name}
            </button>
          ))}
          {cameras.length === 0 && <p className="text-sm text-slate-400">No enabled cameras available.</p>}
        </div>
      </div>

      {/* Grid */}
      {loadError && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{loadError}</div>}
      {loading ? <p className="text-slate-400">Loading…</p> : cells.length === 0 ? (
        <div className="card text-center text-slate-500">
          <Camera className="mx-auto mb-2 text-slate-300" size={40} />
          <p>Select cameras above to view live streams.</p>
        </div>
      ) : (
        <div className={`grid gap-3 ${gridClass}`}>
          {cells.map(cell => (
            <div
              key={cell.camera._id}
              className={fullscreen === cell.camera._id
                ? 'fixed inset-4 z-[60] flex flex-col overflow-hidden rounded-xl bg-white shadow-2xl'
                : 'card overflow-hidden p-0'}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{cell.camera.name}</div>
                  <div className="truncate text-xs text-slate-500">{typeof cell.camera.nvr === 'object' ? cell.camera.nvr?.name : cell.camera.location}</div>
                </div>
                <div className="flex items-center gap-1">
                  {cell.loading
                    ? <RefreshCw size={14} className="animate-spin text-slate-400" />
                    : cell.error
                      ? <WifiOff size={14} className="text-rose-500" />
                      : <Wifi size={14} className="text-emerald-500" />}
                  <button onClick={() => refreshCell(cell.camera._id)} className="rounded p-1 text-slate-400 hover:bg-slate-100" title="Reconnect"><RefreshCw size={13} /></button>
                  <button
                    onClick={() => setFullscreen(current => current === cell.camera._id ? null : cell.camera._id)}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100"
                    title={fullscreen === cell.camera._id ? 'Exit fullscreen' : 'Fullscreen'}
                  >
                    {fullscreen === cell.camera._id ? <X size={15} /> : <Maximize2 size={13} />}
                  </button>
                </div>
              </div>
              <div className={`relative bg-slate-900 ${fullscreen === cell.camera._id ? 'min-h-0 flex-1' : 'aspect-video'}`}>
                {cell.loading && <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">Connecting…</div>}
                {cell.error && !cell.loading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-rose-400">
                    <WifiOff size={28} className="mb-1" />
                    <p className="px-2 text-center text-xs">{cell.error}</p>
                  </div>
                )}
                {cell.stream && !cell.loading && !cell.error && (
                  cell.stream.isSimulated ? (
                    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-slate-400">
                      <Camera size={32} className="mb-2 opacity-50" />
                      <p className="text-xs">Simulated stream</p>
                    </div>
                  ) : (
                    <HlsPlayer className="h-full w-full" src={cell.stream.hlsUrl} />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {fullscreen && <div className="fixed inset-0 z-50 bg-black/80" onClick={() => setFullscreen(null)} />}
    </div>
  );
}
