# LittleSteps — Smart Nursery & Childcare Monitoring Platform

A full-stack platform for nurseries, preschools and daycares that lets parents securely monitor their children via authorized live camera streams and stay updated on attendance, activities, messages and safety.

## Features

- **Role-based access**: Parent, Teacher, Admin portals with JWT auth (access + refresh tokens)
- **Live camera monitoring**: RTSP → MediaMTX → WebRTC/HLS, credentials encrypted at rest, short-lived stream tokens
- **Child management**: admission numbers, classroom assignment, parent access approval workflow
- **Attendance**: check-in/check-out, late/absent tracking, parent notifications
- **Daily activities**: meals, naps, learning, play — timeline view for parents
- **Notifications**: in-app bell with unread count, pluggable email/SMS/push providers
- **Messaging**: parent ↔ teacher chat with read receipts
- **Announcements**: broadcast to all parents, classrooms, or selected users
- **Pickup authorization**: admin-approved authorized pickup contacts
- **Safety incidents**: teacher/admin reporting with severity levels
- **Audit logs**: camera access and sensitive actions logged

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router, Axios, React Hook Form, Zod |
| Backend | Node.js, Express, TypeScript, JWT, bcrypt, Mongoose |
| Database | MongoDB |
| Streaming | MediaMTX (RTSP → WebRTC/HLS) |
| Tests | Playwright (TypeScript) |

## Project Structure

```
LittleSteps/
├── frontend/          # React + TS + Vite + Tailwind
├── backend/           # Express + TS API
├── streaming/         # MediaMTX config + docs
├── tests/             # Playwright E2E tests
├── docker-compose.yml # MongoDB + MediaMTX + backend + frontend
└── README.md
```

## Quick Start (Docker — recommended)

```bash
# 1. Copy env files
cp backend/.env.example backend/.env
# Edit backend/.env — set JWT secrets, ENCRYPTION_KEY, MONGO_URI

# 2. Start everything
docker compose up --build

# 3. Seed the database
docker compose exec backend npm run seed
```

Open http://localhost:5173

**Seeded logins** (password: `Password123`):
- `admin@littlesteps.com` — Admin
- `teacher@littlesteps.com` — Teacher
- `parent@littlesteps.com` — Parent

## Quick Start (Local development)

### Prerequisites
- Node.js 20+
- MongoDB 7+ (local or Atlas)
- ffmpeg (optional, for simulated camera streams)

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env: set MONGO_URI, JWT secrets, ENCRYPTION_KEY
npm install
npm run dev          # http://localhost:5000
npm run seed         # seed demo data
```

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 (proxies /api → :5000)
```

### Streaming (MediaMTX)

```bash
# Option A: Docker
docker compose up mediamtx

# Option B: Local Windows binary — use the loopback-only configuration
.\mediamtx.exe .\streaming\mediamtx.local.yml
```

For the first authorized Hikvision test, open **NVR Management** and use the video action on the saved Hikvision NVR to add **channel 1 only**. Then open **Live Wall**; the single real NVR camera is selected first. HLS is served through the backend with a short-lived stream token. Do not expose MediaMTX's HLS or API ports publicly.

This milestone verifies one live camera only. Automatic channel discovery, multiple live streams, and recorded playback remain separate follow-up milestones.

### Simulated camera stream (no hardware)

```bash
ffmpeg -re -f lavfi -i testsrc=size=640x480:rate=15 \
       -c:v libx264 -preset ultrafast -tune zerolatency \
       -f rtsp rtsp://localhost:8554/sunshine-main
```

## Environment Variables

See `backend/.env.example` for all variables. Key ones:

| Variable | Purpose |
|----------|---------|
| `MONGO_URI` | MongoDB connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | JWT signing secrets (min 32 chars) |
| `ENCRYPTION_KEY` | 64-hex-char AES-256 key for camera credentials |
| `MEDIAMTX_*` | MediaMTX API/WebRTC/HLS URLs |
| `STREAM_TOKEN_SECRET` | Signs short-lived stream access tokens |

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## API Overview

Base URL: `/api`

| Module | Endpoints |
|--------|-----------|
| Auth | `POST /auth/register`, `/login`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password` |
| Children | `GET/POST /children`, `GET/PUT/DELETE /children/:id`, `POST /children/request-access` |
| Classrooms | `GET/POST /classrooms`, `GET/PUT/DELETE /classrooms/:id` |
| Cameras | `GET/POST /cameras`, `GET/PUT/DELETE /cameras/:id`, `GET /cameras/:id/stream-access` |
| Attendance | `GET /attendance`, `POST /attendance/check-in`, `/check-out`, `/status` |
| Activities | `GET/POST /activities`, `PUT/DELETE /activities/:id` |
| Notifications | `GET /notifications`, `PUT /notifications/:id/read`, `/read-all` |
| Messages | `GET /messages`, `POST /messages`, `GET /messages/conversations` |
| Announcements | `GET/POST /announcements`, `DELETE /announcements/:id` |
| Pickup | `GET/POST /pickup-authorizations`, `PUT /pickup-authorizations/:id/review` |
| Incidents | `GET/POST /incidents`, `PUT /incidents/:id` |
| Admin | `GET /admin/stats`, `/admin/users`, `/admin/relationships`, `/admin/reports/attendance` |

## Security

- Passwords hashed with bcrypt (cost 12)
- JWT access tokens (15 min) + httpOnly refresh token cookies (7 days)
- Role-based authorization on every route
- Parent-child relationship verification before any child data access
- Camera credentials AES-256-GCM encrypted at rest
- Short-lived signed stream tokens; raw RTSP URLs never exposed
- Helmet, CORS, rate limiting, input validation (Zod)
- Audit logging for camera access and sensitive actions

## Testing

```bash
cd tests
npm install
npx playwright install chromium
npm test
```

Tests cover auth flows, role-based redirects, parent dashboard, teacher attendance/activity, admin CRUD, and camera authorization.

The backend's focused NVR protocol test can be run with `cd backend && npm test`. It uses mock HTTP/RTSP services to verify Digest authentication and RTSP video-packet handling; it does not replace testing against an authorized physical NVR.

## Deployment

See `docs/DEPLOYMENT.md` for production deployment guide.

## License

MIT — for portfolio/educational purposes.
