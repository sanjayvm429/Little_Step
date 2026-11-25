import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Wifi,
  WifiOff,
  Maximize2,
  RefreshCw,
  X,
  Search,
  Grid,
  ChevronDown,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Bell,
  Sun,
  Moon,
  Camera as CameraIcon,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import api, { getErrorMessage } from '../../services/api';
import { Camera as CameraType, NvrDevice, StreamAccess } from '../../types';
import HlsPlayer from '../../components/HlsPlayer';

type GridSize = 1 | 2 | 3 | 4;

interface CellState {
  camera: CameraType;
  stream?: StreamAccess;
  loading: boolean;
  playing?: boolean;
  reconnecting?: boolean;
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
  const [nvrs, setNvrs] = useState<NvrDevice[]>([]);
  const [gridSize, setGridSize] = useState<GridSize>(3); // 3x3 default (9 cameras)
  const [currentPage, setCurrentPage] = useState(1);
  const [cameraSearch, setCameraSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedNvrId, setSelectedNvrId] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedCameraType, setSelectedCameraType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'live' | 'reconnecting' | 'offline'>('all');

  const [cells, setCells] = useState<Map<string, CellState>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [fullscreen, setFullscreen] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [tourRunning, setTourRunning] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const refreshing = useRef(new Set<string>());
  const retryTimers = useRef(new Map<string, number>());
  const retryAttempts = useRef(new Map<string, number>());
  const tokenRefreshTimers = useRef(new Map<string, { expiresAt: number; timeout: number }>());

  // Real-time Asia/Kolkata clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      setCurrentTime(`${timeStr} (ASIA/KOLKATA)`);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch all enabled cameras and NVRs
  const fetchCamerasAndNvrs = useCallback(async () => {
    try {
      setLoading(true);
      const [camRes, nvrRes] = await Promise.all([
        api.get('/cameras', { params: { includeDisabled: 'false' } }),
        api.get('/nvrs'),
      ]);
      const enabled = (camRes.data.cameras || []).filter((c: CameraType) => c.isEnabled);
      setCameras(enabled);
      setNvrs(nvrRes.data.nvrs || []);
      setLoadError('');
    } catch (err) {
      setLoadError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCamerasAndNvrs();
  }, [fetchCamerasAndNvrs]);

  useEffect(() => () => {
    retryTimers.current.forEach((timer) => window.clearTimeout(timer));
    retryTimers.current.clear();
    tokenRefreshTimers.current.forEach(({ timeout }) => window.clearTimeout(timeout));
    tokenRefreshTimers.current.clear();
  }, []);

  // Extract locations & departments
  const locations = useMemo(() => {
    const set = new Set<string>();
    cameras.forEach(c => {
      if (c.location) set.add(c.location);
    });
    return Array.from(set).sort();
  }, [cameras]);

  // Filtered cameras based on controls
  const filteredCameras = useMemo(() => {
    return cameras.filter(cam => {
      if (selectedNvrId && cameraNvrId(cam) !== selectedNvrId) return false;
      if (selectedLocation && cam.location !== selectedLocation) return false;
      if (cameraSearch) {
        const q = cameraSearch.toLowerCase();
        const matchesName = cam.name.toLowerCase().includes(q);
        const matchesId = (cam.cameraId || '').toLowerCase().includes(q);
        const matchesLoc = (cam.location || '').toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesLoc) return false;
      }
      if (selectedCameraType && selectedCameraType !== 'all') {
        if (selectedCameraType === 'nvr' && !cam.nvr) return false;
        if (selectedCameraType === 'direct' && cam.connectionType !== 'direct_rtsp') return false;
      }
      if (selectedStatus !== 'all') {
        const cell = cells.get(cam._id);
        if (!cell) return true;
        const isOffline = cell?.error && !cell?.loading;
        const isLive = cell?.stream && !cell?.loading && !cell?.error && (cell.playing || cell.stream.isSimulated);
        const isReconn = cell?.reconnecting || cell?.loading || Boolean(cell?.stream && !cell.playing && !cell.stream.isSimulated);
        if (selectedStatus === 'live' && !isLive) return false;
        if (selectedStatus === 'reconnecting' && !isReconn) return false;
        if (selectedStatus === 'offline' && !isOffline) return false;
      }
      return true;
    });
  }, [cameras, selectedNvrId, selectedLocation, cameraSearch, selectedCameraType, selectedStatus, cells]);

  const pageSize = gridSize * gridSize;
  const totalPages = Math.max(1, Math.ceil(filteredCameras.length / pageSize));

  // Ensure current page is valid when filters change
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Current page cameras (9 for 3x3, etc.)
  const pageCameras = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCameras.slice(start, start + pageSize);
  }, [filteredCameras, currentPage, pageSize]);
  const liveCount = pageCameras.reduce((count, camera) => {
    const cell = cells.get(camera._id);
    return count + Number(Boolean(cell?.stream && !cell.loading && !cell.error && (cell.playing || cell.stream.isSimulated)));
  }, 0);

  // Load stream for a camera
  const loadStream = useCallback(async (camera: CameraType): Promise<CellState> => {
    try {
      const res = await api.get(`/cameras/${camera._id}/stream-access`);
      return { camera, stream: res.data.stream, loading: false, reconnecting: false };
    } catch (err) {
      return { camera, loading: false, reconnecting: true, error: getErrorMessage(err) };
    }
  }, []);

  // Load each visible camera once; cell updates must not restart stream requests.
  useEffect(() => {
    pageCameras.forEach(camera => {
      if (cells.has(camera._id) || refreshing.current.has(camera._id)) return;
      refreshing.current.add(camera._id);
      setCells(prev => {
        if (prev.has(camera._id)) return prev;
        const next = new Map(prev);
        next.set(camera._id, { camera, loading: true });
        return next;
      });
      void loadStream(camera).then(cellState => {
        setCells(prev => new Map(prev).set(camera._id, cellState));
      }).finally(() => refreshing.current.delete(camera._id));
    });
  }, [pageCameras, loadStream, cells]);

  // Reconnect a specific cell
  const reconnectCell = useCallback(async (cameraId: string) => {
    const camera = cameras.find(c => c._id === cameraId);
    if (!camera || refreshing.current.has(cameraId)) return;
    refreshing.current.add(cameraId);
    const retryTimer = retryTimers.current.get(cameraId);
    if (retryTimer !== undefined) {
      window.clearTimeout(retryTimer);
      retryTimers.current.delete(cameraId);
    }

    setCells(prev => {
      const next = new Map(prev);
      const existing = next.get(cameraId);
      if (existing) {
        next.set(cameraId, { ...existing, loading: true, reconnecting: true, error: undefined });
      }
      return next;
    });

    try {
      const updated = await loadStream(camera);
      setCells(prev => {
        const next = new Map(prev);
        next.set(cameraId, updated);
        return next;
      });
    } finally {
      refreshing.current.delete(cameraId);
    }
  }, [cameras, loadStream]);

  const scheduleReconnect = useCallback((cameraId: string) => {
    if (retryTimers.current.has(cameraId)) return;
    const attempt = (retryAttempts.current.get(cameraId) ?? 0) + 1;
    retryAttempts.current.set(cameraId, attempt);
    const delay = Math.min(1000 * (2 ** (attempt - 1)), 30000);
    const timer = window.setTimeout(() => {
      retryTimers.current.delete(cameraId);
      void reconnectCell(cameraId);
    }, delay);
    retryTimers.current.set(cameraId, timer);
  }, [reconnectCell]);

  useEffect(() => {
    const visibleIds = new Set(pageCameras.map(camera => camera._id));
    for (const [cameraId, timer] of retryTimers.current) {
      if (!visibleIds.has(cameraId)) {
        window.clearTimeout(timer);
        retryTimers.current.delete(cameraId);
        retryAttempts.current.delete(cameraId);
      }
    }

    pageCameras.forEach(camera => {
      const cell = cells.get(camera._id);
      if (cell?.error && !cell.loading) {
        scheduleReconnect(camera._id);
      } else if (cell?.stream && !cell.loading && !cell.error && (cell.playing || cell.stream.isSimulated)) {
        retryAttempts.current.delete(camera._id);
        const timer = retryTimers.current.get(camera._id);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          retryTimers.current.delete(camera._id);
        }
      }
    });
  }, [cells, pageCameras, scheduleReconnect]);

  useEffect(() => {
    const visibleIds = new Set(pageCameras.map(camera => camera._id));
    for (const [cameraId, timer] of tokenRefreshTimers.current) {
      if (!visibleIds.has(cameraId)) {
        window.clearTimeout(timer.timeout);
        tokenRefreshTimers.current.delete(cameraId);
      }
    }

    pageCameras.forEach(camera => {
      const cell = cells.get(camera._id);
      const expiresAt = cell?.stream?.expiresAt;
      const currentTimer = tokenRefreshTimers.current.get(camera._id);
      if (!expiresAt || cell?.stream?.isSimulated || cell?.loading || cell?.error) {
        if (currentTimer) {
          window.clearTimeout(currentTimer.timeout);
          tokenRefreshTimers.current.delete(camera._id);
        }
        return;
      }
      if (currentTimer?.expiresAt === expiresAt) return;
      if (currentTimer) window.clearTimeout(currentTimer.timeout);
      const remaining = expiresAt - Date.now();
      const refreshMargin = Math.min(30000, Math.max(1000, Math.floor(remaining * 0.1)));
      const delay = Math.max(1000, remaining - refreshMargin);
      const timeout = window.setTimeout(() => {
        tokenRefreshTimers.current.delete(camera._id);
        void reconnectCell(camera._id);
      }, delay);
      tokenRefreshTimers.current.set(camera._id, { expiresAt, timeout });
    });
  }, [cells, pageCameras, reconnectCell]);

  const updatePlaybackState = useCallback((
    cameraId: string,
    playing: boolean,
    error?: string,
    retryable = true,
  ) => {
    setCells(prev => {
      const cell = prev.get(cameraId);
      if (!cell) return prev;
      const reconnecting = !playing && !error;
      if (cell.playing === playing && cell.reconnecting === reconnecting && cell.error === error) return prev;
      const next = new Map(prev);
      next.set(cameraId, {
        ...cell,
        playing,
        reconnecting,
        error,
      });
      return next;
    });
    if (playing) retryAttempts.current.delete(cameraId);
    if (error && retryable) scheduleReconnect(cameraId);
  }, [scheduleReconnect]);

  // Auto-tour timer
  useEffect(() => {
    if (!tourRunning || totalPages <= 1) return;
    const interval = setInterval(() => {
      setCurrentPage(prev => (prev >= totalPages ? 1 : prev + 1));
    }, 15000);
    return () => clearInterval(interval);
  }, [tourRunning, totalPages]);

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreen) {
        setFullscreen(null);
      } else if (e.key === 'ArrowRight' && !fullscreen) {
        if (currentPage < totalPages) setCurrentPage(p => p + 1);
      } else if (e.key === 'ArrowLeft' && !fullscreen) {
        if (currentPage > 1) setCurrentPage(p => p - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, currentPage, totalPages]);

  const gridClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  }[gridSize];

  return (
    <div className="space-y-3 font-sans text-slate-200">
      {/* Top Application Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-[#0d121c] px-4 py-2.5 rounded-xl shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <Grid size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight text-white">Live Video Wall</h2>
              <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                pageCameras.length > 0 && liveCount === pageCameras.length
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${
                  pageCameras.length > 0 && liveCount === pageCameras.length ? 'bg-emerald-400' : 'bg-amber-400'
                }`} />
                {pageCameras.length > 0 ? `${liveCount}/${pageCameras.length} streams live` : 'No cameras selected'}
                <ChevronDown size={11} className="opacity-60" />
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Multi-camera monitoring grid</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Real-time Clock */}
          <div className="font-mono text-xs font-semibold text-slate-300 bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800">
            {currentTime || 'Loading time...'}
          </div>

          {/* Tour Button */}
          <button
            onClick={() => setTourRunning(!tourRunning)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition border ${
              tourRunning
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
            }`}
          >
            {tourRunning ? <Pause size={13} /> : <Play size={13} />}
            {tourRunning ? 'Pause Tour' : 'Start a Tour'}
          </button>

          {/* Mute Toggle */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="rounded-lg border border-slate-800 bg-slate-900/90 p-2 text-slate-400 hover:text-white hover:border-slate-700 transition"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        </div>
      </div>

      {/* Filter and Layout Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-800 bg-[#0d121c] p-2.5 shadow-md">
        {/* Layout Grid Buttons */}
        <div className="flex items-center gap-1 rounded-lg border border-slate-800/80 bg-slate-950/80 p-1">
          {([1, 2, 3, 4] as GridSize[]).map(size => (
            <button
              key={size}
              onClick={() => {
                setGridSize(size);
                setCurrentPage(1);
              }}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                gridSize === size
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              {size}×{size}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-[160px] flex-1 sm:max-w-[210px]">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="w-full rounded-lg border border-slate-800 bg-slate-950/90 py-1.5 pl-8 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-blue-500/70"
            placeholder="Search cameras..."
            value={cameraSearch}
            onChange={e => {
              setCameraSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        {/* Location Dropdown */}
        <select
          className="rounded-lg border border-slate-800 bg-slate-950/90 px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500/70"
          value={selectedLocation}
          onChange={e => {
            setSelectedLocation(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="">Select Location</option>
          {locations.map(loc => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>

        {/* NVR Dropdown */}
        <select
          className="rounded-lg border border-slate-800 bg-slate-950/90 px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500/70"
          value={selectedNvrId}
          onChange={e => {
            setSelectedNvrId(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="">Select NVR</option>
          {nvrs.map(nvr => (
            <option key={nvr._id} value={nvr._id}>{nvr.name} ({nvr.brand})</option>
          ))}
        </select>

        {/* Camera Type Filter */}
        <select
          className="rounded-lg border border-slate-800 bg-slate-950/90 px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500/70"
          value={selectedCameraType}
          onChange={e => {
            setSelectedCameraType(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="">Select Camera Type</option>
          <option value="nvr">NVR Camera</option>
          <option value="direct">Direct RTSP</option>
        </select>

        {/* Status Filter */}
        <select
          className="rounded-lg border border-slate-800 bg-slate-950/90 px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500/70"
          value={selectedStatus}
          onChange={e => {
            setSelectedStatus(e.target.value as any);
            setCurrentPage(1);
          }}
        >
          <option value="all">All Status</option>
          <option value="live">Live Only</option>
          <option value="reconnecting">Reconnecting</option>
          <option value="offline">Offline</option>
        </select>

        {/* Showing Count Indicator */}
        <div className="ml-auto text-xs font-medium text-slate-400">
          Showing <span className="font-semibold text-slate-200">{pageCameras.length}</span> of{' '}
          <span className="font-semibold text-slate-200">{filteredCameras.length}</span> cameras
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
          {loadError}
        </div>
      )}

      {/* Camera Video Grid */}
      {loading ? (
        <div className="flex h-96 flex-col items-center justify-center rounded-2xl border border-slate-800 bg-[#0d121c] text-slate-400">
          <RefreshCw size={28} className="animate-spin text-blue-500 mb-3" />
          <p className="text-sm">Initializing camera grid and streams...</p>
        </div>
      ) : pageCameras.length === 0 ? (
        <div className="flex h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-[#0d121c] p-8 text-center text-slate-500">
          <CameraIcon size={38} className="mb-2 text-slate-600" />
          <p className="font-semibold text-slate-400">No cameras available to display</p>
          <p className="text-xs text-slate-500 mt-1">Check your NVR connection or adjust the search and filter options.</p>
        </div>
      ) : (
        <div className={`grid gap-2.5 ${gridClass}`}>
          {pageCameras.map((camera, index) => {
            const cell = cells.get(camera._id) || { camera, loading: true };
            const isLive = Boolean(cell.stream && !cell.loading && !cell.error && (cell.playing || cell.stream.isSimulated));
            const isReconnecting = !cell.error && (
              cell.reconnecting
              || cell.loading
              || Boolean(cell.stream && !cell.playing && !cell.stream.isSimulated)
            );
            const isOffline = cell.error && !cell.loading;
            const camDisplayId = `CAM-${String((currentPage - 1) * pageSize + index + 1).padStart(3, '0')}`;

            return (
              <div
                key={camera._id}
                className={`group relative flex flex-col overflow-hidden rounded-xl border border-slate-800/90 bg-[#0a0e17] shadow-lg transition duration-200 hover:border-slate-700 ${
                  fullscreen === camera._id
                    ? 'fixed inset-3 z-[70] !m-0 !rounded-2xl border-blue-500/50 shadow-2xl sm:inset-6'
                    : 'aspect-video'
                }`}
              >
                {/* Top Video Overlay Bar */}
                <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/85 via-black/40 to-transparent px-3 py-2 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold tracking-wider text-slate-200">
                      {camDisplayId}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-300 opacity-90 hidden sm:inline">
                      {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
                      {new Date().toLocaleTimeString('en-US', { hour12: false })}
                    </span>

                    {/* Status Badge */}
                    {isLive && (
                      <span className="flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/40">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        LIVE
                      </span>
                    )}

                    {isReconnecting && (
                      <span className="flex items-center gap-1 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-300 border border-indigo-500/40">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping" />
                        RECONNECTING
                      </span>
                    )}

                    {isOffline && (
                      <span className="flex items-center gap-1 rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-400 border border-rose-500/40">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                        OFFLINE
                      </span>
                    )}
                  </div>
                </div>

                {/* Main Video Surface */}
                <div className="relative flex-1 bg-[#060910] flex items-center justify-center overflow-hidden">
                  {cell.stream && !cell.error ? (
                    cell.stream.isSimulated ? (
                      <div className="flex flex-col items-center justify-center text-slate-500">
                        <CameraIcon size={32} className="mb-2 opacity-40 text-slate-400" />
                        <span className="text-xs font-medium">Simulated Stream</span>
                      </div>
                    ) : (
                      <HlsPlayer
                        className="h-full w-full object-contain"
                        src={cell.stream.hlsUrl}
                        onPlaybackChange={(playing, error, retryable) => updatePlaybackState(camera._id, playing, error, retryable)}
                        onFatalError={() => scheduleReconnect(camera._id)}
                      />
                    )
                  ) : null}

                  {/* Reconnecting / Buffering Overlay */}
                  {isReconnecting && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs">
                      <div className="flex items-center gap-2 rounded-lg bg-slate-900/90 px-3 py-1.5 border border-slate-700/80 shadow-md">
                        <RefreshCw size={14} className="animate-spin text-blue-400" />
                        <span className="text-xs font-semibold text-slate-200">Reconnecting...</span>
                      </div>
                    </div>
                  )}

                  {/* Offline / Error Overlay */}
                  {isOffline && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 px-4 text-center">
                      <WifiOff size={24} className="mb-2 text-rose-400 opacity-80" />
                      <p className="text-xs font-medium text-rose-300">Camera Offline</p>
                      {cell.error && <p className="mt-1 max-w-[90%] text-[10px] text-slate-400">{cell.error}</p>}
                      <button
                        onClick={() => reconnectCell(camera._id)}
                        className="mt-2 inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 transition"
                      >
                        <RefreshCw size={11} /> Retry Connection
                      </button>
                    </div>
                  )}
                </div>

                {/* Bottom Video Overlay Bar */}
                <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 py-2 text-[11px]">
                  <div className="truncate font-medium text-slate-200 max-w-[80%]">
                    <span className="bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800/80 text-[11px]">
                      {camera.name || `Channel ${camera.channelNumber ?? index + 1}`}
                      {camera.location ? ` (${camera.location})` : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setFullscreen(fullscreen === camera._id ? null : camera._id)}
                      className="rounded bg-black/60 p-1.5 text-slate-300 hover:bg-black/80 hover:text-white transition border border-slate-700/60"
                      title={fullscreen === camera._id ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                      {fullscreen === camera._id ? <X size={14} /> : <Maximize2 size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Pagination Bar (Prev / Next) */}
      <div className="flex items-center justify-center gap-3 pt-3">
        <button
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0d121c] px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={15} /> Prev
        </button>

        <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-[#0d121c] px-4 py-2 text-xs font-bold text-slate-200">
          <span>{currentPage}</span>
          <span className="text-slate-500">/</span>
          <span className="text-slate-400">{totalPages}</span>
        </div>

        <button
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          disabled={currentPage >= totalPages}
          className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0d121c] px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next <ChevronRight size={15} />
        </button>
      </div>

      {fullscreen && (
        <div
          className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm"
          onClick={() => setFullscreen(null)}
        />
      )}
    </div>
  );
}
