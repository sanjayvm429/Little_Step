# Deployment Guide — LittleSteps

## Production checklist

1. **Environment**
   - Set `NODE_ENV=production`
   - Use strong random `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `STREAM_TOKEN_SECRET`, `ENCRYPTION_KEY`
   - Set `COOKIE_SECURE=true` (requires HTTPS)
   - Set `CLIENT_URL` to your frontend domain

2. **Database**
   - Use MongoDB Atlas or a managed MongoDB with TLS
   - Enable authentication
   - Set up daily backups

3. **HTTPS**
   - Terminate TLS at a reverse proxy (nginx/Caddy/Cloudflare)
   - Redirect HTTP → HTTPS
   - Set `COOKIE_SECURE=true`

4. **Streaming**
   - Run MediaMTX on a private network/VLAN reachable only by cameras and backend
   - Do NOT expose RTSP port 8554 publicly
   - Expose only WebRTC (8889) and HLS (8888) through the backend's auth layer
   - In Docker Compose, backend HLS requests must use `http://mediamtx:8888`; `localhost` resolves to the backend container itself
   - `hlsAlwaysRemux` is enabled so the first viewer does not wait for an on-demand muxer; monitor CPU as online camera count grows
   - Consider a TURN server for WebRTC NAT traversal

5. **File uploads**
   - Use S3-compatible storage in production (replace local `uploads/`)
   - Validate file types and sizes

6. **Employee face attendance**
   - Set a unique `FACE_SERVICE_SECRET` (at least 32 random characters) and the same value in the backend and face-service environments.
   - Generate `FACE_DATA_ENCRYPTION_KEY` as 32 random bytes encoded in hex. Store it in a secrets manager and maintain a protected backup; losing it makes encrypted face data unreadable.
   - Keep the face-service container on the private Compose network. Do not publish port 8001 or expose its shared secret to the browser.
   - Persist the `face-data` volume and restrict host access. The SQLite database is separate from MongoDB and stores employee biometric attendance; the existing child attendance data remains in MongoDB.
   - Set `FACE_SERVICE_RTSP_BASE_URL` to the MediaMTX RTSP address reachable from the Python worker. It should point to existing MediaMTX paths, not expose NVR credentials to the worker or browser.
   - Set `CLIENT_URL` to a reachable HTTPS dashboard origin. Mobile enrollment links are rejected for HTTP and loopback addresses in every environment because phone browsers require a secure camera context.
   - Obtain documented employee consent before collection. Review applicable biometric privacy laws, retention periods, access controls, and deletion procedures before production use.
   - Verify the SFace similarity threshold with authorized, representative CCTV footage and lighting conditions. The default threshold is not a validated accuracy claim.

7. **Monitoring**
   - Health check endpoint: `GET /api/health`
   - MediaMTX metrics: enable `metrics: yes` in `mediamtx.yml`
   - Set up log aggregation (e.g. Grafana Loki, Datadog)

## Docker production

```bash
docker compose -f docker-compose.yml --profile prod up -d
```

## Scaling notes

- Backend is stateless (JWT) — scale horizontally behind a load balancer
- MediaMTX is single-node; for multi-node, use a media cluster or SFU
- MongoDB: use a replica set for high availability

## Data privacy (DPDP / child safety)

- Camera access requires explicit parental consent + admin approval
- No monitoring in bathrooms/changing rooms — configure camera placement accordingly
- Camera credentials encrypted at rest
- Audit logs for all camera access
- Data retention policies should be defined per nursery policy
