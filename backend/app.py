import os
import csv
import io
import re
import secrets
import time
import sys
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import datetime, date
from functools import wraps
from urllib.parse import quote

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from flask import (Flask, request, jsonify, render_template, session, redirect,
                   url_for, Response, g)
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_cors import CORS
from dotenv import load_dotenv

from models import (db, User, Room, RoomMembership, Expense, ExpenseSplit,
                     RecurringExpense, Settlement, Notification,
                     CATEGORIES, SPLIT_TYPES, gen_code)
from engine import compute_split, compute_balances, simplify_debts, SplitError

# Load environment variables from backend/.env
load_dotenv(os.path.join(BASE_DIR, ".env"))

app = Flask(__name__)

# ─── CORS: Allowed origins ───────────────────────────────────────────────────
_default_origins = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:4173", "http://127.0.0.1:4173"
]
_env_origins = os.environ.get("CORS_ORIGINS") or os.environ.get("FRONTEND_URL")
if _env_origins:
    _allowed_origins = [o.strip() for o in _env_origins.split(",") if o.strip()]
else:
    _allowed_origins = _default_origins

CORS(app, supports_credentials=True, origins=_allowed_origins)

# ─── Database: PostgreSQL ────────────────────────────────────────────────────
db_uri = (os.environ.get("DATABASE_URL")
          or os.environ.get("postgresql_uri")
          or os.environ.get("SQLALCHEMY_DATABASE_URI"))

if not db_uri:
    if os.environ.get("TESTING") == "true":
        db_uri = "sqlite:///:memory:"
    else:
        raise RuntimeError(
            "PostgreSQL connection URI is required. Please set 'DATABASE_URL' or 'postgresql_uri' in backend/.env"
        )

# Fix for services using postgres:// or generic postgresql:// scheme
if db_uri.startswith("postgres://"):
    db_uri = db_uri.replace("postgres://", "postgresql+psycopg2://", 1)
elif db_uri.startswith("postgresql://") and not db_uri.startswith("postgresql+"):
    db_uri = db_uri.replace("postgresql://", "postgresql+psycopg2://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = db_uri
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_pre_ping": True,
    "pool_recycle": 300,
}

# ─── Security: SECRET_KEY enforcement ────────────────────────────────────────
_secret_key = os.environ.get("SECRET_KEY")
if not _secret_key:
    if os.environ.get("FLASK_ENV") == "production" or os.environ.get("ENVIRONMENT") == "production":
        raise RuntimeError(
            "SECRET_KEY environment variable must be set in production. "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    _secret_key = "dev-secret-change-in-production"
app.config["SECRET_KEY"] = _secret_key

# ─── Security: Session cookie flags ──────────────────────────────────────────
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = os.environ.get("SESSION_COOKIE_SECURE", "false").lower() == "true"

# ─── Dev: reload Jinja templates without restarting the server ────────────────
_is_production = (os.environ.get("FLASK_ENV") == "production"
                  or os.environ.get("ENVIRONMENT") == "production")
if not _is_production:
    app.config["TEMPLATES_AUTO_RELOAD"] = True

# ─── Security: reverse-proxy awareness ───────────────────────────────────────
if os.environ.get("TRUST_PROXY", "false").lower() in ("1", "true", "yes"):
    from werkzeug.middleware.proxy_fix import ProxyFix
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# ─── Security: Rate limiting ─────────────────────────────────────────────────
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["5000 per day", "1000 per hour"],
    storage_uri=os.environ.get("RATELIMIT_STORAGE_URI", "memory://"),
)

db.init_app(app)

with app.app_context():
    db.create_all()


# ─── Security: response headers + per-request CSP nonce ──────────────────────
# Inline <script> tags must carry the nonce, so an injected script or inline
# event handler cannot execute even if a value ever slips through unescaped.
@app.before_request
def _issue_csp_nonce():
    g.csp_nonce = secrets.token_urlsafe(16)


@app.after_request
def _security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
    if resp.mimetype == "text/html":
        nonce = getattr(g, "csp_nonce", "")
        resp.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; "
            "img-src 'self' data:; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            f"script-src 'self' 'nonce-{nonce}'; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        )
    return resp


# ─── SEO / site metadata ─────────────────────────────────────────────────────
SITE_NAME = os.environ.get("SITE_NAME", "Kitty")
SITE_TAGLINE = os.environ.get("SITE_TAGLINE", "Split rent, bills and groceries with your flatmates — pool into the kitty.")
CURRENCY_CODE = os.environ.get("DEFAULT_CURRENCY", "INR")
CURRENCY_SYMBOL = os.environ.get("CURRENCY_SYMBOL", "₹")
# Set SITE_URL in production (e.g. https://kitty.app) so canonical URLs,
# sitemap.xml and Open Graph tags use the real host instead of the request host.
_configured_site_url = os.environ.get("SITE_URL", "").rstrip("/")

FAQ_ITEMS = [
    {
        "q": "What is Kitty?",
        "a": "Kitty is a free shared-expense tracker for flats, PGs and hostels. "
             "Log rent, electricity, wifi, maid and grocery bills once, and everyone's "
             "balance is calculated automatically.",
    },
    {
        "q": "How does Kitty split expenses?",
        "a": "Every expense can be split equally, by custom amounts, by percentage, or by "
             "attendance (only the people present that day). Balances are always computed "
             "on the server so members can't drift out of sync.",
    },
    {
        "q": "Does Kitty work without everyone installing an app?",
        "a": "Yes. Kitty runs in the browser. Share the room's invite code and your "
             "flatmates can join from any phone in seconds — there's nothing to install.",
    },
    {
        "q": "How do we settle up?",
        "a": "Kitty shows exactly who owes whom using the fewest possible transactions. "
             "Record a payment, or tap the UPI link to pay straight from your banking app.",
    },
    {
        "q": "Is Kitty really free?",
        "a": "Yes, the core tracker — unlimited roommates, every split type, balances, "
             "debt simplification and CSV exports — is free to use.",
    },
]


@app.context_processor
def inject_site_metadata():
    """Expose SEO/site values to every template."""
    base = _configured_site_url or request.url_root.rstrip("/")
    return {
        "site_name": SITE_NAME,
        "site_tagline": SITE_TAGLINE,
        "site_url": base,
        "canonical_url": base + request.path,
        "current_year": date.today().year,
        "csp_nonce": getattr(g, "csp_nonce", ""),
    }


# ─── Money parsing ───────────────────────────────────────────────────────────
# Guard-rail: no single line item may exceed 1 crore by default. Stops
# absurd payloads (and float overflow) from reaching the ledger.
MAX_AMOUNT_MINOR = int(os.environ.get("MAX_AMOUNT_MINOR", 1_000_000_000))


def to_minor(rupees):
    """Rupees (int/str/Decimal/float) -> integer paise, via Decimal so there is
    no binary-float drift. Raises ValueError for anything not a finite,
    in-range number. Always go through this, never compute with floats."""
    try:
        value = Decimal(str(rupees).strip())
    except (InvalidOperation, ValueError, TypeError, AttributeError):
        raise ValueError("Not a valid amount.")
    if not value.is_finite():
        raise ValueError("Not a valid amount.")
    minor = int((value * 100).to_integral_value(rounding=ROUND_HALF_UP))
    if abs(minor) > MAX_AMOUNT_MINOR:
        raise ValueError("Amount is too large.")
    return minor


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        uid = session.get("user_id")
        # Resolve the account, not just the session key: a stale cookie can
        # outlive its user (e.g. the account was deleted), and every handler
        # downstream assumes current_user() is a real row.
        user = User.query.get(uid) if uid else None
        if user is None:
            session.clear()
            if request.path.startswith("/api/"):
                return jsonify({"error": "Not authenticated"}), 401
            return redirect(url_for("login_page"))
        return f(*args, **kwargs)
    return wrapper


def current_user():
    uid = session.get("user_id")
    return User.query.get(uid) if uid else None


def get_membership_or_403(room, user):
    m = RoomMembership.query.filter_by(room_id=room.id, user_id=user.id, status="active").first()
    return m


def active_member_ids(room):
    """user_ids of members currently active in the room."""
    return {m.user_id for m in room.active_members()}


def all_member_ids(room):
    """user_ids of everyone who has ever belonged to the room (incl. exited)."""
    return {m.user_id for m in room.memberships}


def room_or_404(code):
    return Room.query.filter_by(code=code.upper()).first()


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
def _inr(minor):
    """Format integer minor units as a currency string for notification text."""
    return f"{CURRENCY_SYMBOL}{minor / 100:.2f}"


def notify(room, user_ids, kind, title, body="", link="", exclude_id=None):
    """Queue an in-app notification for each recipient, skipping the actor.
    Rows are committed by the caller together with the action that caused them."""
    for uid in set(user_ids):
        if exclude_id is not None and uid == exclude_id:
            continue
        db.session.add(Notification(
            user_id=uid,
            room_id=room.id if room else None,
            kind=kind,
            title=title[:200],
            body=body[:400],
            link=link[:300],
        ))


def _ensure_recurring_reminders(user):
    """Lazily create an idempotent 'bill due' notification for every active room
    where this month's recurring template hasn't been generated yet."""
    this_month = date.today().strftime("%Y-%m")
    memberships = RoomMembership.query.filter_by(user_id=user.id, status="active").all()
    created = False
    for m in memberships:
        room = m.room
        if room is None:
            continue
        due = [r for r in room.recurring if r.active and r.last_generated_month != this_month]
        if not due:
            continue
        key = f"recurring:{room.id}:{this_month}:{user.id}"
        if Notification.query.filter_by(user_id=user.id, dedupe_key=key).first():
            continue
        names = ", ".join(r.name for r in due[:3])
        if len(due) > 3:
            names += f" +{len(due) - 3} more"
        db.session.add(Notification(
            user_id=user.id, room_id=room.id, kind="recurring_due",
            title=f"Recurring bill due in {room.name}"[:200],
            body=f"{names} — generate this month's expense."[:400],
            link=f"/room/{room.code}",
            dedupe_key=key,
        ))
        created = True
    if created:
        db.session.commit()


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------
@app.route("/")
def landing_page():
    """Public, indexable marketing page (SEO entry point)."""
    if current_user():
        return redirect(url_for("rooms_page"))
    return render_template("landing.html", faqs=FAQ_ITEMS)


@app.route("/robots.txt")
def robots_txt():
    lines = [
        "User-agent: *",
        "Allow: /",
        "Disallow: /rooms",
        "Disallow: /room/",
        "Disallow: /api/",
        f"Sitemap: {_site_base()}/sitemap.xml",
    ]
    return Response("\n".join(lines) + "\n", mimetype="text/plain")


@app.route("/sitemap.xml")
def sitemap_xml():
    base = _site_base()
    pages = [("/", "1.0"), ("/login", "0.4")]
    urls = "".join(
        f"  <url><loc>{base}{path}</loc><changefreq>weekly</changefreq>"
        f"<priority>{priority}</priority></url>\n"
        for path, priority in pages
    )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{urls}"
        "</urlset>\n"
    )
    return Response(xml, mimetype="application/xml")


def _site_base():
    return _configured_site_url or request.url_root.rstrip("/")


@app.route("/login")
def login_page():
    if current_user():
        return redirect(url_for("rooms_page"))
    return render_template("login.html")


@app.route("/rooms")
@login_required
def rooms_page():
    return render_template("rooms.html", user=current_user().to_dict())


@app.route("/room/<code>")
@login_required
def room_page(code):
    room = room_or_404(code)
    if not room:
        return redirect(url_for("rooms_page"))
    if not get_membership_or_403(room, current_user()):
        return redirect(url_for("rooms_page"))
    return render_template("room.html", user=current_user().to_dict(), room=room.to_dict(),
                            categories=CATEGORIES)


# ---------------------------------------------------------------------------
# Auth API — phone + PIN (see README for the OTP upgrade path)
# ---------------------------------------------------------------------------
PHONE_RE = re.compile(r"^\d{10,15}$")
UPI_RE = re.compile(r"^[A-Za-z0-9._\-]{2,64}@[A-Za-z][A-Za-z0-9]{1,32}$")

# Per-account login lockout, on top of the per-IP limiter. In-process only —
# correct for the single-worker gunicorn config in the Dockerfile; use shared
# storage (e.g. Redis) if you ever scale to multiple workers.
_LOGIN_FAILS = {}
LOGIN_MAX_FAILS = 10
LOGIN_WINDOW_SECONDS = 15 * 60


def _login_locked(phone):
    entry = _LOGIN_FAILS.get(phone)
    if not entry:
        return False
    if time.time() - entry[1] > LOGIN_WINDOW_SECONDS:
        _LOGIN_FAILS.pop(phone, None)
        return False
    return entry[0] >= LOGIN_MAX_FAILS


def _record_login_fail(phone):
    now = time.time()
    entry = _LOGIN_FAILS.get(phone)
    if not entry or now - entry[1] > LOGIN_WINDOW_SECONDS:
        _LOGIN_FAILS[phone] = [1, now]
    else:
        entry[0] += 1


@app.route("/api/auth/signup", methods=["POST"])
@limiter.limit("20 per hour")
def signup():
    data = request.get_json(force=True) or {}
    name = (data.get("name") or "").strip()[:120]
    phone = (data.get("phone") or "").strip()
    pin = (data.get("pin") or "").strip()
    if not name or not PHONE_RE.match(phone) or len(pin) != 4 or not pin.isdigit():
        return jsonify({"error": "Enter a name, a valid phone number and a 4-digit PIN."}), 400
    if User.query.filter_by(phone=phone).first():
        return jsonify({"error": "This phone number is already registered. Try logging in."}), 409
    user = User(name=name, phone=phone)
    user.set_pin(pin)
    db.session.add(user)
    db.session.commit()
    session.clear()  # avoid session fixation
    session["user_id"] = user.id
    return jsonify(user.to_dict()), 201


@app.route("/api/auth/login", methods=["POST"])
@limiter.limit("10 per minute")
def login():
    data = request.get_json(force=True) or {}
    phone = (data.get("phone") or "").strip()
    pin = (data.get("pin") or "").strip()
    if _login_locked(phone):
        return jsonify({"error": "Too many failed attempts. Try again in a few minutes."}), 429
    user = User.query.filter_by(phone=phone).first()
    if not user or not user.check_pin(pin):
        _record_login_fail(phone)
        return jsonify({"error": "Invalid phone or PIN."}), 401
    _LOGIN_FAILS.pop(phone, None)
    session.clear()  # avoid session fixation
    session["user_id"] = user.id
    return jsonify(user.to_dict())


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok", "service": "Kitty API"})


@app.route("/api/categories", methods=["GET"])
def list_categories():
    return jsonify({
        "categories": CATEGORIES,
        "split_types": SPLIT_TYPES,
        "currency": CURRENCY_CODE,
        "currency_symbol": CURRENCY_SYMBOL,
    })


@app.route("/api/auth/me", methods=["GET", "PUT"])
@login_required
def update_profile():
    user = current_user()
    if request.method == "PUT":
        data = request.get_json(force=True) or {}
        if "name" in data and data["name"]:
            user.name = data["name"].strip()[:120]
        if "upi_id" in data:
            upi = (data["upi_id"] or "").strip()
            # Reject anything that isn't a plausible VPA before storing it — the
            # value ends up inside a upi:// payment URL.
            if upi and not UPI_RE.match(upi):
                return jsonify({"error": "That doesn't look like a valid UPI ID (e.g. name@okhdfcbank)."}), 400
            user.upi_id = upi
        db.session.commit()
    return jsonify(user.to_dict())


# ---------------------------------------------------------------------------
# Room API
# ---------------------------------------------------------------------------
@app.route("/api/rooms", methods=["GET"])
@login_required
def list_my_rooms():
    user = current_user()
    memberships = RoomMembership.query.filter_by(user_id=user.id, status="active").all()
    return jsonify([m.room.to_dict() for m in memberships])


@app.route("/api/rooms", methods=["POST"])
@login_required
def create_room():
    user = current_user()
    data = request.get_json(force=True) or {}
    name = (data.get("name") or "").strip()[:120] or "My Room"
    room = Room(code=gen_code(), name=name, created_by=user.id)
    db.session.add(room)
    db.session.flush()
    membership = RoomMembership(room_id=room.id, user_id=user.id, role="owner")
    db.session.add(membership)
    db.session.commit()
    return jsonify(room.to_dict()), 201


@app.route("/api/rooms/join", methods=["POST"])
@login_required
def join_room():
    user = current_user()
    data = request.get_json(force=True) or {}
    code = (data.get("code") or "").strip().upper()
    room = room_or_404(code)
    if not room:
        return jsonify({"error": "Invalid room code."}), 404
    existing = RoomMembership.query.filter_by(room_id=room.id, user_id=user.id).first()
    # Notify the members who were already active *before* this request.
    recipients = active_member_ids(room)
    if existing:
        if existing.status == "exited":
            existing.status = "active"
            existing.exited_at = None
            notify(room, recipients, "member_joined",
                   f"{user.name} rejoined {room.name}", "",
                   link=f"/room/{room.code}", exclude_id=user.id)
            db.session.commit()
        return jsonify(room.to_dict())
    notify(room, recipients, "member_joined",
           f"{user.name} joined {room.name}", "",
           link=f"/room/{room.code}", exclude_id=user.id)
    membership = RoomMembership(room_id=room.id, user_id=user.id, role="member")
    db.session.add(membership)
    db.session.commit()
    return jsonify(room.to_dict()), 201


@app.route("/api/rooms/<code>/members", methods=["GET"])
@login_required
def list_members(code):
    room = room_or_404(code)
    if not room or not get_membership_or_403(room, current_user()):
        return jsonify({"error": "Not found"}), 404
    return jsonify([m.to_dict() for m in room.memberships])


@app.route("/api/rooms/<code>/members/<int:user_id>/exit", methods=["POST"])
@login_required
def exit_member(code, user_id):
    """Freeze a member's historical transactions and return their final
    settlement figure instead of deleting anything (per spec: freeze, don't delete)."""
    room = room_or_404(code)
    caller = current_user()
    caller_membership = get_membership_or_403(room, caller) if room else None
    if not room or not caller_membership:
        return jsonify({"error": "Not found"}), 404

    # You may move yourself out; only the room owner may move someone else out.
    if user_id != caller.id and caller_membership.role != "owner":
        return jsonify({"error": "Only the room owner can mark another member as moved out."}), 403

    membership = RoomMembership.query.filter_by(room_id=room.id, user_id=user_id, status="active").first()
    if not membership:
        return jsonify({"error": "Member not found or already exited."}), 404

    balances = _room_balances(room)
    net = balances.get(user_id, 0)
    deposit = membership.deposit_minor or 0
    final_amount_minor = net + deposit  # deposit returned on top of/against their balance

    membership.status = "exited"
    membership.exited_at = datetime.utcnow()
    leaver_name = membership.user.name if membership.user else "A member"
    notify(
        room, active_member_ids(room), "member_exited",
        f"{leaver_name} moved out of {room.name}",
        f"Final settlement: {_inr(final_amount_minor)}",
        link=f"/room/{room.code}", exclude_id=caller.id,
    )
    db.session.commit()

    return jsonify({
        "user_id": user_id,
        "net_balance_minor": net,
        "deposit_minor": deposit,
        "final_settlement_minor": final_amount_minor,
        "final_settlement": final_amount_minor / 100,
        "note": ("Positive = room owes this member this much. "
                 "Negative = this member owes the room this much before leaving."),
    })


@app.route("/api/rooms/<code>/members/<int:user_id>/deposit", methods=["PUT"])
@login_required
def set_deposit(code, user_id):
    room = room_or_404(code)
    caller = current_user()
    caller_membership = get_membership_or_403(room, caller) if room else None
    if not room or not caller_membership:
        return jsonify({"error": "Not found"}), 404

    # You may set your own deposit; only the room owner may set someone else's.
    if user_id != caller.id and caller_membership.role != "owner":
        return jsonify({"error": "Only the room owner can change another member's deposit."}), 403

    membership = RoomMembership.query.filter_by(room_id=room.id, user_id=user_id).first()
    if not membership:
        return jsonify({"error": "Member not found"}), 404
    data = request.get_json(force=True) or {}
    try:
        deposit = to_minor(data.get("deposit", 0))
    except (ValueError, TypeError):
        return jsonify({"error": "Enter a valid deposit amount."}), 400
    if deposit < 0:
        return jsonify({"error": "Deposit cannot be negative."}), 400
    previous = membership.deposit_minor or 0
    membership.deposit_minor = deposit
    if user_id != caller.id and deposit != previous:
        notify(
            room, [user_id], "deposit_changed",
            f"{caller.name} updated your deposit",
            f"New deposit: {_inr(deposit)}",
            link=f"/room/{room.code}",
        )
    db.session.commit()
    return jsonify(membership.to_dict())


# ---------------------------------------------------------------------------
# Expense API
# ---------------------------------------------------------------------------
@app.route("/api/rooms/<code>/expenses", methods=["GET"])
@login_required
def list_expenses(code):
    room = room_or_404(code)
    if not room or not get_membership_or_403(room, current_user()):
        return jsonify({"error": "Not found"}), 404
    expenses = (Expense.query.filter_by(room_id=room.id, deleted=False)
                .order_by(Expense.expense_date.desc(), Expense.id.desc()).all())
    return jsonify([e.to_dict() for e in expenses])


@app.route("/api/rooms/<code>/expenses", methods=["POST"])
@login_required
def add_expense(code):
    room = room_or_404(code)
    user = current_user()
    if not room or not get_membership_or_403(room, user):
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(force=True) or {}

    active_ids = active_member_ids(room)
    if not active_ids:
        return jsonify({"error": "This room has no active members."}), 400

    try:
        amount_minor = to_minor(data.get("amount", 0))
    except (ValueError, TypeError):
        return jsonify({"error": "Enter a valid amount."}), 400
    if amount_minor <= 0:
        return jsonify({"error": "Amount must be greater than zero."}), 400

    split_type = data.get("split_type", "equal")
    if split_type not in SPLIT_TYPES:
        return jsonify({"error": f"Unknown split type: {split_type}"}), 400

    try:
        paid_by = int(data.get("paid_by") or user.id)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid payer."}), 400
    # Every id that lands in the ledger must belong to the room — an unknown
    # payer/splitter would otherwise corrupt balances and 500 the whole room.
    if paid_by not in active_ids:
        return jsonify({"error": "The payer must be an active member of this room."}), 400

    try:
        if split_type == "equal":
            user_ids = [int(u) for u in (data.get("user_ids") or sorted(active_ids))]
            if not set(user_ids) <= active_ids:
                return jsonify({"error": "Everyone in the split must be an active member of this room."}), 400
            splits = compute_split("equal", amount_minor, user_ids=user_ids)
        elif split_type == "custom":
            shares = {int(k): to_minor(v) for k, v in (data.get("shares") or {}).items()}
            if not set(shares) <= active_ids:
                return jsonify({"error": "Everyone in the split must be an active member of this room."}), 400
            splits = compute_split("custom", amount_minor, shares=shares)
        elif split_type == "percentage":
            pct = {int(k): float(v) for k, v in (data.get("percentages") or {}).items()}
            if not set(pct) <= active_ids:
                return jsonify({"error": "Everyone in the split must be an active member of this room."}), 400
            splits = compute_split("percentage", amount_minor, percentages=pct)
        else:  # attendance
            present = [int(u) for u in (data.get("present_user_ids") or [])]
            if not present or not set(present) <= active_ids:
                return jsonify({"error": "Everyone marked present must be an active member of this room."}), 400
            splits = compute_split("attendance", amount_minor, present_user_ids=present)
    except SplitError as e:
        return jsonify({"error": str(e)}), 400
    except (ValueError, TypeError, KeyError):
        return jsonify({"error": "Invalid split input."}), 400

    if data.get("expense_date"):
        try:
            expense_date = datetime.strptime(str(data["expense_date"]), "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return jsonify({"error": "expense_date must be in YYYY-MM-DD format."}), 400
    else:
        expense_date = date.today()

    category = data.get("category", "Misc")
    if category not in CATEGORIES:
        category = "Misc"

    expense = Expense(
        room_id=room.id, paid_by=paid_by, amount_minor=amount_minor,
        category=category,
        description=(data.get("description") or "").strip()[:300],
        split_type=split_type,
        expense_date=expense_date,
        created_by=user.id,
    )
    db.session.add(expense)
    db.session.flush()
    for uid, amt in splits.items():
        db.session.add(ExpenseSplit(expense_id=expense.id, user_id=uid, amount_minor=amt))
    notify(
        room, active_ids, "expense_added",
        f"{user.name} added {category}",
        f"{_inr(amount_minor)} in {room.name}",
        link=f"/room/{room.code}", exclude_id=user.id,
    )
    db.session.commit()
    return jsonify(expense.to_dict()), 201


@app.route("/api/rooms/<code>/expenses/<int:expense_id>", methods=["DELETE"])
@login_required
def delete_expense(code, expense_id):
    room = room_or_404(code)
    if not room or not get_membership_or_403(room, current_user()):
        return jsonify({"error": "Not found"}), 404
    expense = Expense.query.filter_by(id=expense_id, room_id=room.id).first()
    if not expense:
        return jsonify({"error": "Expense not found"}), 404

    # Only the payer or room owner can delete an expense
    user = current_user()
    membership = get_membership_or_403(room, user)
    if expense.paid_by != user.id and membership.role != "owner":
        return jsonify({"error": "Only the person who paid or the room owner can delete this expense"}), 403

    expense.deleted = True  # soft delete — audit trail preserved
    notify(
        room, active_member_ids(room), "expense_deleted",
        f"{user.name} deleted an expense",
        f"{expense.description or expense.category} · {_inr(expense.amount_minor)}",
        link=f"/room/{room.code}", exclude_id=user.id,
    )
    db.session.commit()
    return jsonify({"deleted": True})


@app.route("/api/rooms/<code>/expenses/<int:expense_id>/dispute", methods=["POST"])
@login_required
def dispute_expense(code, expense_id):
    room = room_or_404(code)
    if not room or not get_membership_or_403(room, current_user()):
        return jsonify({"error": "Not found"}), 404
    expense = Expense.query.filter_by(id=expense_id, room_id=room.id).first()
    if not expense:
        return jsonify({"error": "Expense not found"}), 404
    data = request.get_json(force=True) or {}
    user = current_user()
    expense.status = "disputed"
    expense.dispute_note = (data.get("note") or "").strip()[:500]
    notify(
        room, active_member_ids(room), "expense_disputed",
        f"{user.name} disputed an expense",
        f"{expense.description or expense.category} · {_inr(expense.amount_minor)}",
        link=f"/room/{room.code}", exclude_id=user.id,
    )
    db.session.commit()
    return jsonify(expense.to_dict())


@app.route("/api/rooms/<code>/expenses/<int:expense_id>/resolve", methods=["POST"])
@login_required
def resolve_expense(code, expense_id):
    room = room_or_404(code)
    if not room or not get_membership_or_403(room, current_user()):
        return jsonify({"error": "Not found"}), 404
    expense = Expense.query.filter_by(id=expense_id, room_id=room.id).first()
    if not expense:
        return jsonify({"error": "Expense not found"}), 404
    user = current_user()
    expense.status = "resolved"
    notify(
        room, active_member_ids(room), "expense_resolved",
        f"{user.name} resolved an expense",
        f"{expense.description or expense.category} · {_inr(expense.amount_minor)}",
        link=f"/room/{room.code}", exclude_id=user.id,
    )
    db.session.commit()
    return jsonify(expense.to_dict())


# ---------------------------------------------------------------------------
# Balances + Debt simplification
# ---------------------------------------------------------------------------
def _room_balances(room):
    expenses = Expense.query.filter_by(room_id=room.id, deleted=False).all()
    splits_by_expense = {e.id: e.splits for e in expenses}
    settlements = Settlement.query.filter_by(room_id=room.id).all()
    member_ids = [m.user_id for m in room.memberships]  # include exited so history stays correct
    balances = compute_balances(expenses, splits_by_expense, settlements, member_ids)
    # Defensive: if a stray row from an older version ever references a
    # non-member, drop it so callers can never KeyError on the id.
    known = set(member_ids)
    return {uid: bal for uid, bal in balances.items() if uid in known}


@app.route("/api/rooms/<code>/balances", methods=["GET"])
@login_required
def get_balances(code):
    room = room_or_404(code)
    if not room or not get_membership_or_403(room, current_user()):
        return jsonify({"error": "Not found"}), 404
    balances = _room_balances(room)
    members = {m.user_id: m.user.name for m in room.memberships}
    result = [{"user_id": uid, "name": members.get(uid, "?"), "balance_minor": bal, "balance": bal / 100}
               for uid, bal in balances.items()]
    result.sort(key=lambda r: -r["balance_minor"])
    return jsonify(result)


@app.route("/api/rooms/<code>/debts/simplify", methods=["POST"])
@login_required
def simplify(code):
    room = room_or_404(code)
    if not room or not get_membership_or_403(room, current_user()):
        return jsonify({"error": "Not found"}), 404
    balances = _room_balances(room)
    tx = simplify_debts(balances)
    members = {m.user_id: m for m in room.memberships}
    result = []
    for t in tx:
        from_m = members.get(t["from"])
        to_m = members.get(t["to"])
        if from_m is None or to_m is None:
            continue  # never emit a payment for someone outside the room
        upi_link = None
        if to_m.user.upi_id:
            # URL-encode every user-supplied part; never interpolate raw.
            upi_link = (
                f"upi://pay?pa={quote(to_m.user.upi_id, safe='')}"
                f"&pn={quote(to_m.user.name, safe='')}"
                f"&am={t['amount_minor'] / 100:.2f}&cu=INR"
                f"&tn={quote('Kitty settlement', safe='')}"
            )
        result.append({
            "from_user": t["from"], "from_name": from_m.user.name,
            "to_user": t["to"], "to_name": to_m.user.name,
            "amount_minor": t["amount_minor"], "amount": t["amount_minor"] / 100,
            "upi_link": upi_link,
        })
    return jsonify(result)


# ---------------------------------------------------------------------------
# Settlements
# ---------------------------------------------------------------------------
@app.route("/api/rooms/<code>/settlements", methods=["GET"])
@login_required
def list_settlements(code):
    room = room_or_404(code)
    if not room or not get_membership_or_403(room, current_user()):
        return jsonify({"error": "Not found"}), 404
    settlements = Settlement.query.filter_by(room_id=room.id).order_by(Settlement.created_at.desc()).all()
    return jsonify([s.to_dict() for s in settlements])


@app.route("/api/rooms/<code>/settlements", methods=["POST"])
@login_required
def record_settlement(code):
    room = room_or_404(code)
    user = current_user()
    if not room or not get_membership_or_403(room, user):
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(force=True) or {}
    try:
        amount_minor = to_minor(data.get("amount", 0))
    except (ValueError, TypeError):
        return jsonify({"error": "Enter a valid amount."}), 400
    if amount_minor <= 0:
        return jsonify({"error": "Amount must be greater than zero."}), 400

    try:
        from_user = int(data["from_user"])
        to_user = int(data["to_user"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "from_user and to_user are required."}), 400

    active_ids = active_member_ids(room)
    if from_user == to_user:
        return jsonify({"error": "Payer and payee must be different people."}), 400
    if from_user not in active_ids or to_user not in active_ids:
        return jsonify({"error": "Both people must be active members of this room."}), 400

    method = data.get("method", "upi")
    if method not in ("upi", "cash", "bank", "other"):
        method = "other"

    settlement = Settlement(
        room_id=room.id,
        from_user=from_user,
        to_user=to_user,
        amount_minor=amount_minor,
        method=method,
        note=(data.get("note") or "").strip()[:300],
    )
    names = {m.user_id: m.user.name for m in room.memberships}
    notify(
        room, {from_user, to_user}, "settlement",
        f"{user.name} recorded a settlement",
        f"{_inr(amount_minor)} from {names.get(from_user, 'someone')} to {names.get(to_user, 'someone')}",
        link=f"/room/{room.code}", exclude_id=user.id,
    )
    db.session.add(settlement)
    db.session.commit()
    return jsonify(settlement.to_dict()), 201


# ---------------------------------------------------------------------------
# Recurring expenses
# ---------------------------------------------------------------------------
@app.route("/api/rooms/<code>/recurring", methods=["GET"])
@login_required
def list_recurring(code):
    room = room_or_404(code)
    if not room or not get_membership_or_403(room, current_user()):
        return jsonify({"error": "Not found"}), 404
    return jsonify([r.to_dict() for r in room.recurring])


@app.route("/api/rooms/<code>/recurring", methods=["POST"])
@login_required
def add_recurring(code):
    room = room_or_404(code)
    user = current_user()
    if not room or not get_membership_or_403(room, user):
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(force=True) or {}
    try:
        amount_minor = to_minor(data.get("amount", 0))
    except (ValueError, TypeError):
        return jsonify({"error": "Enter a valid amount."}), 400
    if amount_minor <= 0:
        return jsonify({"error": "Amount must be greater than zero."}), 400

    active_ids = active_member_ids(room)
    try:
        paid_by = int(data.get("paid_by") or user.id)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid payer."}), 400
    if paid_by not in active_ids:
        return jsonify({"error": "The payer must be an active member of this room."}), 400

    try:
        day_of_month = int(data.get("day_of_month", 1))
    except (TypeError, ValueError):
        day_of_month = 1

    category = data.get("category", "Misc")
    if category not in CATEGORIES:
        category = "Misc"
    split_type = data.get("split_type", "equal")
    if split_type not in SPLIT_TYPES:
        split_type = "equal"

    rec = RecurringExpense(
        room_id=room.id,
        name=(data.get("name") or "").strip()[:120] or "Recurring bill",
        amount_minor=amount_minor,
        category=category,
        split_type=split_type,
        paid_by=paid_by,
        day_of_month=day_of_month if 1 <= day_of_month <= 31 else 1,
    )
    db.session.add(rec)
    db.session.commit()
    return jsonify(rec.to_dict()), 201


@app.route("/api/rooms/<code>/recurring/<int:rec_id>", methods=["PUT"])
@login_required
def toggle_recurring(code, rec_id):
    room = room_or_404(code)
    if not room or not get_membership_or_403(room, current_user()):
        return jsonify({"error": "Not found"}), 404
    rec = RecurringExpense.query.filter_by(id=rec_id, room_id=room.id).first()
    if not rec:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(force=True) or {}
    if "active" in data:
        rec.active = bool(data["active"])
    db.session.commit()
    return jsonify(rec.to_dict())


@app.route("/api/rooms/<code>/recurring/<int:rec_id>/generate", methods=["POST"])
@login_required
def generate_recurring(code, rec_id):
    """One-click confirm: turns a recurring template into a real expense for
    the current month (equal split across active members)."""
    room = room_or_404(code)
    user = current_user()
    if not room or not get_membership_or_403(room, user):
        return jsonify({"error": "Not found"}), 404
    rec = RecurringExpense.query.filter_by(id=rec_id, room_id=room.id).first()
    if not rec:
        return jsonify({"error": "Not found"}), 404

    this_month = date.today().strftime("%Y-%m")
    if rec.last_generated_month == this_month:
        return jsonify({"error": "Already generated for this month."}), 409

    active_ids = sorted(active_member_ids(room))
    if not active_ids:
        return jsonify({"error": "There are no active members to split this bill across."}), 400
    splits = compute_split("equal", rec.amount_minor, user_ids=active_ids)
    expense = Expense(
        room_id=room.id, paid_by=rec.paid_by, amount_minor=rec.amount_minor,
        category=rec.category, description=rec.name, split_type="equal",
        expense_date=date.today(), created_by=user.id,
    )
    db.session.add(expense)
    db.session.flush()
    for uid, amt in splits.items():
        db.session.add(ExpenseSplit(expense_id=expense.id, user_id=uid, amount_minor=amt))
    rec.last_generated_month = this_month
    # The bill is paid now — drop this month's "due" reminders for the room.
    Notification.query.filter(
        Notification.room_id == room.id,
        Notification.kind == "recurring_due",
        Notification.dedupe_key.like(f"recurring:{room.id}:{this_month}:%"),
    ).delete(synchronize_session=False)
    notify(
        room, active_ids, "recurring_generated",
        f"{user.name} generated {rec.name}",
        f"{_inr(rec.amount_minor)} added for this month",
        link=f"/room/{room.code}", exclude_id=user.id,
    )
    db.session.commit()
    return jsonify(expense.to_dict()), 201


# ---------------------------------------------------------------------------
# Dashboard summary + reports
# ---------------------------------------------------------------------------
@app.route("/api/rooms/<code>/dashboard", methods=["GET"])
@login_required
def dashboard(code):
    room = room_or_404(code)
    user = current_user()
    if not room or not get_membership_or_403(room, user):
        return jsonify({"error": "Not found"}), 404

    this_month = date.today().strftime("%Y-%m")
    expenses = Expense.query.filter_by(room_id=room.id, deleted=False).all()
    month_expenses = [e for e in expenses if e.expense_date.strftime("%Y-%m") == this_month]
    total_month = sum(e.amount_minor for e in month_expenses)

    by_category = {}
    for e in month_expenses:
        by_category[e.category] = by_category.get(e.category, 0) + e.amount_minor
    top_categories = sorted(by_category.items(), key=lambda x: -x[1])[:5]

    balances = _room_balances(room)
    my_balance = balances.get(user.id, 0)

    recent = sorted(expenses, key=lambda e: (e.expense_date, e.id), reverse=True)[:8]
    pending_recurring = [r for r in room.recurring if r.active and r.last_generated_month != this_month]

    return jsonify({
        "room": room.to_dict(),
        "month_total_minor": total_month,
        "month_total": total_month / 100,
        "top_categories": [{"category": c, "amount_minor": a, "amount": a / 100} for c, a in top_categories],
        "my_balance_minor": my_balance,
        "my_balance": my_balance / 100,
        "recent_expenses": [e.to_dict() for e in recent],
        "pending_recurring": [r.to_dict() for r in pending_recurring],
    })


def _csv_cell(value):
    """Neutralise spreadsheet formula injection (=, +, -, @, tab, CR)."""
    text = "" if value is None else str(value)
    if text[:1] in ("=", "+", "-", "@", "\t", "\r"):
        text = "'" + text
    return text


@app.route("/api/rooms/<code>/reports/monthly.csv", methods=["GET"])
@login_required
def export_csv(code):
    room = room_or_404(code)
    if not room or not get_membership_or_403(room, current_user()):
        return jsonify({"error": "Not found"}), 404
    month = request.args.get("month") or date.today().strftime("%Y-%m")
    if not re.fullmatch(r"\d{4}-\d{2}", month):
        return jsonify({"error": "month must be in YYYY-MM format."}), 400
    expenses = [e for e in Expense.query.filter_by(room_id=room.id, deleted=False).all()
                if e.expense_date.strftime("%Y-%m") == month]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Description", "Category", "Paid By", "Amount", "Split Type", "Status"])
    for e in sorted(expenses, key=lambda x: x.expense_date):
        writer.writerow([e.expense_date.isoformat(), _csv_cell(e.description), _csv_cell(e.category),
                          _csv_cell(e.payer.name if e.payer else ""), f"{e.amount_minor/100:.2f}",
                          _csv_cell(e.split_type), _csv_cell(e.status)])
    writer.writerow([])
    writer.writerow(["Member", "Net Balance (+owed to them / -they owe)"])
    balances = _room_balances(room)
    members = {m.user_id: m.user.name for m in room.memberships}
    for uid, bal in balances.items():
        writer.writerow([_csv_cell(members.get(uid, uid)), f"{bal/100:.2f}"])

    csv_data = output.getvalue()
    return Response(csv_data, mimetype="text/csv",
                     headers={"Content-Disposition": f"attachment;filename=kitty_{code}_{month}.csv"})


# ---------------------------------------------------------------------------
# Notifications API
# ---------------------------------------------------------------------------
@app.route("/api/notifications", methods=["GET"])
@login_required
def list_notifications():
    user = current_user()
    _ensure_recurring_reminders(user)
    items = (Notification.query.filter_by(user_id=user.id)
             .order_by(Notification.created_at.desc(), Notification.id.desc())
             .limit(50).all())
    unread = Notification.query.filter_by(user_id=user.id, read_at=None).count()
    return jsonify({"unread": unread, "items": [n.to_dict() for n in items]})


@app.route("/api/notifications/read", methods=["POST"])
@login_required
def mark_all_notifications_read():
    user = current_user()
    updated = Notification.query.filter_by(user_id=user.id, read_at=None).update(
        {Notification.read_at: datetime.utcnow()}, synchronize_session=False)
    db.session.commit()
    return jsonify({"ok": True, "unread": 0, "marked": updated})


@app.route("/api/notifications/<int:notif_id>/read", methods=["POST"])
@login_required
def mark_notification_read(notif_id):
    user = current_user()
    n = Notification.query.filter_by(id=notif_id, user_id=user.id).first()
    if not n:
        return jsonify({"error": "Not found"}), 404
    if n.read_at is None:
        n.read_at = datetime.utcnow()
        db.session.commit()
    return jsonify(n.to_dict())


# ===========================================================================
# Admin API (Superadmin Platform Dashboard)
# ===========================================================================
ADMIN_KEY = os.environ.get("ADMIN_KEY") or os.environ.get("ADMIN_SECRET") or "admin123"


def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("is_admin"):
            return jsonify({"error": "Admin authentication required"}), 403
        return f(*args, **kwargs)
    return wrapper


@app.route("/api/admin/verify", methods=["GET"])
def admin_verify():
    return jsonify({"is_admin": bool(session.get("is_admin"))})


@app.route("/api/admin/login", methods=["POST"])
@limiter.limit("20 per minute")
def admin_login():
    data = request.get_json(force=True) or {}
    key = (data.get("admin_key") or "").strip()
    if not key or key != ADMIN_KEY:
        return jsonify({"error": "Invalid admin passkey"}), 401
    session["is_admin"] = True
    return jsonify({"status": "authenticated", "role": "superadmin"})


@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("is_admin", None)
    return jsonify({"status": "logged_out"})


@app.route("/api/admin/stats", methods=["GET"])
@admin_required
def admin_stats():
    total_users = User.query.count()
    total_rooms = Room.query.count()
    total_expenses = Expense.query.filter_by(deleted=False).count()

    total_volume_minor = db.session.query(
        db.func.coalesce(db.func.sum(Expense.amount_minor), 0)
    ).filter(Expense.deleted == False).scalar()

    total_settled_minor = db.session.query(
        db.func.coalesce(db.func.sum(Settlement.amount_minor), 0)
    ).scalar()
    total_settlements = Settlement.query.count()

    # Category totals
    cat_rows = db.session.query(
        Expense.category,
        db.func.count(Expense.id),
        db.func.sum(Expense.amount_minor)
    ).filter(Expense.deleted == False).group_by(Expense.category).all()

    categories_breakdown = [
        {"category": c[0], "count": int(c[1] or 0), "amount_minor": int(c[2] or 0)}
        for c in cat_rows
    ]
    categories_breakdown.sort(key=lambda x: x["amount_minor"], reverse=True)

    # Recent signups
    recent_users = User.query.order_by(User.created_at.desc()).limit(6).all()
    # Recent expenses
    recent_expenses = Expense.query.filter_by(deleted=False).order_by(Expense.created_at.desc()).limit(6).all()

    return jsonify({
        "total_users": total_users,
        "total_rooms": total_rooms,
        "total_expenses": total_expenses,
        "total_volume_minor": int(total_volume_minor or 0),
        "total_settled_minor": int(total_settled_minor or 0),
        "total_settlements": total_settlements,
        "categories_breakdown": categories_breakdown,
        "recent_users": [u.to_dict() for u in recent_users],
        "recent_expenses": [e.to_dict() for e in recent_expenses]
    })


@app.route("/api/admin/users", methods=["GET"])
@admin_required
def admin_users():
    q = (request.args.get("q") or "").strip().lower()
    query = User.query
    if q:
        query = query.filter(
            (User.name.ilike(f"%{q}%")) | (User.phone.ilike(f"%{q}%"))
        )
    users = query.order_by(User.created_at.desc()).limit(100).all()

    result = []
    for u in users:
        rooms_count = RoomMembership.query.filter_by(user_id=u.id, status="active").count()
        result.append({
            "id": u.id,
            "name": u.name,
            "phone": u.phone,
            "upi_id": u.upi_id,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "rooms_count": rooms_count
        })
    return jsonify(result)


@app.route("/api/admin/rooms", methods=["GET"])
@admin_required
def admin_rooms():
    q = (request.args.get("q") or "").strip().lower()
    query = Room.query
    if q:
        query = query.filter(
            (Room.name.ilike(f"%{q}%")) | (Room.code.ilike(f"%{q}%"))
        )
    rooms = query.order_by(Room.created_at.desc()).limit(100).all()

    result = []
    for r in rooms:
        active_members_count = len(r.active_members())
        creator = db.session.get(User, r.created_by) if r.created_by else None
        total_spent = db.session.query(
            db.func.coalesce(db.func.sum(Expense.amount_minor), 0)
        ).filter(Expense.room_id == r.id, Expense.deleted == False).scalar()
        expense_count = Expense.query.filter_by(room_id=r.id, deleted=False).count()

        result.append({
            "id": r.id,
            "code": r.code,
            "name": r.name,
            "currency": r.currency,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "created_by": r.created_by,
            "creator_name": creator.name if creator else "Unknown",
            "creator_phone": creator.phone if creator else "",
            "member_count": active_members_count,
            "expense_count": expense_count,
            "total_spent_minor": int(total_spent or 0)
        })
    return jsonify(result)


@app.route("/api/admin/rooms/<int:room_id>", methods=["DELETE"])
@admin_required
def admin_delete_room(room_id):
    room = db.session.get(Room, room_id)
    if not room:
        return jsonify({"error": "Room not found"}), 404
    db.session.delete(room)
    db.session.commit()
    return jsonify({"status": "deleted", "room_id": room_id})


@app.route("/api/admin/users/<int:user_id>", methods=["DELETE"])
@admin_required
def admin_delete_user(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    RoomMembership.query.filter_by(user_id=user_id).delete()
    Notification.query.filter_by(user_id=user_id).delete()
    db.session.delete(user)
    db.session.commit()
    return jsonify({"status": "deleted", "user_id": user_id})


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 7861))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() in ("1", "true", "yes")
    app.run(host=host, port=port, debug=debug)
