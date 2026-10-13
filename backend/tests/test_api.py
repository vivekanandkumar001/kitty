"""Integration tests for the Flask API.

Tests run against a real Flask app instance with a test database.
Each test is isolated — the database is recreated for each test.
"""

import pytest
import os
import tempfile
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app import app, db as _db, limiter, _LOGIN_FAILS
from models import User, Room, RoomMembership, Expense, ExpenseSplit, Settlement


@pytest.fixture
def client():
    """Create a test client with a fresh in-memory database."""
    # Save original config to restore after test
    original_config = {k: v for k, v in app.config.items()}

    app.config["TESTING"] = True
    app.config["WTF_CSRF_ENABLED"] = False
    app.config["SECRET_KEY"] = "test-secret-key"

    # The Limiter is created at import time, before this config is set, so
    # RATELIMIT_ENABLED has no effect here. Turn the limiter off directly, and
    # clear its in-memory counters, so repeated signups across tests aren't
    # rejected with 429.
    original_limiter_enabled = limiter.enabled
    limiter.enabled = False
    limiter.reset()
    _LOGIN_FAILS.clear()  # don't let a lockout leak between tests

    with app.test_client() as client:
        with app.app_context():
            # Flask-SQLAlchemy creates its engine in init_app() and ignores any
            # later SQLALCHEMY_DATABASE_URI change, and init_app() can't be
            # called twice. So swap the default engine for a private in-memory
            # one here — otherwise create_all()/drop_all() would run against the
            # real roomsplit.db and wipe the developer's data.
            original_engine = _db.engines[None]
            test_engine = create_engine(
                "sqlite://",
                poolclass=StaticPool,
                connect_args={"check_same_thread": False},
            )
            _db._app_engines[app][None] = test_engine

            _db.create_all()
            yield client
            _db.session.remove()
            _db.drop_all()

            test_engine.dispose()
            _db._app_engines[app][None] = original_engine

    limiter.enabled = original_limiter_enabled

    # Restore original config to prevent state leaking between tests
    for key in list(app.config.keys()):
        if key not in original_config:
            app.config.pop(key, None)
    app.config.update(original_config)


@pytest.fixture
def auth_client(client):
    """A test client with a logged-in user and a room. Returns (client, room_code)."""
    client.post("/api/auth/signup", json={"name": "Test User", "phone": "9999999999", "pin": "1234"})
    resp = client.post("/api/rooms", json={"name": "Test Room"})
    room = resp.get_json()
    code = room["code"]
    return client, code


@pytest.fixture
def two_user_room(client):
    """A room with two members. Returns (client, room_code)."""
    # User 1
    client.post("/api/auth/signup", json={"name": "Alice", "phone": "1111111111", "pin": "1111"})
    resp = client.post("/api/rooms", json={"name": "Test Room"})
    room = resp.get_json()
    code = room["code"]

    # User 2 joins
    client.post("/api/auth/logout", json={})
    client.post("/api/auth/signup", json={"name": "Bob", "phone": "2222222222", "pin": "2222"})
    client.post("/api/rooms/join", json={"code": code})

    # Log back in as user 1
    client.post("/api/auth/logout", json={})
    client.post("/api/auth/login", json={"phone": "1111111111", "pin": "1111"})

    return client, code


# ─── Auth Tests ──────────────────────────────────────────────────────────────

class TestAuth:
    def test_signup_success(self, client):
        resp = client.post("/api/auth/signup", json={"name": "Test", "phone": "9999999999", "pin": "1234"})
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["name"] == "Test"
        assert data["phone"] == "9999999999"
        assert "id" in data

    def test_signup_duplicate_phone(self, client):
        client.post("/api/auth/signup", json={"name": "Test", "phone": "9999999999", "pin": "1234"})
        resp = client.post("/api/auth/signup", json={"name": "Test2", "phone": "9999999999", "pin": "5678"})
        assert resp.status_code == 409

    def test_signup_invalid_pin(self, client):
        resp = client.post("/api/auth/signup", json={"name": "Test", "phone": "9999999999", "pin": "12"})
        assert resp.status_code == 400

    def test_login_success(self, client):
        client.post("/api/auth/signup", json={"name": "Test", "phone": "9999999999", "pin": "1234"})
        client.post("/api/auth/logout", json={})
        resp = client.post("/api/auth/login", json={"phone": "9999999999", "pin": "1234"})
        assert resp.status_code == 200
        assert resp.get_json()["name"] == "Test"

    def test_login_wrong_pin(self, client):
        client.post("/api/auth/signup", json={"name": "Test", "phone": "9999999999", "pin": "1234"})
        client.post("/api/auth/logout", json={})
        resp = client.post("/api/auth/login", json={"phone": "9999999999", "pin": "9999"})
        assert resp.status_code == 401

    def test_login_nonexistent_user(self, client):
        resp = client.post("/api/auth/login", json={"phone": "0000000000", "pin": "1234"})
        assert resp.status_code == 401

    def test_unauthenticated_access(self, client):
        resp = client.get("/api/rooms")
        assert resp.status_code == 401

    def test_logout(self, client):
        client.post("/api/auth/signup", json={"name": "Test", "phone": "9999999999", "pin": "1234"})
        client.post("/api/auth/logout", json={})
        resp = client.get("/api/rooms")
        assert resp.status_code == 401

    def test_update_upi_id(self, auth_client):
        client, _ = auth_client
        resp = client.put("/api/auth/me", json={"upi_id": "test@upi"})
        assert resp.status_code == 200
        assert resp.get_json()["upi_id"] == "test@upi"


# ─── Room Tests ──────────────────────────────────────────────────────────────

class TestRooms:
    def test_create_room(self, auth_client):
        client, _ = auth_client
        resp = client.post("/api/rooms", json={"name": "New Room"})
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["name"] == "New Room"
        assert len(data["code"]) == 6

    def test_list_rooms(self, auth_client):
        client, _ = auth_client
        client.post("/api/rooms", json={"name": "Room 1"})
        client.post("/api/rooms", json={"name": "Room 2"})
        resp = client.get("/api/rooms")
        assert resp.status_code == 200
        rooms = resp.get_json()
        assert len(rooms) == 3  # 1 from fixture + 2 new

    def test_join_room(self, client):
        # User 1 creates room
        client.post("/api/auth/signup", json={"name": "Alice", "phone": "1111111111", "pin": "1111"})
        room = client.post("/api/rooms", json={"name": "Test"}).get_json()
        code = room["code"]

        # User 2 joins
        client.post("/api/auth/logout", json={})
        client.post("/api/auth/signup", json={"name": "Bob", "phone": "2222222222", "pin": "2222"})
        resp = client.post("/api/rooms/join", json={"code": code})
        assert resp.status_code == 201
        assert resp.get_json()["code"] == code

    def test_join_invalid_code(self, auth_client):
        client, _ = auth_client
        resp = client.post("/api/rooms/join", json={"code": "ZZZZZZ"})
        assert resp.status_code == 404

    def test_unauthorized_room_access(self, client):
        # User 1 creates room
        client.post("/api/auth/signup", json={"name": "Alice", "phone": "1111111111", "pin": "1111"})
        room = client.post("/api/rooms", json={"name": "Private"}).get_json()
        code = room["code"]

        # User 2 tries to access without joining
        client.post("/api/auth/logout", json={})
        client.post("/api/auth/signup", json={"name": "Bob", "phone": "2222222222", "pin": "2222"})
        resp = client.get(f"/api/rooms/{code}/expenses")
        assert resp.status_code == 404  # Not found (membership check)


# ─── Expense Tests ───────────────────────────────────────────────────────────

class TestExpenses:
    def test_add_expense_equal_split(self, two_user_room):
        client, code = two_user_room
        resp = client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Test expense",
            "amount": 100.00,
            "category": "Misc",
            "paid_by": 1,
            "split_type": "equal",
            "expense_date": "2026-01-15",
            "user_ids": [1, 2],
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["description"] == "Test expense"
        assert data["amount"] == 100.0
        assert len(data["splits"]) == 2

    def test_add_expense_percentage_split(self, two_user_room):
        client, code = two_user_room
        resp = client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Test",
            "amount": 200.00,
            "category": "Rent",
            "paid_by": 1,
            "split_type": "percentage",
            "expense_date": "2026-01-15",
            "percentages": {"1": 30, "2": 70},
        })
        assert resp.status_code == 201

    def test_add_expense_invalid_percentage(self, two_user_room):
        client, code = two_user_room
        resp = client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Test",
            "amount": 200.00,
            "category": "Rent",
            "paid_by": 1,
            "split_type": "percentage",
            "expense_date": "2026-01-15",
            "percentages": {"1": 50, "2": 40},
        })
        assert resp.status_code == 400

    def test_list_expenses(self, two_user_room):
        client, code = two_user_room
        client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Test", "amount": 100, "category": "Misc",
            "paid_by": 1, "split_type": "equal", "expense_date": "2026-01-15",
            "user_ids": [1, 2],
        })
        resp = client.get(f"/api/rooms/{code}/expenses")
        assert resp.status_code == 200
        assert len(resp.get_json()) == 1

    def test_soft_delete_expense(self, two_user_room):
        client, code = two_user_room
        exp = client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Test", "amount": 100, "category": "Misc",
            "paid_by": 1, "split_type": "equal", "expense_date": "2026-01-15",
            "user_ids": [1, 2],
        }).get_json()

        resp = client.delete(f"/api/rooms/{code}/expenses/{exp['id']}")
        assert resp.status_code == 200

        # Should not appear in list
        resp = client.get(f"/api/rooms/{code}/expenses")
        assert len(resp.get_json()) == 0

    def test_non_owner_cannot_delete(self, two_user_room):
        client, code = two_user_room
        # User 1 creates expense
        exp = client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Test", "amount": 100, "category": "Misc",
            "paid_by": 1, "split_type": "equal", "expense_date": "2026-01-15",
            "user_ids": [1, 2],
        }).get_json()

        # Switch to user 2 (not the payer)
        client.post("/api/auth/logout", json={})
        client.post("/api/auth/login", json={"phone": "2222222222", "pin": "2222"})

        resp = client.delete(f"/api/rooms/{code}/expenses/{exp['id']}")
        assert resp.status_code == 403

    def test_payer_can_delete(self, two_user_room):
        client, code = two_user_room
        exp = client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Test", "amount": 100, "category": "Misc",
            "paid_by": 1, "split_type": "equal", "expense_date": "2026-01-15",
            "user_ids": [1, 2],
        }).get_json()

        # User 1 is the payer — can delete
        resp = client.delete(f"/api/rooms/{code}/expenses/{exp['id']}")
        assert resp.status_code == 200


# ─── Balance Tests ───────────────────────────────────────────────────────────

class TestBalances:
    def test_balances_reflect_expenses(self, two_user_room):
        client, code = two_user_room
        client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Test", "amount": 300, "category": "Misc",
            "paid_by": 1, "split_type": "equal", "expense_date": "2026-01-15",
            "user_ids": [1, 2],
        })
        resp = client.get(f"/api/rooms/{code}/balances")
        assert resp.status_code == 200
        balances = {b["user_id"]: b["balance"] for b in resp.get_json()}
        assert balances[1] == 150.0   # paid 300, owes 150
        assert balances[2] == -150.0  # owes 150

    def test_simplify_debts(self, two_user_room):
        client, code = two_user_room
        client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Test", "amount": 300, "category": "Misc",
            "paid_by": 1, "split_type": "equal", "expense_date": "2026-01-15",
            "user_ids": [1, 2],
        })
        resp = client.post(f"/api/rooms/{code}/debts/simplify")
        assert resp.status_code == 200
        debts = resp.get_json()
        assert len(debts) == 1
        assert debts[0]["from_user"] == 2
        assert debts[0]["to_user"] == 1
        assert debts[0]["amount"] == 150.0


# ─── Settlement Tests ────────────────────────────────────────────────────────

class TestSettlements:
    def test_record_settlement(self, two_user_room):
        client, code = two_user_room
        # Create expense
        client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Test", "amount": 300, "category": "Misc",
            "paid_by": 1, "split_type": "equal", "expense_date": "2026-01-15",
            "user_ids": [1, 2],
        })
        # Record settlement
        resp = client.post(f"/api/rooms/{code}/settlements", json={
            "from_user": 2, "to_user": 1, "amount": 150, "method": "upi", "note": "",
        })
        assert resp.status_code == 201

        # Balances should be settled
        resp = client.get(f"/api/rooms/{code}/balances")
        balances = {b["user_id"]: b["balance"] for b in resp.get_json()}
        assert balances[1] == 0
        assert balances[2] == 0

    def test_settlement_history(self, two_user_room):
        client, code = two_user_room
        client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Test", "amount": 300, "category": "Misc",
            "paid_by": 1, "split_type": "equal", "expense_date": "2026-01-15",
            "user_ids": [1, 2],
        })
        client.post(f"/api/rooms/{code}/settlements", json={
            "from_user": 2, "to_user": 1, "amount": 150, "method": "upi", "note": "",
        })
        resp = client.get(f"/api/rooms/{code}/settlements")
        assert resp.status_code == 200
        assert len(resp.get_json()) == 1


# ─── Recurring Tests ─────────────────────────────────────────────────────────

class TestRecurring:
    def test_add_recurring(self, auth_client):
        client, code = auth_client
        resp = client.post(f"/api/rooms/{code}/recurring", json={
            "name": "Monthly rent",
            "amount": 5000,
            "category": "Rent",
            "split_type": "equal",
            "paid_by": 1,
            "day_of_month": 1,
        })
        assert resp.status_code == 201
        assert resp.get_json()["name"] == "Monthly rent"

    def test_generate_recurring(self, two_user_room):
        client, code = two_user_room
        rec = client.post(f"/api/rooms/{code}/recurring", json={
            "name": "Rent", "amount": 5000, "category": "Rent",
            "split_type": "equal", "paid_by": 1, "day_of_month": 1,
        }).get_json()

        resp = client.post(f"/api/rooms/{code}/recurring/{rec['id']}/generate")
        assert resp.status_code == 201
        assert resp.get_json()["description"] == "Rent"

    def test_generate_recurring_idempotent(self, two_user_room):
        client, code = two_user_room
        rec = client.post(f"/api/rooms/{code}/recurring", json={
            "name": "Rent", "amount": 5000, "category": "Rent",
            "split_type": "equal", "paid_by": 1, "day_of_month": 1,
        }).get_json()

        # First generation succeeds
        resp = client.post(f"/api/rooms/{code}/recurring/{rec['id']}/generate")
        assert resp.status_code == 201

        # Second generation for same month fails
        resp = client.post(f"/api/rooms/{code}/recurring/{rec['id']}/generate")
        assert resp.status_code == 409

    def test_toggle_recurring(self, auth_client):
        client, code = auth_client
        rec = client.post(f"/api/rooms/{code}/recurring", json={
            "name": "Rent", "amount": 5000, "category": "Rent",
            "split_type": "equal", "paid_by": 1, "day_of_month": 1,
        }).get_json()

        resp = client.put(f"/api/rooms/{code}/recurring/{rec['id']}", json={"active": False})
        assert resp.status_code == 200
        assert resp.get_json()["active"] is False


# ─── Move-out Tests ──────────────────────────────────────────────────────────

class TestMoveOut:
    def test_move_out_settlement(self, two_user_room):
        client, code = two_user_room
        # Create expense: user 1 paid 300, split equally
        client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Test", "amount": 300, "category": "Misc",
            "paid_by": 1, "split_type": "equal", "expense_date": "2026-01-15",
            "user_ids": [1, 2],
        })

        # Move out user 2
        resp = client.post(f"/api/rooms/{code}/members/2/exit")
        assert resp.status_code == 200
        data = resp.get_json()
        # User 2 owes 150 (their share)
        assert data["net_balance_minor"] == -15000  # -150 rupees in paise

    def test_exited_member_cannot_access(self, two_user_room):
        client, code = two_user_room
        # Move out user 2
        client.post(f"/api/rooms/{code}/members/2/exit")

        # Switch to user 2
        client.post("/api/auth/logout", json={})
        client.post("/api/auth/login", json={"phone": "2222222222", "pin": "2222"})

        # Should not be able to access room
        resp = client.get(f"/api/rooms/{code}/expenses")
        assert resp.status_code == 404


# ─── Dashboard Tests ─────────────────────────────────────────────────────────

class TestDashboard:
    def test_dashboard_summary(self, two_user_room):
        client, code = two_user_room
        client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Test", "amount": 300, "category": "Misc",
            "paid_by": 1, "split_type": "equal", "expense_date": date.today().isoformat(),
            "user_ids": [1, 2],
        })
        resp = client.get(f"/api/rooms/{code}/dashboard")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["month_total"] == 300.0
        assert len(data["recent_expenses"]) == 1


# ─── CSV Export Tests ────────────────────────────────────────────────────────

class TestCSVExport:
    def test_csv_export(self, two_user_room):
        client, code = two_user_room
        client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Test", "amount": 300, "category": "Misc",
            "paid_by": 1, "split_type": "equal", "expense_date": "2026-01-15",
            "user_ids": [1, 2],
        })
        resp = client.get(f"/api/rooms/{code}/reports/monthly.csv?month=2026-01")
        assert resp.status_code == 200
        assert "text/csv" in resp.content_type
        assert b"Test" in resp.data


# ─── Security / input-validation regression tests ────────────────────────────
# Each of these would previously have corrupted the ledger, crashed the room,
# leaked data, or let a member act on someone else's behalf.

class TestSecurity:
    def _add(self, client, code, **payload):
        body = {"paid_by": 1, "split_type": "equal", "expense_date": "2026-01-15"}
        body.update(payload)
        return client.post(f"/api/rooms/{code}/expenses", json=body)

    def test_expense_rejects_non_member_payer(self, two_user_room):
        client, code = two_user_room
        assert self._add(client, code, amount=100, paid_by=9999).status_code == 400

    def test_expense_rejects_non_member_in_split(self, two_user_room):
        client, code = two_user_room
        assert self._add(client, code, amount=100, user_ids=[1, 9999]).status_code == 400

    def test_expense_rejects_custom_share_from_non_member(self, two_user_room):
        client, code = two_user_room
        resp = self._add(client, code, amount=100, split_type="custom",
                         shares={"1": 50, "9999": 50})
        assert resp.status_code == 400

    def test_room_still_loads_after_unknown_id_attempt(self, two_user_room):
        """Regression: a crafted split used to persist a dangling row that then
        500'd every list/balance/simplify call for the whole room, forever."""
        client, code = two_user_room
        self._add(client, code, amount=100, split_type="custom", shares={"9999": 100})
        assert client.get(f"/api/rooms/{code}/expenses").status_code == 200
        assert client.get(f"/api/rooms/{code}/balances").status_code == 200
        assert client.post(f"/api/rooms/{code}/debts/simplify").status_code == 200

    def test_expense_rejects_negative_share(self, two_user_room):
        client, code = two_user_room
        resp = self._add(client, code, amount=100, split_type="custom",
                         shares={"1": 200, "2": -100})
        assert resp.status_code == 400

    def test_expense_rejects_negative_percentage(self, two_user_room):
        client, code = two_user_room
        resp = self._add(client, code, amount=100, split_type="percentage",
                         percentages={"1": 200, "2": -100})
        assert resp.status_code == 400

    def test_expense_rejects_non_numeric_amount(self, two_user_room):
        client, code = two_user_room
        assert self._add(client, code, amount="not-a-number").status_code == 400

    def test_expense_rejects_absurd_amount(self, two_user_room):
        client, code = two_user_room
        assert self._add(client, code, amount=1e18).status_code == 400

    def test_expense_rejects_bad_date(self, two_user_room):
        client, code = two_user_room
        assert self._add(client, code, amount=100, expense_date="15-01-2026").status_code == 400

    def test_settlement_rejects_non_member(self, two_user_room):
        client, code = two_user_room
        resp = client.post(f"/api/rooms/{code}/settlements",
                           json={"from_user": 1, "to_user": 9999, "amount": 100})
        assert resp.status_code == 400

    def test_settlement_rejects_same_person(self, two_user_room):
        client, code = two_user_room
        resp = client.post(f"/api/rooms/{code}/settlements",
                           json={"from_user": 1, "to_user": 1, "amount": 100})
        assert resp.status_code == 400

    def test_non_owner_cannot_remove_member(self, two_user_room):
        client, code = two_user_room
        client.post("/api/auth/logout", json={})
        client.post("/api/auth/login", json={"phone": "2222222222", "pin": "2222"})
        assert client.post(f"/api/rooms/{code}/members/1/exit").status_code == 403

    def test_member_can_remove_self(self, two_user_room):
        client, code = two_user_room
        client.post("/api/auth/logout", json={})
        client.post("/api/auth/login", json={"phone": "2222222222", "pin": "2222"})
        assert client.post(f"/api/rooms/{code}/members/2/exit").status_code == 200

    def test_non_owner_cannot_change_other_deposit(self, two_user_room):
        client, code = two_user_room
        client.post("/api/auth/logout", json={})
        client.post("/api/auth/login", json={"phone": "2222222222", "pin": "2222"})
        resp = client.put(f"/api/rooms/{code}/members/1/deposit", json={"deposit": 5000})
        assert resp.status_code == 403

    def test_deposit_rejects_negative(self, two_user_room):
        client, code = two_user_room
        resp = client.put(f"/api/rooms/{code}/members/1/deposit", json={"deposit": -100})
        assert resp.status_code == 400

    def test_invalid_upi_id_rejected(self, client):
        client.post("/api/auth/signup", json={"name": "Test", "phone": "9999999999", "pin": "1234"})
        resp = client.put("/api/auth/me", json={"upi_id": 'x" onmouseover="alert(1)'})
        assert resp.status_code == 400

    def test_valid_upi_id_accepted(self, client):
        client.post("/api/auth/signup", json={"name": "Test", "phone": "9999999999", "pin": "1234"})
        resp = client.put("/api/auth/me", json={"upi_id": "test@okhdfcbank"})
        assert resp.status_code == 200

    def test_upi_link_is_url_encoded(self, two_user_room):
        client, code = two_user_room
        # user 2 adds a UPI id and pays for everything, so user 1 owes them
        client.post("/api/auth/logout", json={})
        client.post("/api/auth/login", json={"phone": "2222222222", "pin": "2222"})
        client.put("/api/auth/me", json={"upi_id": "bob@ybl"})
        client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Lunch", "amount": 100, "category": "Mess",
            "paid_by": 2, "split_type": "equal", "expense_date": "2026-01-15",
        })
        # back to user 1 and simplify
        client.post("/api/auth/logout", json={})
        client.post("/api/auth/login", json={"phone": "1111111111", "pin": "1111"})
        tx = client.post(f"/api/rooms/{code}/debts/simplify").get_json()
        assert len(tx) == 1
        link = tx[0]["upi_link"]
        assert link is not None
        assert "pa=bob%40ybl" in link      # '@' is percent-encoded
        assert '"' not in link             # nothing can break out of the href

    def test_security_headers_present(self, client):
        resp = client.get("/")
        assert resp.headers["X-Content-Type-Options"] == "nosniff"
        assert resp.headers["X-Frame-Options"] == "DENY"
        assert "Content-Security-Policy" in resp.headers

    def test_csv_rejects_bad_month(self, two_user_room):
        client, code = two_user_room
        resp = client.get(f"/api/rooms/{code}/reports/monthly.csv?month=2026-01-99")
        assert resp.status_code == 400

    def test_csv_neutralises_formula_injection(self, two_user_room):
        client, code = two_user_room
        self._add(client, code, description="=cmd|'/c calc'!A1", amount=300)
        resp = client.get(f"/api/rooms/{code}/reports/monthly.csv?month=2026-01")
        assert resp.status_code == 200
        assert b"'=cmd" in resp.data

    def test_members_endpoint_hides_phone(self, two_user_room):
        client, code = two_user_room
        members = client.get(f"/api/rooms/{code}/members").get_json()
        assert members and all("phone" not in m for m in members)

    def test_signup_rejects_bad_phone(self, client):
        resp = client.post("/api/auth/signup", json={"name": "Test", "phone": "12", "pin": "1234"})
        assert resp.status_code == 400

    def test_login_lockout_after_repeated_failures(self, client):
        client.post("/api/auth/signup", json={"name": "Test", "phone": "9999999999", "pin": "1234"})
        for _ in range(10):
            client.post("/api/auth/login", json={"phone": "9999999999", "pin": "0000"})
        # correct PIN is refused while the account is locked out
        resp = client.post("/api/auth/login", json={"phone": "9999999999", "pin": "1234"})
        assert resp.status_code == 429

    def test_stale_session_for_deleted_user_is_rejected(self, client):
        client.post("/api/auth/signup", json={"name": "Ghost", "phone": "9999999999", "pin": "1234"})
        assert client.get("/api/rooms").status_code == 200

        # Delete the account out from under the still-valid session cookie.
        with app.app_context():
            ghost = User.query.filter_by(phone="9999999999").first()
            _db.session.delete(ghost)
            _db.session.commit()

        # A stale session must be rejected (401 / redirect), never crash with 500.
        assert client.get("/api/rooms").status_code == 401
        assert client.get("/api/notifications").status_code == 401
        assert client.get("/rooms").status_code == 302


# ─── Notification Tests ──────────────────────────────────────────────────────

class TestNotifications:
    def _feed(self, client):
        data = client.get("/api/notifications").get_json()
        return [i["kind"] for i in data["items"]], data["unread"]

    def _login(self, client, phone, pin):
        client.post("/api/auth/logout", json={})
        client.post("/api/auth/login", json={"phone": phone, "pin": pin})

    def test_requires_auth(self, client):
        assert client.get("/api/notifications").status_code == 401

    def test_join_notifies_existing_members(self, two_user_room):
        client, code = two_user_room
        kinds, unread = self._feed(client)  # Alice is logged in
        assert "member_joined" in kinds
        assert unread >= 1

    def test_expense_notifies_other_member_only(self, two_user_room):
        client, code = two_user_room
        client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Groceries", "amount": 400, "category": "Groceries",
            "paid_by": 1, "split_type": "equal", "expense_date": "2026-01-15",
            "user_ids": [1, 2],
        })
        # The actor (Alice) is never notified about her own expense.
        kinds_alice, _ = self._feed(client)
        assert "expense_added" not in kinds_alice

        self._login(client, "2222222222", "2222")
        kinds_bob, unread_bob = self._feed(client)
        assert "expense_added" in kinds_bob
        assert unread_bob >= 1

    def test_delete_notifies_other_member(self, two_user_room):
        client, code = two_user_room
        exp = client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Cab", "amount": 200, "category": "Travel",
            "paid_by": 1, "split_type": "equal", "expense_date": "2026-01-15",
            "user_ids": [1, 2],
        }).get_json()
        client.delete(f"/api/rooms/{code}/expenses/{exp['id']}")
        self._login(client, "2222222222", "2222")
        kinds, _ = self._feed(client)
        assert "expense_deleted" in kinds

    def test_dispute_and_resolve_notify(self, two_user_room):
        client, code = two_user_room
        exp = client.post(f"/api/rooms/{code}/expenses", json={
            "description": "Dinner", "amount": 300, "category": "Food",
            "paid_by": 1, "split_type": "equal", "expense_date": "2026-01-15",
            "user_ids": [1, 2],
        }).get_json()
        client.post(f"/api/rooms/{code}/expenses/{exp['id']}/dispute", json={"note": "wrong"})
        client.post(f"/api/rooms/{code}/expenses/{exp['id']}/resolve", json={})
        self._login(client, "2222222222", "2222")
        kinds, _ = self._feed(client)
        assert "expense_disputed" in kinds
        assert "expense_resolved" in kinds

    def test_settlement_notifies_payee(self, two_user_room):
        client, code = two_user_room
        client.post(f"/api/rooms/{code}/settlements", json={
            "from_user": 1, "to_user": 2, "amount": 250, "method": "upi",
        })
        self._login(client, "2222222222", "2222")
        kinds, _ = self._feed(client)
        assert "settlement" in kinds

    def test_deposit_change_notifies_member(self, two_user_room):
        client, code = two_user_room
        client.put(f"/api/rooms/{code}/members/2/deposit", json={"deposit": 1000})
        self._login(client, "2222222222", "2222")
        kinds, _ = self._feed(client)
        assert "deposit_changed" in kinds

    def test_move_out_notifies_remaining_members(self, two_user_room):
        client, code = two_user_room
        # Bob moves himself out; Alice (who stays) should hear about it.
        # (When the owner removes someone else the actor is skipped by design.)
        self._login(client, "2222222222", "2222")
        client.post(f"/api/rooms/{code}/members/2/exit")
        self._login(client, "1111111111", "1111")
        kinds, _ = self._feed(client)
        assert "member_exited" in kinds

    def test_mark_all_read(self, two_user_room):
        client, code = two_user_room
        assert client.get("/api/notifications").get_json()["unread"] >= 1
        assert client.post("/api/notifications/read", json={}).status_code == 200
        after = client.get("/api/notifications").get_json()
        assert after["unread"] == 0
        assert all(i["read"] for i in after["items"])
        assert after["items"]  # notifications are kept, just marked read

    def test_mark_single_read_is_scoped_to_owner(self, two_user_room):
        client, code = two_user_room
        items = client.get("/api/notifications").get_json()["items"]
        assert items
        nid = items[0]["id"]
        assert client.post(f"/api/notifications/{nid}/read", json={}).status_code == 200

        self._login(client, "2222222222", "2222")
        # Bob must not be able to touch Alice's notification.
        assert client.post(f"/api/notifications/{nid}/read", json={}).status_code == 404

    def test_recurring_due_reminder_created_then_cleared(self, auth_client):
        client, code = auth_client
        rec = client.post(f"/api/rooms/{code}/recurring", json={
            "name": "Rent", "amount": 5000, "category": "Rent",
            "split_type": "equal", "paid_by": 1, "day_of_month": 1,
        }).get_json()
        kinds, _ = self._feed(client)
        assert "recurring_due" in kinds

        client.post(f"/api/rooms/{code}/recurring/{rec['id']}/generate")
        kinds_after, _ = self._feed(client)
        assert "recurring_due" not in kinds_after
