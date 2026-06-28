"""Tests for interest onboarding + category-aware broadcast fan-out."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = None
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break

ADMIN_EMAIL = "admin@calsync.app"


def _login(email, name="X"):
    r = requests.post(f"{BASE_URL}/api/auth/google/mobile",
                      json={"mock_email": email, "mock_name": name})
    assert r.status_code == 200, r.text
    return r.json()


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def test_new_user_has_empty_interests():
    data = _login(f"TEST_new_{uuid.uuid4().hex[:6]}@x.app")
    assert "interests" in data["user"]
    assert data["user"]["interests"] == []


def test_set_interests_filters_invalid():
    data = _login(f"TEST_int_{uuid.uuid4().hex[:6]}@x.app")
    tok = data["token"]
    r = requests.put(f"{BASE_URL}/api/auth/interests",
                     json={"interests": ["internship", "bogus", "job"]},
                     headers=_hdr(tok))
    assert r.status_code == 200, r.text
    assert set(r.json()["interests"]) == {"internship", "job"}
    # me reflects it
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok)).json()
    assert set(me["interests"]) == {"internship", "job"}


def test_set_interests_requires_auth():
    r = requests.put(f"{BASE_URL}/api/auth/interests",
                     json={"interests": ["internship"]})
    assert r.status_code == 401


def test_broadcast_rejects_invalid_category():
    admin = _login(ADMIN_EMAIL, "Admin")
    start = datetime.now(timezone.utc) + timedelta(days=2)
    body = {
        "title": "TEST_bad_cat", "description": "",
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(hours=1)).isoformat(),
        "category": "not_a_category",
    }
    r = requests.post(f"{BASE_URL}/api/admin/broadcast-event",
                      json=body, headers=_hdr(admin["token"]))
    assert r.status_code == 400


def test_category_aware_fanout():
    admin = _login(ADMIN_EMAIL, "Admin")
    # Build 3 users with distinct interests
    suffix = uuid.uuid4().hex[:6]
    a = _login(f"TEST_a_{suffix}@x.app")
    b = _login(f"TEST_b_{suffix}@x.app")
    c = _login(f"TEST_c_{suffix}@x.app")
    requests.put(f"{BASE_URL}/api/auth/interests",
                 json={"interests": ["internship"]}, headers=_hdr(a["token"]))
    requests.put(f"{BASE_URL}/api/auth/interests",
                 json={"interests": ["job"]}, headers=_hdr(b["token"]))
    requests.put(f"{BASE_URL}/api/auth/interests",
                 json={"interests": ["all"]}, headers=_hdr(c["token"]))

    # snapshot existing counts of internship events for each user
    def count_for(tok, title):
        rows = requests.get(f"{BASE_URL}/api/me/events", headers=_hdr(tok)).json()
        return sum(1 for r in rows if r["title"] == title)

    title = f"TEST_internship_{suffix}"
    start = datetime.now(timezone.utc) + timedelta(days=3)
    body = {
        "title": title, "description": "internship broadcast",
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(hours=1)).isoformat(),
        "category": "internship",
        "send_push": False,
    }
    r = requests.post(f"{BASE_URL}/api/admin/broadcast-event",
                      json=body, headers=_hdr(admin["token"]))
    assert r.status_code == 200, r.text
    ev = r.json()
    # A (internship) + C (all) should get it, B (job) should NOT.
    # recipients_count counts non-admin targets matched
    assert ev["recipients_count"] >= 2  # may include other test users
    assert count_for(a["token"], title) == 1
    assert count_for(b["token"], title) == 0
    assert count_for(c["token"], title) == 1


def test_public_user_includes_interests_field():
    data = _login(f"TEST_pu_{uuid.uuid4().hex[:6]}@x.app")
    assert isinstance(data["user"].get("interests"), list)
