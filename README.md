# Kitty — Shared Expenses for Flats, PGs & Roommates

Built against the product spec, phase-1 + phase-2 core. Money is handled in
integer paise throughout (never floats) with a standalone, unit-tested
calculation engine (`engine.py`) — split calculators, balance calculator,
and a deterministic debt-simplification algorithm.

## What's built and working (tested end-to-end)
- **Auth:** signup/login with phone + 4-digit PIN, server-side session, PIN hashed (werkzeug)
- **Rooms:** create, join by invite code, member list, roles (owner/member)
- **Expenses:** equal / custom / percentage / attendance-based splits, categories, soft delete, dispute/resolve status
- **Balances:** live net balance per member, computed server-side only
- **Debt simplification:** greedy creditor/debtor matching — reduces N bilateral debts to a minimal transaction set, deterministic (same input → same output, for auditability)
- **Settlements:** full/partial payment recording, UPI deep link generation (`upi://pay?...`) when a member has set their UPI ID, settlement history
- **Recurring expenses:** templates (rent, wifi, maid, etc.) with one-click "generate this month"
- **Move-out settlement:** freezes the member (doesn't delete history), computes final payable/receivable = net balance + tracked deposit
- **Reports:** monthly CSV export (expenses + closing balances)
- **Dashboard:** month total, top categories, recent expenses, pending recurring bills
- **In-app notifications:** bell + unread badge in the app header with a dropdown panel. Server-generated on room events — expense added/deleted, dispute/resolve, settlement recorded, member join/move-out, deposit changed, and an idempotent "recurring bill due" reminder that clears once the bill is generated. The actor is never notified of their own action. Stored per user, marked read on open, background-polled (30s); no external services needed.
- **Server-rendered UI:** Flask + Jinja2, mobile-first. Ledger-ticket balance display, sticky tab nav (Home / Expenses / Balances / Recurring / Room), add-expense modal, toast notifications. IBM Plex Sans/Mono, hand-written CSS — no build step.
- **Public + SEO:** indexable landing page at `/`, per-page titles/descriptions/canonical, Open Graph + Twitter cards, `SoftwareApplication`/`FAQPage` JSON-LD, generated `robots.txt` and `sitemap.xml`. Private pages are `noindex`.

## Deliberately deferred (per spec's own "what not to build initially")
- **Real OTP/SMS auth** — needs a paid SMS provider account (Twilio/MSG91). Current PIN-based auth is the same security shape (hashed, server-validated, rate-limitable) — swapping in real OTP later is a contained change to `/api/auth/*` in `app.py`, not a redesign.
- **Receipt image upload** — needs object storage (S3-compatible). Add a `Receipt` model + upload endpoint when you're ready to wire storage.
- **Push/WhatsApp/email notifications** — the in-app notification feed (events, unread badge, panel) is built and DB-backed. Delivering it *outside* the app needs a background worker plus SMS/email/push credentials, so that's a pluggable sender on top of the existing `Notification` rows, not new logic.
- **Multiple rooms/account plans, PG/hostel B2B dashboard** — Phase 3 per the spec; build after the consumer loop is validated.

## Architecture & Run locally

Kitty is cleanly separated into two distinct layers:
1. **`backend/`**: Python Flask REST API server with PostgreSQL database, pure integer paise ledger, CORS support, and 107 automated pytest integration tests.
2. **`frontend/`**: Modern React + Vite Single Page Application (SPA) with a rich responsive design system, Lucide icons, and real-time debt calculation.

### Run Backend
```bash
cd backend
pip install -r requirements.txt
python app.py
# Server starts at http://127.0.0.1:7861
```

### Run Frontend
```bash
cd frontend
npm install
npm run dev
# App opens at http://localhost:5173 (auto-proxies /api to backend)
```

To run all backend tests:
```bash
cd backend
python -m pytest tests/ -q
```

## CI/CD Pipeline & Branch Strategy

The repository includes GitHub Actions CI/CD workflows tailored for two primary branches:

```
                  ┌──────────────────────┐
                  │  GitHub: kitty repo  │
                  └──────────┬───────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   ┌─────────────────┐               ┌─────────────────┐
   │ frontend branch │               │ backend branch  │
   │  (React + Vite) │               │ (Flask + PG API)│
   └────────┬────────┘               └────────┬────────┘
            │                                 │
     .github/workflows/               .github/workflows/
       frontend.yml                      backend.yml
            │                                 │
     • Node 20 setup                  • Python 3.11 setup
     • npm ci & test                  • PostgreSQL 16 Service Container
     • npm run build                  • Pytest suite (107 tests)
     • Artifact upload                • Docker container build
     • Deploy to Vercel/Netlify       • Deploy to Render/Railway/DockerHub
```

### 1. `frontend` Branch Workflow (`.github/workflows/frontend.yml`)
- **Triggers:** Pushes to `frontend` or `main` (when `frontend/**` changes), and Pull Requests.
- **CI Steps:**
  - Node.js 20 environment with npm cache
  - `npm ci` clean install
  - `npm run build` production bundling
  - Uploads `kitty-frontend-dist` artifact
- **CD Steps (Optional Deploy):**
  - If `VERCEL_TOKEN` is configured, automatically deploys to Vercel.
  - If `NETLIFY_AUTH_TOKEN` is configured, automatically deploys to Netlify.

### 2. `backend` Branch Workflow (`.github/workflows/backend.yml`)
- **Triggers:** Pushes to `backend` or `main` (when `backend/**` changes), and Pull Requests.
- **CI Steps:**
  - Spawns an isolated PostgreSQL 16 service container
  - Sets up Python 3.11 with pip cache
  - Installs requirements (`pip install -r backend/requirements.txt`)
  - Runs full 107-test suite against PostgreSQL (`pytest tests/ -v`)
  - Tests Docker container build (`docker build -t kitty-backend ./backend`)
- **CD Steps (Optional Deploy):**
  - Triggers Render deploy webhook (`RENDER_DEPLOY_HOOK`)
  - Triggers Railway deploy webhook (`RAILWAY_DEPLOY_HOOK`)
  - Or publishes Docker image to Docker Hub (`DOCKERHUB_USERNAME` & `DOCKERHUB_TOKEN`)

## Deployment Options

### Backend Deployment (Render / Railway / Docker)
1. Point your service to the `backend` branch (or `backend/` folder on `main`).
2. Set Build Command: `pip install -r backend/requirements.txt`
3. Set Start Command: `gunicorn --bind 0.0.0.0:$PORT --workers 2 app:app` (working directory `backend/`)
4. Set Environment Variables:
   - `DATABASE_URL`: PostgreSQL connection string (Neon / Supabase / Render Postgres)
   - `SECRET_KEY`: Long random secret token
   - `FRONTEND_URL`: URL of your deployed frontend (for CORS and session cookies)

### Frontend Deployment (Vercel / Netlify / Cloudflare Pages)
1. Point your project to the `frontend` branch (or `frontend/` folder on `main`).
2. Framework Preset: **Vite**
3. Root Directory: `frontend`
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Set Environment Variables:
   - `VITE_API_URL`: Your live backend URL (e.g. `https://kitty-api.onrender.com`)

## Security notes already in place
- Every room-scoped API checks active membership before returning data (`get_membership_or_403`).
- Every user id in a request (payer, split members, settlement `from_user`/`to_user`, recurring payer) is validated against the room's active members, so a crafted payload can't write a row that corrupts balances or 500s the whole room.
- Invite codes use a CSPRNG (`secrets`) and are checked for collision.
- PINs are hashed (werkzeug/scrypt), never stored or logged in plaintext.
- Auth is rate-limited per IP (Flask-Limiter) **and** the account is locked out after repeated failed logins.
- Response security headers on every request: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, and a nonce-based `Content-Security-Policy`.
- UPI IDs are format-validated and percent-encoded into `upi://` links; the app never interpolates a user-supplied URL into HTML.
- CSV export neutralises spreadsheet formula injection, and the `month` parameter is validated.
- Sessions use `HttpOnly`, `SameSite=Strict` cookies and are cleared on login/signup (no fixation); member phone numbers are not exposed to other members.
- All money is integer paise, validated and computed server-side — the frontend never calculates a balance, it only displays what the API returns.
- Soft deletes on expenses (audit trail preserved, matches spec's "freeze don't delete" principle).
- Notifications are scoped to their owner: `/api/notifications/*` only ever reads or marks rows whose `user_id` matches the session, so one member can't read or clear another's feed.

**Before going live:** set a real `SECRET_KEY` and `SITE_URL`; set `SESSION_COOKIE_SECURE=true` (HTTPS is terminated by HF Spaces/Render); if you deploy behind a proxy/load balancer, set `TRUST_PROXY=true` so rate limiting keys on the real client IP instead of the proxy's. The per-account login lockout is in-process — keep gunicorn at a single worker or move it to shared storage (Redis) if you scale out. CSRF protection can be added if you ever introduce non-JSON form posts (today the API is JSON + `SameSite=Strict`, which already blocks cross-site posts).

## Monetization (per spec's own recommendation, unchanged)
Consumer freemium (1 free room, paid tier for multiple rooms + extended history + exports) is the right first model — this is a private utility with low per-room organic traffic, so ads don't fit well here. The stronger long-term revenue is the B2B PG/hostel operator dashboard once the consumer loop is validated — don't build that until you have real usage data justifying it.
