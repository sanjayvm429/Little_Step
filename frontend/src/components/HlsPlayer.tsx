import { useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';

interface HlsPlayerProps {
  className?: string;
  mode?: 'live' | 'recording';
  onFatalError?: () => void;
  onPlaybackChange?: (playing: boolean, error?: string, retryable?: boolean) => void;
  src: string;
}

export default function HlsPlayer({
  className,
  mode = 'live',
  onFatalError,
  onPlaybackChange,
  src,
}: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onFatalErrorRef = useRef(onFatalError);
  const onPlaybackChangeRef = useRef(onPlaybackChange);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState('');

  onFatalErrorRef.current = onFatalError;
  onPlaybackChangeRef.current = onPlaybackChange;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | undefined;
    let disposed = false;
    let recoveryRequested = false;
    let mediaRecoveryAttempts = 0;
    setConnecting(true);
    setError('');

    const requestRecovery = (message: string, retryable = true) => {
      setConnecting(false);
      setError(message);
      onPlaybackChangeRef.current?.(false, message, retryable);
      if (retryable && mode === 'live' && !recoveryRequested) {
        recoveryRequested = true;
        onFatalErrorRef.current?.();
      }
    };
    const onPlaying = () => {
      setConnecting(false);
      onPlaybackChangeRef.current?.(true);
    };
    const onWaiting = () => {
      setConnecting(true);
      onPlaybackChangeRef.current?.(false);
    };
    const onMediaError = () => {
      requestRecovery(mode === 'recording'
        ? 'Recording playback stopped. Select the segment again to retry.'
        : 'The live stream stopped. Reconnecting…');
    };
    const startPlayback = () => {
      if (disposed) return;
      void video.play().then(() => {
        if (!disposed) setConnecting(false);
      }).catch(() => {
        if (!disposed) setConnecting(false);
      });
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('error', onMediaError);
    video.addEventListener('loadedmetadata', startPlayback);

    const initialize = async () => {
      try {
        const { default: HlsPlayerClass } = await import('hls.js');
        if (disposed) return;
        if (HlsPlayerClass.isSupported()) {
          hls = new HlsPlayerClass({
            enableWorker: true,
            manifestLoadingMaxRetry: 3,
            manifestLoadingRetryDelay: 1000,
            manifestLoadingMaxRetryTimeout: 8000,
            levelLoadingMaxRetry: 3,
            levelLoadingRetryDelay: 1000,
            fragLoadingMaxRetry: 5,
            fragLoadingRetryDelay: 1000,
            fragLoadingMaxRetryTimeout: 8000,
          });
          hls.on(HlsPlayerClass.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            if (data.type === HlsPlayerClass.ErrorTypes.MEDIA_ERROR && mediaRecoveryAttempts < 1) {
              mediaRecoveryAttempts += 1;
              hls?.recoverMediaError();
              return;
            }
            requestRecovery(mode === 'recording'
              ? 'Unable to load this recording. Check the NVR connection and retry.'
              : 'Unable to load the live stream. Reconnecting…');
          });
          hls.on(HlsPlayerClass.Events.MANIFEST_PARSED, startPlayback);
          hls.loadSource(src);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = src;
        } else {
          requestRecovery('This browser does not support HLS playback.', false);
        }
      } catch {
        if (disposed) return;
        requestRecovery('The HLS player could not be loaded.', false);
      }
    };
    void initialize();

    return () => {
      disposed = true;
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('error', onMediaError);
      video.removeEventListener('loadedmetadata', startPlayback);
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
