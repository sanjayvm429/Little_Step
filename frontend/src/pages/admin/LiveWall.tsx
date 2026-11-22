import { useEffect, useState, useCallback, useRef } from 'react';
import { Camera, Wifi, WifiOff, Maximize2, RefreshCw, X, LayoutGrid, Search, Radio } from 'lucide-react';
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

function cameraNvrId(camera: CameraType): string {
  return typeof camera.nvr === 'string' ? camera.nvr : camera.nvr?._id ?? '';
}

function cameraNvrName(camera: CameraType): string {
  return typeof camera.nvr === 'object' ? camera.nvr?.name ?? '' : '';
}

export default function LiveWall() {
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cells, setCells] = useState<CellState[]>([]);
  const [gridSize, setGridSize] = useState<GridSize>(1);
  const [cameraSearch, setCameraSearch] = useState('');
  const [selectedNvrId, setSelectedNvrId] = useState('');
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
    const nvrCameras = cameras.filter(camera => camera.nvr && !camera.isSimulated &&
      (!selectedNvrId || cameraNvrId(camera) === selectedNvrId));
    setSelected(new Set(nvrCameras.slice(0, gridSize * gridSize).map(camera => camera._id)));
    setFullscreen(null);
  };

  const nvrOptions = [...new Map(cameras
    .filter(camera => camera.nvr)
    .map(camera => [cameraNvrId(camera), cameraNvrName(camera)])).entries()];
  const visibleCameras = cameras.filter(camera =>
    (!selectedNvrId || cameraNvrId(camera) === selectedNvrId) &&
    camera.name.toLowerCase().includes(cameraSearch.trim().toLowerCase())
  );
  const gridClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  }[gridSize];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Video surveillance</div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">Live Video Wall</h2>
          <p className="mt-1 text-xs text-slate-500">{selected.size} of {cameras.length} cameras selected · {gridSize} × {gridSize} layout</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#0d121b] p-1">
            {[1, 2, 3, 4].map(n => (
              <button key={n} onClick={() => updateGridSize(n as GridSize)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${gridSize === n ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}>
                {n}×{n}
              </button>
            ))}
        </div>
      </div>

      <section className="space-y-2 rounded-xl border border-slate-800 bg-[#0d121b] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[180px] flex-1 sm:max-w-[245px]">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              aria-label="Search cameras"
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 py-2 pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-blue-500/60"
              placeholder="Search cameras…"
              value={cameraSearch}
              onChange={event => setCameraSearch(event.target.value)}
            />
          </label>
          <label className="relative min-w-[175px] flex-1 sm:max-w-[230px]">
            <Radio size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select
              aria-label="Filter by NVR"
              className="w-full appearance-none rounded-lg border border-slate-800 bg-slate-950/70 py-2 pl-9 pr-8 text-xs text-slate-300 outline-none focus:border-blue-500/60"
              value={selectedNvrId}
              onChange={event => setSelectedNvrId(event.target.value)}
            >
              <option value="">All NVRs</option>
              {nvrOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <div className="ml-auto flex items-center gap-3 text-[11px]">
            <span className="text-slate-500">{selected.size}/{gridSize * gridSize} slots</span>
            <button onClick={selectNvrCameras} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-medium text-slate-300 transition hover:border-blue-500/50 hover:text-blue-200">
              Select NVR cameras
            </button>
            <button onClick={() => { setSelected(new Set()); setFullscreen(null); }} className="px-1 text-slate-500 hover:text-slate-200">Clear</button>
          </div>
        </div>
        <div className="flex max-h-[92px] flex-wrap gap-1.5 overflow-y-auto pt-1">
          {visibleCameras.map(cam => (
            <button
              key={cam._id}
              onClick={() => toggleCamera(cam._id)}
              disabled={!selected.has(cam._id) && selected.size >= gridSize * gridSize}
              className={`rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${selected.has(cam._id) ? 'border-blue-500/50 bg-blue-500/10 text-blue-200' : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'}`}
            >
              {cam.name}
            </button>
          ))}
          {visibleCameras.length === 0 && <p className="px-1 py-2 text-xs text-slate-500">{cameras.length ? 'No cameras match these filters.' : 'No enabled cameras available.'}</p>}
        </div>
      </section>

      {loadError && <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{loadError}</div>}
      {loading ? <p className="py-12 text-center text-sm text-slate-400">Loading cameras…</p> : cells.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 bg-[#0d121b] py-16 text-center text-slate-500">
          <Camera className="mx-auto mb-3 text-slate-600" size={34} />
          <p>Select cameras above to view live streams.</p>
        </div>
      ) : (
        <div className={`grid gap-2 ${gridClass}`}>
          {cells.map(cell => (
            <div
              key={cell.camera._id}
              className={fullscreen === cell.camera._id
                ? 'fixed inset-3 z-[60] flex flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#0b0f16] shadow-2xl sm:inset-5'
                : 'overflow-hidden rounded-lg border border-slate-800 bg-[#0d121b]'}
            >
              <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-slate-200">{cell.camera.name}</div>
                  <div className="truncate text-[10px] text-slate-500">{cameraNvrName(cell.camera) || cell.camera.location}</div>
                </div>
                <div className="flex items-center gap-1">
                  {cell.loading
                    ? <RefreshCw size={13} className="animate-spin text-slate-400" />
                    : cell.error
                      ? <span className="mr-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase text-rose-400"><WifiOff size={12} /> Offline</span>
                      : <span className="mr-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase text-emerald-400"><Wifi size={12} /> Live</span>}
                  <button onClick={() => refreshCell(cell.camera._id)} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200" title="Reconnect"><RefreshCw size={13} /></button>
                  <button
                    onClick={() => setFullscreen(current => current === cell.camera._id ? null : cell.camera._id)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                    title={fullscreen === cell.camera._id ? 'Exit fullscreen' : 'Fullscreen'}
                  >
                    {fullscreen === cell.camera._id ? <X size={15} /> : <Maximize2 size={13} />}
                  </button>
                </div>
              </div>
              <div className={`relative bg-[#07090e] ${fullscreen === cell.camera._id ? 'min-h-0 flex-1' : 'aspect-video'}`}>
                {cell.loading && <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-slate-400"><RefreshCw size={14} className="animate-spin" /> Connecting…</div>}
                {cell.error && !cell.loading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#080b11] text-rose-300">
                    <WifiOff size={22} className="mb-2" />
                    <p className="px-2 text-center text-xs">{cell.error}</p>
                  </div>
                )}
                {cell.stream && !cell.loading && !cell.error && (
                  cell.stream.isSimulated ? (
                    <div className="flex h-full flex-col items-center justify-center bg-[#080b11] text-slate-500">
                      <Camera size={24} className="mb-2 opacity-50" />
                      <p className="text-[11px]">Simulated camera</p>
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
