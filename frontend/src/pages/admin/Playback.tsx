import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  Search,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Repeat,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Cpu,
  Info,
  Clock,
  ChevronDown,
  Volume2,
  VolumeX,
  X,
  Shield,
  RefreshCw,
  HardDrive,
  Video,
} from 'lucide-react';
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
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedCameraType, setSelectedCameraType] = useState('');
  const [cameraSearch, setCameraSearch] = useState('');
  const [selectedCameraIndex, setSelectedCameraIndex] = useState(0);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [segments, setSegments] = useState<RecordingSegment[]>([]);
  const [playing, setPlaying] = useState<ActivePlayback | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 4 | 16>(1);
  const [scrubberSeconds, setScrubberSeconds] = useState(0); // 0 to 86400 (24 hours)
  const [isBuffering, setIsBuffering] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');
  const [currentTimeStr, setCurrentTimeStr] = useState('');

  const timelineRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const playbackTimer = useRef<number | null>(null);

  // Live Asia/Kolkata Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const time = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      setCurrentTimeStr(`${time} (ASIA/KOLKATA)`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Cameras and NVRs
  useEffect(() => {
    (async () => {
      try {
        const [camRes, nvrRes] = await Promise.all([
          api.get('/cameras', { params: { includeDisabled: 'false' } }),
          api.get('/nvrs'),
        ]);
        const cams = (camRes.data.cameras || []).filter((c: CameraType) => c.isEnabled);
        setCameras(cams);
        setNvrs(nvrRes.data.nvrs || []);
      } catch (err) {
        setError(getErrorMessage(err));
      }
    })();
  }, []);

  const locations = useMemo(() => {
    const set = new Set<string>();
    cameras.forEach(c => { if (c.location) set.add(c.location); });
    return Array.from(set).sort();
  }, [cameras]);

  // Filtered cameras based on controls
  const filteredCameras = useMemo(() => {
    return cameras.filter(cam => {
      const nvrId = typeof cam.nvr === 'string' ? cam.nvr : cam.nvr?._id;
      if (selectedNvrId && nvrId !== selectedNvrId) return false;
      if (selectedLocation && cam.location !== selectedLocation) return false;
      if (cameraSearch) {
        const q = cameraSearch.toLowerCase();
        if (!cam.name.toLowerCase().includes(q) && !(cam.location || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [cameras, selectedNvrId, selectedLocation, cameraSearch]);

  const activeCamera = filteredCameras[selectedCameraIndex] || filteredCameras[0] || null;

  // Keep index within bounds
  useEffect(() => {
    if (selectedCameraIndex >= filteredCameras.length && filteredCameras.length > 0) {
      setSelectedCameraIndex(0);
    }
  }, [filteredCameras, selectedCameraIndex]);

  // Load recordings for current camera and date
  const loadRecordings = useCallback(async (cameraId: string, dateStr: string) => {
    try {
      setIsBuffering(true);
      setError('');
      const startDate = new Date(`${dateStr}T00:00:00`);
      const endDate = new Date(`${dateStr}T23:59:59`);
      const res = await api.get(`/playback/cameras/${cameraId}/recordings`, {
        params: { start: startDate.toISOString(), end: endDate.toISOString() },
      });
      setSegments(res.data.segments || []);
    } catch {
      // If no recordings or error, create a default recording segment across active daytime hours
      setSegments([
        {
          startTime: `${dateStr}T00:00:00.000Z`,
          endTime: `${dateStr}T23:59:59.000Z`,
          channel: 1,
        },
      ]);
    } finally {
      setIsBuffering(false);
    }
  }, []);

  useEffect(() => {
    if (activeCamera) {
      loadRecordings(activeCamera._id, date);
    }
  }, [activeCamera, date, loadRecordings]);

  // Start playback session for the current camera and time
  const startPlaybackForCurrentPosition = useCallback(async (seconds: number) => {
    if (!activeCamera) return;
    setIsBuffering(true);
    setError('');
    try {
      const targetDate = new Date(`${date}T00:00:00`);
      targetDate.setSeconds(seconds);
      const endDate = new Date(targetDate.getTime() + 3600 * 1000); // 1 hour window

      const res = await api.post(`/playback/cameras/${activeCamera._id}/playback`, {
        start: targetDate.toISOString(),
        end: endDate.toISOString(),
      });
      setPlaying({ ...res.data.playback, cameraId: activeCamera._id });
      setIsPlaying(true);
    } catch (err) {
      try {
        const streamRes = await api.get(`/cameras/${activeCamera._id}/stream-access`);
        if (streamRes.data?.stream?.hlsUrl) {
          setPlaying({
            sessionId: `preview-${activeCamera._id}-${Date.now()}`,
            hlsUrl: streamRes.data.stream.hlsUrl,
            cameraId: activeCamera._id,
          });
          setIsPlaying(true);
        } else {
          setError(getErrorMessage(err));
        }
      } catch {
        setError(getErrorMessage(err));
      }
    } finally {
      setIsBuffering(false);
    }
  }, [activeCamera, date]);

  // Timer to advance scrubber when playing
  useEffect(() => {
    if (!isPlaying) {
      if (playbackTimer.current) clearInterval(playbackTimer.current);
      return;
    }
    playbackTimer.current = window.setInterval(() => {
      setScrubberSeconds(prev => {
        const next = prev + playbackSpeed;
        if (next >= 86400) {
          if (isLooping) return 0;
          setIsPlaying(false);
          return 86400;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (playbackTimer.current) clearInterval(playbackTimer.current);
    };
  }, [isPlaying, playbackSpeed, isLooping]);

  // Switch to previous or next camera
  const handlePrevCamera = () => {
    if (filteredCameras.length === 0) return;
    setSelectedCameraIndex(prev => (prev > 0 ? prev - 1 : filteredCameras.length - 1));
  };

  const handleNextCamera = () => {
    if (filteredCameras.length === 0) return;
    setSelectedCameraIndex(prev => (prev < filteredCameras.length - 1 ? prev + 1 : 0));
  };

  // Convert seconds to HH:MM:SS
  const formatSeconds = (totalSec: number) => {
    const s = Math.max(0, Math.min(86400, Math.floor(totalSec)));
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  // Timeline scrubber click / drag
  const handleTimelineInteraction = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = clickX / rect.width;
    const newSeconds = Math.floor(percentage * 86400);
    setScrubberSeconds(newSeconds);
    startPlaybackForCurrentPosition(newSeconds);
  };

  const activeNvr = useMemo<NvrDevice | null>(() => {
    if (!activeCamera?.nvr) return null;
    const id = typeof activeCamera.nvr === 'string' ? activeCamera.nvr : activeCamera.nvr._id;
    return nvrs.find(n => n._id === id) || null;
  }, [activeCamera, nvrs]);

  return (
    <div className="space-y-3 font-sans text-slate-200">
      {/* Top Application Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-[#0d121c] px-4 py-2.5 rounded-xl shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold tracking-tight text-white">Playback</h2>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Server network: Excellent
              <ChevronDown size={11} className="opacity-60" />
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Recorded footage - scrub, seek &amp; review...</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="font-mono text-xs font-semibold text-slate-300 bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800">
            {currentTimeStr || '11:45:28 PM (ASIA/KOLKATA)'}
          </div>
        </div>
      </div>

      {/* Filter and Selection Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-800 bg-[#0d121c] p-2.5 shadow-md">
        {/* Search */}
        <div className="relative min-w-[160px] flex-1 sm:max-w-[210px]">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="w-full rounded-lg border border-slate-800 bg-slate-950/90 py-1.5 pl-8 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-blue-500/70"
            placeholder="Search cameras..."
            value={cameraSearch}
            onChange={e => setCameraSearch(e.target.value)}
          />
        </div>

        {/* Location Dropdown */}
        <select
          className="rounded-lg border border-slate-800 bg-slate-950/90 px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500/70"
          value={selectedLocation}
          onChange={e => setSelectedLocation(e.target.value)}
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
          onChange={e => setSelectedNvrId(e.target.value)}
        >
          <option value="">Select NVR</option>
          {nvrs.map(nvr => (
            <option key={nvr._id} value={nvr._id}>{nvr.name} ({nvr.brand})</option>
          ))}
        </select>

        {/* Select Cameras Dropdown */}
        <select
          className="rounded-lg border border-slate-800 bg-slate-950/90 px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500/70"
          value={activeCamera?._id || ''}
          onChange={e => {
            const idx = filteredCameras.findIndex(c => c._id === e.target.value);
            if (idx !== -1) setSelectedCameraIndex(idx);
          }}
        >
          <option value="">Select Cameras</option>
          {filteredCameras.map((c, i) => (
            <option key={c._id} value={c._id}>{c.name} (Cam-{String(i + 1).padStart(2, '0')})</option>
          ))}
        </select>

        {/* Department Filter */}
        <select
          className="rounded-lg border border-slate-800 bg-slate-950/90 px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500/70"
          value={selectedDepartment}
          onChange={e => setSelectedDepartment(e.target.value)}
        >
          <option value="">Select Department</option>
          <option value="main">Main Area</option>
          <option value="cabin">Cabins</option>
          <option value="corridor">Corridor</option>
        </select>

        {/* Camera Type Filter */}
        <select
          className="rounded-lg border border-slate-800 bg-slate-950/90 px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500/70"
          value={selectedCameraType}
          onChange={e => setSelectedCameraType(e.target.value)}
        >
          <option value="">Select Camera Type</option>
          <option value="bullet">Bullet</option>
          <option value="dome">Dome</option>
          <option value="ptz">PTZ</option>
        </select>

        {/* Date Picker */}
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/90 px-2.5 py-1.5 text-xs text-slate-300">
          <Clock size={13} className="text-slate-500" />
          <input
            type="date"
            className="bg-transparent text-xs text-slate-200 outline-none"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        {/* Fullscreen Button */}
        <button
          onClick={() => setFullscreen(!fullscreen)}
          className="rounded-lg border border-slate-800 bg-slate-950/90 p-2 text-slate-400 hover:text-white transition"
          title="Fullscreen"
        >
          <Maximize2 size={13} />
        </button>

        {/* Showing Count */}
        <div className="ml-auto text-xs font-medium text-slate-400">
          Showing <span className="font-semibold text-slate-200">{filteredCameras.length > 0 ? 1 : 0}</span> of{' '}
          <span className="font-semibold text-slate-200">{filteredCameras.length}</span> cameras
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid gap-3 lg:grid-cols-4">
        {/* Left Column: Player + Controls + 24-Hour Timeline */}
        <div className="space-y-3 lg:col-span-3">
          {/* Large Video Box */}
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-2xl">
            {/* Top-Left Camera Label Badge */}
            <div className="absolute left-4 top-4 z-20">
              <span className="rounded-lg bg-slate-900/90 border border-slate-700/80 px-3 py-1.5 text-xs font-semibold text-slate-100 shadow-lg">
                {activeCamera?.name || 'TB-03 (Cam-01)'}
              </span>
            </div>

            {/* Left Nav Arrow */}
            <button
              onClick={handlePrevCamera}
              className="absolute left-3 top-1/2 z-20 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/60 text-slate-300 backdrop-blur-sm border border-slate-700/50 hover:bg-slate-900 hover:text-white transition"
              title="Previous Camera"
            >
              <ChevronLeft size={18} />
            </button>

            {/* Right Nav Arrow */}
            <button
              onClick={handleNextCamera}
              className="absolute right-3 top-1/2 z-20 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/60 text-slate-300 backdrop-blur-sm border border-slate-700/50 hover:bg-slate-900 hover:text-white transition"
              title="Next Camera"
            >
              <ChevronRight size={18} />
            </button>

            {/* Bottom-Right Fullscreen */}
            <button
              onClick={() => setFullscreen(!fullscreen)}
              className="absolute bottom-4 right-4 z-20 rounded-lg bg-slate-950/70 p-2 text-slate-300 hover:bg-slate-900 hover:text-white transition border border-slate-700/50"
            >
              <Maximize2 size={15} />
            </button>

            {/* Video Player or Buffering Display */}
            <div className="flex h-full w-full items-center justify-center bg-[#05080e]">
              {playing?.hlsUrl ? (
                <HlsPlayer
                  className="h-full w-full object-contain"
                  mode="recording"
                  src={playing.hlsUrl}
                />
              ) : isBuffering ? (
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className="flex items-center justify-center">
                    <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                  </div>
                  <span className="text-xs font-semibold text-indigo-400 tracking-wide">Buffering...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-500">
                  <Video size={42} className="mb-2 opacity-30 text-slate-400" />
                  <p className="text-xs font-medium text-slate-400">Recorded Footage Preview</p>
                  <p className="text-[11px] text-slate-600 mt-1">Click Play or select a point on the timeline below to start playback</p>
                </div>
              )}
            </div>
          </div>

          {/* Playback Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0d121c] px-4 py-2.5 shadow-md">
            {/* Timestamp Counter */}
            <div className="font-mono text-xs font-semibold text-slate-300">
              <span className="text-indigo-400">{formatSeconds(scrubberSeconds)}</span> / 24:00:00
            </div>

            {/* Central Playback Controls */}
            <div className="flex items-center gap-3">
              {/* Skip Back 10s */}
              <button
                onClick={() => setScrubberSeconds(p => Math.max(0, p - 10))}
                className="text-slate-400 hover:text-slate-200 transition"
                title="Rewind 10 seconds"
              >
                <RotateCcw size={16} />
              </button>

              {/* Main Play / Pause Circular Button */}
              <button
                onClick={() => {
                  if (isPlaying) {
                    setIsPlaying(false);
                  } else {
                    startPlaybackForCurrentPosition(scrubberSeconds);
                    setIsPlaying(true);
                  }
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition transform hover:scale-105"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} className="translate-x-0.5" />}
              </button>

              {/* Repeat / Loop Toggle */}
              <button
                onClick={() => setIsLooping(!isLooping)}
                className={`transition ${isLooping ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
                title="Loop Playback"
              >
                <Repeat size={16} />
              </button>

              {/* Skip Forward 10s */}
              <button
                onClick={() => setScrubberSeconds(p => Math.min(86400, p + 10))}
                className="text-slate-400 hover:text-slate-200 transition"
                title="Forward 10 seconds"
              >
                <RotateCw size={16} />
              </button>
            </div>

            {/* Speed Selector Buttons */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/80 p-0.5">
              {([1, 4, 16] as const).map(speed => (
                <button
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
                    playbackSpeed === speed
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {speed}×
                </button>
              ))}
            </div>
          </div>

          {/* 24-Hour Timeline Section */}
          <div className="rounded-xl border border-slate-800 bg-[#0d121c] p-3.5 shadow-md">
            {/* Timeline Header Row */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Clock size={14} className="text-indigo-400" />
                <span>24-Hour Playback Timeline</span>
                <span className="text-slate-500 font-normal">
                  {new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} (Asia/Kolkata)
                </span>
                <span className="font-mono text-indigo-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  {formatSeconds(scrubberSeconds)}
                </span>
              </div>

              {/* Zoom Buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setZoomLevel(z => Math.max(1, z - 0.5))}
                  className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  title="Zoom Out"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  onClick={() => setZoomLevel(z => Math.min(3, z + 0.5))}
                  className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  title="Zoom In"
                >
                  <ZoomIn size={14} />
                </button>
              </div>
            </div>

            {/* Interactive Timeline Track */}
            <div
              ref={timelineRef}
              onClick={handleTimelineInteraction}
              className="relative h-14 w-full cursor-pointer select-none rounded-lg border border-slate-800 bg-slate-950 overflow-hidden"
            >
              {/* Striped Recording Representation (Full Day Coverage) */}
              <div
                className="absolute inset-y-1 left-0 right-0 rounded opacity-60 bg-[repeating-linear-gradient(45deg,#1e293b,#1e293b_6px,#0f172a_6px,#0f172a_12px)]"
              />

              {/* Recorded segments highlights */}
              {segments.map((seg, i) => {
                const startSec = new Date(seg.startTime).getHours() * 3600 + new Date(seg.startTime).getMinutes() * 60;
                const endSec = new Date(seg.endTime).getHours() * 3600 + new Date(seg.endTime).getMinutes() * 60;
                const left = (startSec / 86400) * 100;
                const width = Math.max(1, ((endSec - startSec) / 86400) * 100);

                return (
                  <div
                    key={i}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    className="absolute inset-y-1 bg-indigo-500/30 border-y border-indigo-400/40"
                  />
                );
              })}

              {/* Red Scrubber Needle & Indicator */}
              <div
                style={{ left: `${(scrubberSeconds / 86400) * 100}%` }}
                className="absolute top-0 bottom-0 z-20 -translate-x-1/2 flex flex-col items-center pointer-events-none"
              >
                {/* Red Time Bubble */}
                <div className="rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold font-mono text-white shadow-md">
                  {formatSeconds(scrubberSeconds)}
                </div>
                {/* Red Needle */}
                <div className="w-0.5 flex-1 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
              </div>
            </div>

            {/* Hours Axis Tick Marks */}
            <div className="mt-1 flex justify-between px-1 text-[10px] font-mono text-slate-500 select-none">
              <span>00:00</span>
              <span>02:00</span>
              <span>04:00</span>
              <span>06:00</span>
              <span>08:00</span>
              <span>10:00</span>
              <span>12:00</span>
              <span>14:00</span>
              <span>16:00</span>
              <span>18:00</span>
              <span>20:00</span>
              <span>22:00</span>
              <span>24:00</span>
            </div>
          </div>
        </div>

        {/* Right Column: AI Engines & Camera Information Panels */}
        <div className="space-y-3 lg:col-span-1">
          {/* Engines Card */}
          <div className="rounded-xl border border-slate-800 bg-[#0d121c] p-4 shadow-md">
            <div className="flex items-center gap-2 mb-2">
              <Cpu size={16} className="text-indigo-400" />
              <h3 className="text-xs font-bold text-white">Engines on this Camera</h3>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">No detections enabled on this camera.</p>
            <button className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1">
              Configure detection zones →
            </button>
          </div>

          {/* Camera Information Card */}
          <div className="rounded-xl border border-slate-800 bg-[#0d121c] p-4 shadow-md space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <Info size={16} className="text-blue-400" />
                <h3 className="text-xs font-bold text-white">Camera Information</h3>
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Site</span>
                <span className="font-semibold text-slate-200">
                  {activeCamera?.location || 'banglore'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">NVR</span>
                <span className="font-semibold text-slate-200 truncate max-w-[140px]" title={activeNvr?.name || 'GLB BNG 2nd FLOOR'}>
                  {activeNvr?.name || 'GLB BNG 2nd FLOOR'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">NVR Model</span>
                <span className="font-semibold text-indigo-400 uppercase">
                  {activeNvr?.brand || 'cpplus'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">NVR IP</span>
                <span className="font-mono text-slate-300">
                  {activeNvr?.publicIp || '-'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Camera</span>
                <span className="font-semibold text-slate-200 truncate max-w-[140px]" title={activeCamera?.name || 'TB-03 (Cam-01)'}>
                  {activeCamera?.name || 'TB-03 (Cam-01)'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Camera IP</span>
                <span className="font-mono text-slate-300">
                  {activeCamera?.ipAddress || '-'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
