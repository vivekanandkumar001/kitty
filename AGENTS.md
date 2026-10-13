# Kitty

Separated Architecture: **Flask REST API (backend/)** + **React / Vite SPA (frontend/)**.

## Development Servers

Run backend and frontend concurrently:

### 1. Backend (Flask REST API)
```bash
cd backend
pip install -r requirements.txt
python app.py          # http://127.0.0.1:7861 (override with PORT=...)
```

### 2. Frontend (React + Vite SPA)
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```
*Note: Vite dev server automatically proxies `/api` calls to the Flask backend running on `http://127.0.0.1:7861`.*

## Project Structure

- `backend/` — Flask REST API Server
  - `app.py` — Flask app with CORS enabled, security headers, and all `/api/*` endpoints
  - `models.py` — SQLAlchemy models (`User`, `Room`, `RoomMembership`, `Expense`, `ExpenseSplit`, `RecurringExpense`, `Settlement`, `Notification`)
  - `engine.py` — Pure calculation engine: split calculators, balance calculator, debt simplification (integer paise)
  - `tests/` — pytest integration test suite (107 tests, isolated in-memory DB)
  - `requirements.txt` — Python dependencies (Flask, Flask-Cors, psycopg2-binary, etc.)
  - `.env` — PostgreSQL connection string (`DATABASE_URL` / `postgresql_uri`)
- `frontend/` — React + Vite Single Page Application
  - `src/App.jsx` — Core SPA router connecting Auth, Rooms Dashboard, and Room Detail views
  - `src/api.js` — Client API helper with session credentials and CSV handling
  - `src/context/AuthContext.jsx` — User auth state, session check (`/api/auth/me`), and live notification polling
  - `src/context/ToastContext.jsx` — Micro-interaction toast alert notifications
  - `src/components/` — `Navbar.jsx`, `Modal.jsx`, `ProfileModal.jsx`
  - `src/pages/` — `AuthPage.jsx`, `RoomsDashboard.jsx`, `RoomView.jsx`
  - `src/index.css` — Modern design system (dark glassmorphism, responsive grid, micro-animations)
  - `vite.config.js` — Vite configuration with `/api` proxy forwarding to backend


## Pages & SEO

- `GET /` — public landing page (indexable; the SEO entry point)
- `GET /login` — auth page
- `GET /rooms`, `GET /room/<code>` — authed pages, marked `noindex, nofollow`
- `GET /robots.txt`, `GET /sitemap.xml` — generated from `SITE_URL`

Set `SITE_URL` in production (e.g. `https://roomsplit.example`) so canonical
URLs, Open Graph tags and the sitemap use the real host. Without it, the request
host is used.

## Notifications

In-app, DB-backed (`Notification`), no external provider. Server events call the
`notify(room, user_ids, kind, title, body, link, exclude_id)` helper in `app.py`;
the actor is always excluded. Endpoints: `GET /api/notifications` (returns
`{unread, items}` and lazily creates idempotent `recurring_due` reminders),
`POST /api/notifications/read` (mark all), `POST /api/notifications/<id>/read`.
The bell UI lives in `templates/_notifications.html` + `static/js/notifications.js`
and polls every 30s. All notification rows are scoped to the session's `user_id`.

## Conventions

- Responses are JSON; the browser never computes a balance — it only renders
  what `/api/*` returns. All money is integer paise and parsed server-side.
- Page JS reads the API via `window.RS.api` and reports status with
  `window.RS.toast`. Prefer updating the DOM over `alert()`.
- Build notification/user-supplied text with DOM APIs (`textContent`), not
  `innerHTML` — `RS.escapeHtml` does not escape quotes.
- Keep templates extending `base.html` and fill the SEO blocks
  (`title`, `description`, `robots`, `canonical`).
- Use double quotes in JS; keep JSX out of this project — there is none.

## Testing

```bash
python -m pytest tests/ -q
```

The suite binds an in-memory engine and disables rate limiting, so it is safe to
run against a live `roomsplit.db`.
