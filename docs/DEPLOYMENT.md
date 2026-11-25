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
   - Consider a TURN server for WebRTC NAT traversal

5. **File uploads**
   - Use S3-compatible storage in production (replace local `uploads/`)
   - Validate file types and sizes

6. **Monitoring**
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
