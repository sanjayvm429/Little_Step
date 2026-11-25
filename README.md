# LittleSteps — Smart Nursery & Childcare Monitoring Platform

A full-stack platform for nurseries, preschools and daycares that lets parents securely monitor their children via authorized live camera streams and stay updated on attendance, activities, messages and safety.

## Features

- **Role-based access**: Parent, Teacher, Admin portals with JWT auth (access + refresh tokens)
- **Live camera monitoring**: RTSP → MediaMTX → WebRTC/HLS, credentials encrypted at rest, short-lived stream tokens
- **Child management**: admission numbers, classroom assignment, parent access approval workflow
- **Attendance**: check-in/check-out, late/absent tracking, parent notifications
- **Employee face attendance**: admin-only employee enrollment, YuNet/SFace recognition, camera purpose mapping, and SQLite attendance
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
| Face recognition | Python, OpenCV, YuNet, SFace, FastAPI |
| Employee biometrics | SQLite (AES-GCM protected face templates and images) |
| Tests | Playwright (TypeScript) |

## Project Structure

```
LittleSteps/
├── frontend/          # React + TS + Vite + Tailwind
├── backend/           # Express + TS API
├── face-service/      # Python/OpenCV recognition worker + private SQLite data
├── streaming/         # MediaMTX config + docs
├── tests/             # Playwright E2E tests
├── docker-compose.yml # MongoDB + MediaMTX + backend + frontend
└── README.md
```

## Quick Start (Docker — recommended)

```bash
# 1. Copy the backend environment template and set unique secrets
cp backend/.env.example backend/.env
# Generate FACE_SERVICE_SECRET with: python -c "import secrets; print(secrets.token_urlsafe(32))"
# Generate FACE_DATA_ENCRYPTION_KEY with: python -c "import secrets; print(secrets.token_hex(32))"
# Use these values in backend/.env; keep them private and back up the encryption key securely.

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

### Face service (local development)

Use the same `FACE_SERVICE_SECRET` and `FACE_DATA_ENCRYPTION_KEY` values as `backend/.env` in `face-service/.env`. Configure `FACE_SERVICE_URL=http://127.0.0.1:8001` and `FACE_SERVICE_RTSP_BASE_URL=rtsp://127.0.0.1:8554` in the backend environment.

```powershell
cd face-service
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --host 127.0.0.1 --port 8001 --no-access-log
```

In another terminal, start MediaMTX and the backend. The face service reads the existing camera's MediaMTX path; it does not receive NVR credentials or create a second NVR connection.

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

For the first authorized Hikvision test, open **NVR Management** and use the video action on the saved Hikvision NVR to add **channel 1 only**. Then open **Live Wall**; the single real NVR camera is selected first. MediaMTX keeps HLS muxers ready for online paths to avoid first-viewer startup delays. HLS is served through the backend with a short-lived stream token that live players renew before expiry; transient failures retry with capped backoff. Do not expose MediaMTX's HLS or API ports publicly.

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
| `FACE_SERVICE_SECRET` | Shared backend-to-face-service authentication key (32+ random characters) |
| `FACE_DATA_ENCRYPTION_KEY` | 32-byte hexadecimal AES-GCM key for face templates, images, and pending registration data |
| `FACE_SERVICE_RTSP_BASE_URL` | Private MediaMTX RTSP base visible to the Python service |

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
| Employee face attendance | `/face/employees`, `/face/registration-links`, `/face/cameras`, `/face/attendance`, `/face/recognition/status` (admin only) |
| Mobile enrollment | `POST /face/mobile-registration/info`, `POST /face/mobile-registration/submit` (single-use token only) |

## Employee face attendance

Administrators use **Register User** to create an employee record, validate or capture front/left/right images, view and update employees, deactivate an employee, remove face data, or generate a single-use mobile enrollment link and QR code. The public mobile page uses the token in the URL fragment so it is not sent in HTTP requests or access logs. Mobile enrollment requires a reachable HTTPS `CLIENT_URL` in every environment; HTTP and localhost links are rejected because mobile camera access requires a secure context.

**Face Attendance** maps existing dashboard cameras to check-in, check-out, or monitoring-only and displays worker/stream health, employee attendance, recent recognition events, and unknown detections. Check-in/out use the camera's configured purpose, confidence threshold, attendance state, and cooldown. Unknown faces are logged but never registered.

The existing child attendance workflow remains in MongoDB and is unchanged. Employee face templates, private face images, camera-purpose mappings, registration links, and employee attendance live in the face service's SQLite database. Templates, stored face images, pending mobile-registration details, and unknown snapshots are AES-GCM encrypted using `FACE_DATA_ENCRYPTION_KEY`; the key must be retained for as long as that data is needed. The Python service is private to the application network and is not published as a public port.

Configure cameras first in the existing NVR/Camera Management pages. Then choose their purpose in **Face Attendance**. The worker consumes their existing MediaMTX paths, processes frames at the configured interval, and reconnects on stream failure. Tune the SFace cosine threshold against real authorized CCTV footage before enabling attendance processing; the default is a starting point, not a camera-validated accuracy guarantee.

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
