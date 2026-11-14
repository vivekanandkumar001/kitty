"""End-to-end tests for the OTP auth flow (sign-up + sign-in).

Runs entirely against in-memory SQLite with demo-mode OTP delivery, so no
SMS provider, network access or production database is touched.

    cd backend
    TESTING=true python -m pytest tests/test_otp.py -q
"""
import os
import sys
from datetime import datetime, timedelta

os.environ["TESTING"] = "true"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import pytest

from app import app
from models import db, User, OtpCode


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    with app.app_context():
        db.drop_all()
        db.create_all()
    with app.test_client() as c:
        yield c
    with app.app_context():
        db.drop_all()
        db.create_all()


def request_otp(client, phone="9876543210", purpose="signup"):
    return client.post("/api/auth/otp/request",
                       json={"phone": phone, "purpose": purpose})


def verify_otp(client, phone, code, purpose="signup", name=None):
    body = {"phone": phone, "code": code, "purpose": purpose}
    if name is not None:
        body["name"] = name
    return client.post("/api/auth/otp/verify", json=body)


def request_dev_otp(client, phone="9876543210", purpose="signup"):
    res = request_otp(client, phone, purpose)
    assert res.status_code == 200, res.get_data(as_text=True)
    return res.get_json()["dev_otp"]


# ─── Request endpoint ───────────────────────────────────────────────

def test_signup_request_sends_demo_code(client):
    res = request_otp(client)
    assert res.status_code == 200
    data = res.get_json()
    assert data["ok"] is True
    assert data["demo"] is True
    assert len(data["dev_otp"]) == 6
    assert data["dev_otp"].isdigit()


def test_login_request_unknown_phone_404(client):
    res = request_otp(client, phone="9000000001", purpose="login")
    assert res.status_code == 404


def test_signup_request_existing_phone_409(client):
    code = request_dev_otp(client, purpose="signup")
    res = verify_otp(client, "9876543210", code, "signup", name="Ada")
    assert res.status_code == 201
    res = request_otp(client, purpose="signup")
    assert res.status_code == 409


def test_request_rejects_bad_phone(client):
    assert request_otp(client, phone="abc").status_code == 400
    assert request_otp(client, phone="12").status_code == 400


def test_request_rejects_bad_purpose(client):
    res = client.post("/api/auth/otp/request", json={"phone": "9876543210", "purpose": "hack"})
    assert res.status_code == 400


def test_resend_cooldown_blocks_immediate_retry(client):
    assert request_otp(client).status_code == 200
    res = request_otp(client)
    assert res.status_code == 429
    assert "retry_after" in res.get_json()


# ─── Verify endpoint ─────────────────────────────────────────────────

def test_signup_flow_end_to_end(client):
    code = request_dev_otp(client)
    res = verify_otp(client, "9876543210", code, "signup", name="Ada Lovelace")
    assert res.status_code == 201
    assert res.get_json()["name"] == "Ada Lovelace"

    # Session cookie is set — authenticated endpoint works
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.get_json()["phone"] == "9876543210"


def test_signup_requires_name(client):
    code = request_dev_otp(client)
    res = verify_otp(client, "9876543210", code, "signup", name="A")
    assert res.status_code == 400
    assert "name" in res.get_json()["error"].lower()


def test_new_account_gets_welcome_notification(client):
    code = request_dev_otp(client)
    verify_otp(client, "9876543210", code, "signup", name="Ada")
    res = client.get("/api/notifications")
    assert res.status_code == 200
    items = res.get_json()["items"]
    assert any(n["title"] == "Welcome to Kitty!" for n in items)


def test_login_flow_end_to_end(client):
    code = request_dev_otp(client, purpose="signup")
    verify_otp(client, "9876543210", code, "signup", name="Ada")
    client.post("/api/auth/logout")

    code = request_dev_otp(client, purpose="login")
    res = verify_otp(client, "9876543210", code, purpose="login")
    assert res.status_code == 200
    assert client.get("/api/auth/me").status_code == 200


def test_wrong_code_counts_attempts_and_locks(client):
    request_dev_otp(client)
    for attempt in range(5):
        res = verify_otp(client, "9876543210", "000000", "signup", name="Ada")
        assert res.status_code in (401, 429)
    res = verify_otp(client, "9876543210", "111111", "signup", name="Ada")
    assert res.status_code == 429


def test_expired_code_rejected(client):
    code = request_dev_otp(client)
    with app.app_context():
        otp = (OtpCode.query.filter_by(phone="9876543210")
               .order_by(OtpCode.created_at.desc()).first())
        otp.expires_at = datetime.utcnow() - timedelta(minutes=1)
        db.session.commit()
    res = verify_otp(client, "9876543210", code, "signup", name="Ada")
    assert res.status_code == 400
    assert "expired" in res.get_json()["error"].lower()


def test_consumed_code_cannot_be_reused(client):
    code = request_dev_otp(client)
    assert verify_otp(client, "9876543210", code, "signup", name="Ada").status_code == 201
    # Re-using the same code — no active challenge left
    res = verify_otp(client, "9876543210", code, "signup", name="Ada")
    assert res.status_code in (400, 409)


def test_verify_rejects_malformed_code(client):
    request_dev_otp(client)
    assert verify_otp(client, "9876543210", "12ab56", "signup", name="Ada").status_code == 400
    assert verify_otp(client, "9876543210", "12345", "signup", name="Ada").status_code == 400


def test_otp_stored_hashed_not_plaintext(client):
    code = request_dev_otp(client)
    with app.app_context():
        otp = OtpCode.query.order_by(OtpCode.created_at.desc()).first()
        assert code not in otp.code_hash
