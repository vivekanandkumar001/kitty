import random
import string
from datetime import datetime, date

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


def gen_code(length=6):
    """Room invite code. Unpredictable-ish (not sequential) per spec's security note."""
    alphabet = string.ascii_uppercase + string.digits
    while True:
        code = "".join(random.choices(alphabet, k=length))
        if not Room.query.filter_by(code=code).first():
            return code


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(20), unique=True, nullable=False, index=True)
    pin_hash = db.Column(db.String(255), nullable=False)
    upi_id = db.Column(db.String(120), default="")  # for UPI deep links
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_pin(self, pin):
        self.pin_hash = generate_password_hash(pin)

    def check_pin(self, pin):
        return check_password_hash(self.pin_hash, pin)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "phone": self.phone, "upi_id": self.upi_id}


# ---------------------------------------------------------------------------
# Room + Membership
# ---------------------------------------------------------------------------
class Room(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(12), unique=True, nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    currency = db.Column(db.String(8), default="INR")
    created_by = db.Column(db.Integer, db.ForeignKey("user.id"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    memberships = db.relationship("RoomMembership", backref="room", cascade="all, delete-orphan")
    expenses = db.relationship("Expense", backref="room", cascade="all, delete-orphan")
    recurring = db.relationship("RecurringExpense", backref="room", cascade="all, delete-orphan")
    settlements = db.relationship("Settlement", backref="room", cascade="all, delete-orphan")

    def active_members(self):
        return [m for m in self.memberships if m.status == "active"]

    def to_dict(self):
        return {
            "id": self.id, "code": self.code, "name": self.name, "currency": self.currency,
            "member_count": len(self.active_members()),
        }


class RoomMembership(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey("room.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    role = db.Column(db.String(10), default="member")  # owner / member
    status = db.Column(db.String(10), default="active")  # active / exited
    deposit_minor = db.Column(db.Integer, default=0)  # optional tracked security deposit
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)
    exited_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User")

    def to_dict(self):
        return {
            "user_id": self.user_id, "name": self.user.name, "phone": self.user.phone,
            "role": self.role, "status": self.status,
            "deposit_minor": self.deposit_minor,
            "joined_at": self.joined_at.isoformat(),
            "exited_at": self.exited_at.isoformat() if self.exited_at else None,
        }


# ---------------------------------------------------------------------------
# Expense + Split
# ---------------------------------------------------------------------------
CATEGORIES = ["Rent", "Electricity", "Groceries", "Wifi", "Maid/Cook", "Mess",
              "Transport", "Subscription", "Misc"]

SPLIT_TYPES = ["equal", "custom", "percentage", "attendance"]


class Expense(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey("room.id"), nullable=False)
    paid_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    amount_minor = db.Column(db.Integer, nullable=False)  # paise
    category = db.Column(db.String(30), default="Misc")
    description = db.Column(db.String(300), default="")
    split_type = db.Column(db.String(20), default="equal")
    expense_date = db.Column(db.Date, default=date.today)
    status = db.Column(db.String(20), default="confirmed")  # confirmed / disputed / resolved
    dispute_note = db.Column(db.String(500), default="")
    created_by = db.Column(db.Integer, db.ForeignKey("user.id"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    deleted = db.Column(db.Boolean, default=False)  # soft delete

    splits = db.relationship("ExpenseSplit", backref="expense", cascade="all, delete-orphan")
    payer = db.relationship("User", foreign_keys=[paid_by])

    def to_dict(self):
        return {
            "id": self.id, "paid_by": self.paid_by, "paid_by_name": self.payer.name,
            "amount_minor": self.amount_minor, "amount": self.amount_minor / 100,
            "category": self.category, "description": self.description,
            "split_type": self.split_type,
            "expense_date": self.expense_date.isoformat(),
            "status": self.status, "dispute_note": self.dispute_note,
            "created_at": self.created_at.isoformat(),
            "splits": [s.to_dict() for s in self.splits],
        }


class ExpenseSplit(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    expense_id = db.Column(db.Integer, db.ForeignKey("expense.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    amount_minor = db.Column(db.Integer, nullable=False)

    user = db.relationship("User")

    def to_dict(self):
        return {"user_id": self.user_id, "name": self.user.name, "amount_minor": self.amount_minor,
                "amount": self.amount_minor / 100}


# ---------------------------------------------------------------------------
# Recurring expense templates
# ---------------------------------------------------------------------------
class RecurringExpense(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey("room.id"), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    amount_minor = db.Column(db.Integer, nullable=False)
    category = db.Column(db.String(30), default="Misc")
    split_type = db.Column(db.String(20), default="equal")
    paid_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    day_of_month = db.Column(db.Integer, default=1)
    active = db.Column(db.Boolean, default=True)
    last_generated_month = db.Column(db.String(7), default="")  # "YYYY-MM"

    payer = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "amount_minor": self.amount_minor,
            "amount": self.amount_minor / 100, "category": self.category,
            "split_type": self.split_type, "paid_by": self.paid_by, "paid_by_name": self.payer.name,
            "day_of_month": self.day_of_month, "active": self.active,
            "last_generated_month": self.last_generated_month,
        }


# ---------------------------------------------------------------------------
# Settlement (payments between members)
# ---------------------------------------------------------------------------
class Settlement(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey("room.id"), nullable=False)
    from_user = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    to_user = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    amount_minor = db.Column(db.Integer, nullable=False)
    method = db.Column(db.String(20), default="upi")  # upi / cash / bank / other
    note = db.Column(db.String(300), default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    payer = db.relationship("User", foreign_keys=[from_user])
    payee = db.relationship("User", foreign_keys=[to_user])

    def to_dict(self):
        return {
            "id": self.id, "from_user": self.from_user, "from_name": self.payer.name,
            "to_user": self.to_user, "to_name": self.payee.name,
            "amount_minor": self.amount_minor, "amount": self.amount_minor / 100,
            "method": self.method, "note": self.note, "created_at": self.created_at.isoformat(),
        }
