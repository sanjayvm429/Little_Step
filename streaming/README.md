# LittleSteps Streaming (MediaMTX)

MediaMTX is the media server that bridges CCTV RTSP streams to browser-compatible WebRTC/HLS.

## Architecture

```
CCTV Camera ──RTSP──► MediaMTX ──WebRTC/HLS──► Browser
                        ▲
                        └── Backend issues short-lived stream tokens
                            (raw RTSP URLs/credentials never reach the browser)
```

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 8554 | RTSP | Camera ingest |
| 8888 | HTTP | HLS fallback |
| 8889 | HTTP/WS | WebRTC signaling |
| 9997 | HTTP | MediaMTX API (health checks) |

## Simulated cameras (development)

No hardware needed. Push a test pattern to a stream key:

```bash
# Requires ffmpeg
ffmpeg -re -f lavfi -i testsrc=size=640x480:rate=15 \
       -f lavfi -i sine=frequency=440 \
       -c:v libx264 -preset ultrafast -tune zerolatency \
       -c:a aac -f rtsp rtsp://localhost:8554/sunshine-main
```

Or run two simulated cameras:

```bash
ffmpeg -re -f lavfi -i testsrc=size=640x480:rate=15 -c:v libx264 -f rtsp rtsp://localhost:8554/sunshine-main &
ffmpeg -re -f lavfi -i smptebars=size=640x480:rate=15 -c:v libx264 -f rtsp rtsp://localhost:8554/rainbow-activity &
```

## Real cameras

1. Admin registers camera in the app (name, IP, RTSP path, credentials).
2. Credentials are AES-256-GCM encrypted at rest in MongoDB.
3. Add a path to `mediamtx.yml`:

```yaml
paths:
  my-camera:
    source: rtsp://admin:password@192.168.1.50:554/Streaming/Channels/101
    sourceOnDemand: yes
    sourceProtocol: tcp
```

4. Restart MediaMTX. The backend's `streamKey` must match the path name.

## Security notes

- Never expose port 8554 (RTSP) to the public internet.
- WebRTC (8889) and HLS (8888) should sit behind the backend's authorization layer.
- The backend issues 5-minute signed stream tokens after verifying parent/teacher permissions.
- Camera credentials are encrypted with `ENCRYPTION_KEY` and never sent to the browser.
