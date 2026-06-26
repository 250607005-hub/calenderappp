"""CalSync backend API tests."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
if not BASE_URL:
    # fallback: read frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break

ADMIN_EMAIL = "admin@calsync.app"
USER_EMAIL = f"TEST_user_{uuid.uuid4().hex[:8]}@calsync.app"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_auth(s):
    r = s.post(f"{BASE_URL}/api/auth/google/mobile",
               json={"mock_email": ADMIN_EMAIL, "mock_name": "Admin User"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["is_admin"] is True
    assert data["user"]["google_connected"] is True
    return data


@pytest.fixture(scope="module")
def user_auth(s):
    r = s.post(f"{BASE_URL}/api/auth/google/mobile",
               json={"mock_email": USER_EMAIL, "mock_name": "Demo User"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["is_admin"] is False
    return data


# -- Auth --
def test_root(s):
    r = s.get(f"{BASE_URL}/api/")
    assert r.status_code == 200
    assert r.json()["google_mock_mode"] is True


def test_auth_me_admin(s, admin_auth):
    r = s.get(f"{BASE_URL}/api/auth/me",
              headers={"Authorization": f"Bearer {admin_auth['token']}"})
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL
    assert r.json()["is_admin"] is True


def test_auth_me_user(s, user_auth):
    r = s.get(f"{BASE_URL}/api/auth/me",
              headers={"Authorization": f"Bearer {user_auth['token']}"})
    assert r.status_code == 200
    assert r.json()["is_admin"] is False


def test_auth_me_no_token(s):
    r = s.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 401


# -- Admin RBAC --
def test_non_admin_broadcast_403(s, user_auth):
    body = {
        "title": "Should fail",
        "description": "x",
        "start_time": datetime.now(timezone.utc).isoformat(),
        "end_time": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    }
    r = s.post(f"{BASE_URL}/api/admin/broadcast-event", json=body,
               headers={"Authorization": f"Bearer {user_auth['token']}"})
    assert r.status_code == 403


# -- Push --
def test_register_push(s, user_auth):
    r = s.post(f"{BASE_URL}/api/register-push",
               json={"user_id": user_auth["user"]["id"], "platform": "ios",
                     "device_token": "TEST_tok_abc"})
    assert r.status_code == 201
    assert r.json()["status"] == "registered_local_only"


# -- Broadcast flow --
def test_admin_broadcast_and_sync(s, admin_auth, user_auth):
    # ensure user exists by hitting /me
    s.get(f"{BASE_URL}/api/auth/me",
          headers={"Authorization": f"Bearer {user_auth['token']}"})
    start = datetime.now(timezone.utc) + timedelta(days=1)
    body = {
        "title": "TEST_Broadcast",
        "description": "Hello team",
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(hours=1)).isoformat(),
        "location": "Zoom",
    }
    r = s.post(f"{BASE_URL}/api/admin/broadcast-event", json=body,
               headers={"Authorization": f"Bearer {admin_auth['token']}"})
    assert r.status_code == 200, r.text
    ev = r.json()
    assert ev["recipients_count"] >= 1
    assert ev["success_count"] >= 1
    assert ev["failure_count"] == 0

    # user sees it in /me/events
    r = s.get(f"{BASE_URL}/api/me/events",
              headers={"Authorization": f"Bearer {user_auth['token']}"})
    assert r.status_code == 200
    titles = [e["title"] for e in r.json()]
    assert "TEST_Broadcast" in titles
    statuses = [e["status"] for e in r.json() if e["title"] == "TEST_Broadcast"]
    assert "mock" in statuses

    # admin sees broadcasts list
    r = s.get(f"{BASE_URL}/api/admin/broadcasts",
              headers={"Authorization": f"Bearer {admin_auth['token']}"})
    assert r.status_code == 200
    assert any(b["title"] == "TEST_Broadcast" for b in r.json())


def test_broadcast_validation(s, admin_auth):
    start = datetime.now(timezone.utc)
    body = {
        "title": "bad", "description": "",
        "start_time": start.isoformat(),
        "end_time": (start - timedelta(hours=1)).isoformat(),
    }
    r = s.post(f"{BASE_URL}/api/admin/broadcast-event", json=body,
               headers={"Authorization": f"Bearer {admin_auth['token']}"})
    assert r.status_code == 400


# -- Disconnect Google --
def test_disconnect_google(s):
    # Use a throwaway user so we don't affect other tests
    email = f"TEST_disc_{uuid.uuid4().hex[:8]}@calsync.app"
    r = s.post(f"{BASE_URL}/api/auth/google/mobile",
               json={"mock_email": email, "mock_name": "Disc"})
    assert r.status_code == 200
    tok = r.json()["token"]
    assert r.json()["user"]["google_connected"] is True
    r = s.post(f"{BASE_URL}/api/auth/disconnect-google",
               headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    r = s.get(f"{BASE_URL}/api/auth/me",
              headers={"Authorization": f"Bearer {tok}"})
    assert r.json()["google_connected"] is False
