import { useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';

interface HlsPlayerProps {
  className?: string;
  mode?: 'live' | 'recording';
  src: string;
}

export default function HlsPlayer({ className, mode = 'live', src }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | undefined;
    let disposed = false;
    setConnecting(true);
    setError('');

    const onPlaying = () => setConnecting(false);
    const onWaiting = () => setConnecting(true);
    const onMediaError = () => {
      setConnecting(false);
      setError(mode === 'recording'
        ? 'Recording playback stopped. Select the segment again to retry.'
        : 'The live stream stopped. Use Reconnect to try again.');
    };
    const startPlayback = () => {
      if (disposed || document.visibilityState !== 'visible') return;
      void video.play().then(() => {
        if (!disposed) setConnecting(false);
      }).catch(() => {
        if (!disposed) setConnecting(false);
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && video.paused) startPlayback();
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('error', onMediaError);
    video.addEventListener('loadedmetadata', startPlayback);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const initialize = async () => {
      try {
        const { default: HlsPlayerClass } = await import('hls.js');
        if (disposed) return;
        if (HlsPlayerClass.isSupported()) {
          hls = new HlsPlayerClass({ enableWorker: true });
          hls.on(HlsPlayerClass.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            setConnecting(false);
            setError(mode === 'recording'
              ? 'Unable to load this recording. Check the NVR connection and retry.'
              : 'Unable to load the live stream. Check the NVR connection and reconnect.');
          });
          hls.on(HlsPlayerClass.Events.MANIFEST_PARSED, startPlayback);
          hls.loadSource(src);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = src;
        } else {
          setConnecting(false);
          setError('This browser does not support HLS playback.');
        }
      } catch {
        if (disposed) return;
        setConnecting(false);
        setError('The HLS player could not be loaded.');
      }
    };
    void initialize();

    return () => {
      disposed = true;
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('error', onMediaError);
      video.removeEventListener('loadedmetadata', startPlayback);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [mode, src]);

  return (
    <div className="relative h-full w-full bg-slate-950">
      <video ref={videoRef} className={className} controls autoPlay muted playsInline />
      {connecting && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/60 text-sm text-slate-300">
          {mode === 'recording' ? 'Loading recording…' : 'Connecting to live stream…'}
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 px-4 text-center text-sm text-rose-300">
          {error}
        </div>
      )}
    </div>
  );
}
