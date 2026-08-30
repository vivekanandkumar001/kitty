import os
import csv
import io
from datetime import datetime, date
from functools import wraps

from flask import Flask, request, jsonify, render_template, session, redirect, url_for, Response

from models import (db, User, Room, RoomMembership, Expense, ExpenseSplit,
                     RecurringExpense, Settlement, CATEGORIES, SPLIT_TYPES, gen_code)
from engine import compute_split, compute_balances, simplify_debts, SplitError

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(BASE_DIR, "roomsplit.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-in-production")

db.init_app(app)

with app.app_context():
    db.create_all()


def to_minor(rupees):
    """Rupees (float/str/int) -> integer paise. Always go through this, never
    store or compute with floats directly."""
    return int(round(float(rupees) * 100))


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
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


def room_or_404(code):
    return Room.query.filter_by(code=code.upper()).first()


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------
@app.route("/")
def home():
    if current_user():
        return redirect(url_for("rooms_page"))
    return redirect(url_for("login_page"))


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
@app.route("/api/auth/signup", methods=["POST"])
def signup():
    data = request.get_json(force=True) or {}
    name = (data.get("name") or "").strip()
    phone = (data.get("phone") or "").strip()
    pin = (data.get("pin") or "").strip()
    if not name or not phone or len(pin) != 4 or not pin.isdigit():
        return jsonify({"error": "Name, phone and a 4-digit PIN are required."}), 400
    if User.query.filter_by(phone=phone).first():
        return jsonify({"error": "This phone number is already registered. Try logging in."}), 409
    user = User(name=name, phone=phone)
    user.set_pin(pin)
    db.session.add(user)
    db.session.commit()
    session["user_id"] = user.id
    return jsonify(user.to_dict()), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(force=True) or {}
    phone = (data.get("phone") or "").strip()
    pin = (data.get("pin") or "").strip()
    user = User.query.filter_by(phone=phone).first()
    if not user or not user.check_pin(pin):
        return jsonify({"error": "Invalid phone or PIN."}), 401
    session["user_id"] = user.id
    return jsonify(user.to_dict())


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/auth/me", methods=["PUT"])
@login_required
def update_profile():
    user = current_user()
    data = request.get_json(force=True) or {}
    if "upi_id" in data:
        user.upi_id = data["upi_id"].strip()
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
    name = (data.get("name") or "").strip() or "My Room"
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
    if existing:
        if existing.status == "exited":
            existing.status = "active"
            existing.exited_at = None
            db.session.commit()
        return jsonify(room.to_dict())
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
    if not room or not get_membership_or_403(room, current_user()):
        return jsonify({"error": "Not found"}), 404
    membership = RoomMembership.query.filter_by(room_id=room.id, user_id=user_id, status="active").first()
    if not membership:
        return jsonify({"error": "Member not found or already exited."}), 404

    balances = _room_balances(room)
    net = balances.get(user_id, 0)
    deposit = membership.deposit_minor or 0
    final_amount_minor = net + deposit  # deposit returned on top of/against their balance

    membership.status = "exited"
    membership.exited_at = datetime.utcnow()
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
    if not room or not get_membership_or_403(room, current_user()):
        return jsonify({"error": "Not found"}), 404
    membership = RoomMembership.query.filter_by(room_id=room.id, user_id=user_id).first()
    if not membership:
        return jsonify({"error": "Member not found"}), 404
    data = request.get_json(force=True) or {}
    membership.deposit_minor = to_minor(data.get("deposit", 0))
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

    try:
        amount_minor = to_minor(data.get("amount", 0))
        if amount_minor <= 0:
            return jsonify({"error": "Amount must be greater than zero."}), 400
        paid_by = int(data.get("paid_by") or user.id)
        split_type = data.get("split_type", "equal")
        if split_type not in SPLIT_TYPES:
            return jsonify({"error": f"Unknown split type: {split_type}"}), 400

        active_ids = [m.user_id for m in room.active_members()]
        if split_type == "equal":
            user_ids = data.get("user_ids") or active_ids
            splits = compute_split("equal", amount_minor, user_ids=user_ids)
        elif split_type == "custom":
            shares = {int(k): to_minor(v) for k, v in data.get("shares", {}).items()}
            splits = compute_split("custom", amount_minor, shares=shares)
        elif split_type == "percentage":
            pct = {int(k): float(v) for k, v in data.get("percentages", {}).items()}
            splits = compute_split("percentage", amount_minor, percentages=pct)
        elif split_type == "attendance":
            present = [int(u) for u in data.get("present_user_ids", [])]
            splits = compute_split("attendance", amount_minor, present_user_ids=present)

        expense = Expense(
            room_id=room.id, paid_by=paid_by, amount_minor=amount_minor,
            category=data.get("category", "Misc"),
            description=(data.get("description") or "").strip(),
            split_type=split_type,
            expense_date=datetime.strptime(data["expense_date"], "%Y-%m-%d").date() if data.get("expense_date") else date.today(),
            created_by=user.id,
        )
        db.session.add(expense)
        db.session.flush()
        for uid, amt in splits.items():
            db.session.add(ExpenseSplit(expense_id=expense.id, user_id=uid, amount_minor=amt))
        db.session.commit()
        return jsonify(expense.to_dict()), 201
    except SplitError as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 400
    except (ValueError, KeyError) as e:
        db.session.rollback()
        return jsonify({"error": f"Invalid input: {e}"}), 400


@app.route("/api/rooms/<code>/expenses/<int:expense_id>", methods=["DELETE"])
@login_required
def delete_expense(code, expense_id):
    room = room_or_404(code)
    if not room or not get_membership_or_403(room, current_user()):
        return jsonify({"error": "Not found"}), 404
    expense = Expense.query.filter_by(id=expense_id, room_id=room.id).first()
    if not expense:
        return jsonify({"error": "Expense not found"}), 404
    expense.deleted = True  # soft delete — audit trail preserved
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
    expense.status = "disputed"
    expense.dispute_note = (data.get("note") or "").strip()
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
    expense.status = "resolved"
    db.session.commit()
    return jsonify(expense.to_dict())


# ---------------------------------------------------------------------------
# Balances + Debt simplification
# ---------------------------------------------------------------------------
def _room_balances(room):
    expenses = Expense.query.filter_by(room_id=room.id, deleted=False).all()
    splits_by_expense = {}
    for e in expenses:
        splits_by_expense[e.id] = e.splits
    settlements = Settlement.query.filter_by(room_id=room.id).all()
    member_ids = [m.user_id for m in room.memberships]  # include exited so history stays correct
    return compute_balances(expenses, splits_by_expense, settlements, member_ids)


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
        from_m, to_m = members[t["from"]], members[t["to"]]
        upi_link = None
        if to_m.user.upi_id:
            amt_rupees = t["amount_minor"] / 100
            upi_link = (f"upi://pay?pa={to_m.user.upi_id}&pn={to_m.user.name.replace(' ', '%20')}"
                        f"&am={amt_rupees:.2f}&cu=INR&tn=RoomSplit%20settlement")
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
        if amount_minor <= 0:
            return jsonify({"error": "Amount must be greater than zero."}), 400
        settlement = Settlement(
            room_id=room.id,
            from_user=int(data["from_user"]),
            to_user=int(data["to_user"]),
            amount_minor=amount_minor,
            method=data.get("method", "upi"),
            note=(data.get("note") or "").strip(),
        )
        db.session.add(settlement)
        db.session.commit()
        return jsonify(settlement.to_dict()), 201
    except (ValueError, KeyError) as e:
        return jsonify({"error": f"Invalid input: {e}"}), 400


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
        rec = RecurringExpense(
            room_id=room.id,
            name=(data.get("name") or "").strip() or "Recurring bill",
            amount_minor=to_minor(data.get("amount", 0)),
            category=data.get("category", "Misc"),
            split_type=data.get("split_type", "equal"),
            paid_by=int(data.get("paid_by") or user.id),
            day_of_month=int(data.get("day_of_month", 1)),
        )
        db.session.add(rec)
        db.session.commit()
        return jsonify(rec.to_dict()), 201
    except (ValueError, KeyError) as e:
        return jsonify({"error": f"Invalid input: {e}"}), 400


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

    active_ids = [m.user_id for m in room.active_members()]
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


@app.route("/api/rooms/<code>/reports/monthly.csv", methods=["GET"])
@login_required
def export_csv(code):
    room = room_or_404(code)
    if not room or not get_membership_or_403(room, current_user()):
        return jsonify({"error": "Not found"}), 404
    month = request.args.get("month", date.today().strftime("%Y-%m"))
    expenses = [e for e in Expense.query.filter_by(room_id=room.id, deleted=False).all()
                if e.expense_date.strftime("%Y-%m") == month]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Description", "Category", "Paid By", "Amount", "Split Type", "Status"])
    for e in sorted(expenses, key=lambda x: x.expense_date):
        writer.writerow([e.expense_date.isoformat(), e.description, e.category,
                          e.payer.name, f"{e.amount_minor/100:.2f}", e.split_type, e.status])
    writer.writerow([])
    writer.writerow(["Member", "Net Balance (+owed to them / -they owe)"])
    balances = _room_balances(room)
    members = {m.user_id: m.user.name for m in room.memberships}
    for uid, bal in balances.items():
        writer.writerow([members.get(uid, uid), f"{bal/100:.2f}"])

    csv_data = output.getvalue()
    return Response(csv_data, mimetype="text/csv",
                     headers={"Content-Disposition": f"attachment;filename=roomsplit_{code}_{month}.csv"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7861))
    app.run(host="0.0.0.0", port=port, debug=False)
