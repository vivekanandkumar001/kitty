# RoomSplit — Shared Expenses for Flats, PGs & Roommates

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
- **Mobile-first UI:** utility-app aesthetic (IBM Plex Sans/Mono, ledger-ticket balance display), tab nav: Dashboard / Expenses / Add / Balances / Recurring / Room

## Deliberately deferred (per spec's own "what not to build initially")
- **Real OTP/SMS auth** — needs a paid SMS provider account (Twilio/MSG91). Current PIN-based auth is the same security shape (hashed, server-validated, rate-limitable) — swapping in real OTP later is a contained change to `/api/auth/*` in `app.py`, not a redesign.
- **Receipt image upload** — needs object storage (S3-compatible). Add a `Receipt` model + upload endpoint when you're ready to wire storage.
- **Push/WhatsApp notifications** — needs a background worker + a messaging API. The data (due dates, pending recurring, outstanding balances) is already computed and available via the dashboard endpoint, so notifications are a delivery layer on top, not new logic.
- **Multiple rooms/account plans, PG/hostel B2B dashboard** — Phase 3 per the spec; build after the consumer loop is validated.

## Run locally
```bash
pip install -r requirements.txt
python app.py
# open http://localhost:7860
```

## Deploy — Hugging Face Spaces (Docker SDK, same pattern as your other Spaces)
1. New Space → SDK: Docker → Public.
2. Push `app.py`, `models.py`, `engine.py`, `templates/`, `static/`, `requirements.txt`, `Dockerfile`.
3. **Set a real `SECRET_KEY` env var in the Space's settings** — the code falls back to a dev key that must not be used in production (sessions can be forged otherwise).
4. Same storage caveat as before: HF Spaces free tier resets on rebuild. Move `SQLALCHEMY_DATABASE_URI` to a free Postgres (Neon/Supabase) before real users rely on this — a room's expense history disappearing is a much bigger deal here than in a wedding planner.

## Deploy — Render.com (alternative, Postgres-friendly)
1. New Web Service → Build: `pip install -r requirements.txt` → Start: `gunicorn app:app --bind 0.0.0.0:$PORT`
2. Add a free Render Postgres instance, point `SQLALCHEMY_DATABASE_URI` at it, set `SECRET_KEY`.

## Upgrading SQLite → PostgreSQL (do this before real usage)
Only `app.py`'s `SQLALCHEMY_DATABASE_URI` line changes:
```python
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL", "sqlite:///...")
```
Point `DATABASE_URL` at your Postgres instance (`postgresql://user:pass@host/dbname`).
SQLAlchemy models are already database-agnostic — no other code changes needed.

## Security notes already in place
- Every room-scoped API checks active membership before returning data (`get_membership_or_403`)
- Invite codes are random 6-char alphanumeric, checked for collision
- PINs are hashed, never stored or logged in plaintext
- All money validated and computed server-side — the frontend never calculates a balance, it only displays what the API returns
- Soft deletes on expenses (audit trail preserved, matches spec's "freeze don't delete" principle)

**Not yet done, do before going live:** rate-limiting on `/api/auth/login` (currently unlimited attempts — add Flask-Limiter), HTTPS termination (handled automatically by HF Spaces/Render), and CSRF protection if you add any non-JSON form posts later.

## Monetization (per spec's own recommendation, unchanged)
Consumer freemium (1 free room, paid tier for multiple rooms + extended history + exports) is the right first model — this is a private utility with low per-room organic traffic, so ads don't fit well here. The stronger long-term revenue is the B2B PG/hostel operator dashboard once the consumer loop is validated — don't build that until you have real usage data justifying it.
