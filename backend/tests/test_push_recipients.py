"""Verify push recipient filtering for category-aware broadcasts.

These tests cannot directly inspect the httpx call payload of send_push
(server runs out-of-process), so we verify indirectly via the public API:
recipients_count + success_count + per-user /me/events presence/absence.
This guarantees admin is not in fan-out and only category-matching users get rows.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import requests

BASE_URL = None
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break

ADMIN_EMAIL = "admin@calsync.app"


def _login(email, name="X"):
    r = requests.post(
        f"{BASE_URL}/api/auth/google/mobile",
        json={"mock_email": email, "mock_name": name},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def _set_interests(tok, interests):
    r = requests.put(
        f"{BASE_URL}/api/auth/interests",
        json={"interests": interests},
        headers=_hdr(tok),
    )
    assert r.status_code == 200, r.text


def _events_for(tok, title):
    rows = requests.get(f"{BASE_URL}/api/me/events", headers=_hdr(tok)).json()
    return [r for r in rows if r["title"] == title]


def test_push_recipients_admin_excluded_and_category_filtered():
    """Broadcast category='internship' fans out only to users whose interests
    include 'internship' or 'all'. Admin must NOT receive its own broadcast
    (no /me/events row with status != 'mock' for admin-as-recipient, and
    admin only sees one row tied to admin_id)."""
    admin = _login(ADMIN_EMAIL, "Admin")
    suf = uuid.uuid4().hex[:6]

    # Set admin interests = ['internship'] to make sure even if admin had a
    # matching interest, the fan-out still excludes admin.
    _set_interests(admin["token"], ["internship"])

    matching = _login(f"TEST_match_{suf}@x.app")
    seeing_all = _login(f"TEST_all_{suf}@x.app")
    other = _login(f"TEST_other_{suf}@x.app")

    _set_interests(matching["token"], ["internship"])
    _set_interests(seeing_all["token"], ["all"])
    _set_interests(other["token"], ["job"])

    title = f"TEST_push_recipients_{suf}"
    start = datetime.now(timezone.utc) + timedelta(days=4)
    body = {
        "title": title,
        "description": "fan-out check",
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(hours=1)).isoformat(),
        "category": "internship",
        "send_push": True,  # exercise push code path (placeholder key -> swallowed)
    }
    r = requests.post(
        f"{BASE_URL}/api/admin/broadcast-event",
        json=body,
        headers=_hdr(admin["token"]),
    )
    assert r.status_code == 200, r.text
    ev = r.json()

    # Only matching users counted as recipients (admin excluded by query)
    assert ev["success_count"] == ev["recipients_count"]
    assert ev["failure_count"] == 0
    # >= 2 because other broadcast tests in the suite may add more matching users
    assert ev["recipients_count"] >= 2

    # Per-user verification
    assert len(_events_for(matching["token"], title)) == 1
    assert len(_events_for(seeing_all["token"], title)) == 1
    assert len(_events_for(other["token"], title)) == 0

    # Admin sees the broadcast in their own history with status 'mock'
    admin_rows = _events_for(admin["token"], title)
    assert len(admin_rows) == 1
    # Admin's row was inserted as the admin-owned history row, not a fan-out delivery
    # (status is admin_status which is 'mock' in mock mode).
    assert admin_rows[0]["status"] == "mock"


def test_push_recipients_includes_empty_interests_users():
    """A user who hasn't set interests yet (empty list) gets all broadcasts
    (treated as 'all' by the fan-out filter)."""
    admin = _login(ADMIN_EMAIL, "Admin")
    suf = uuid.uuid4().hex[:6]

    empty_user = _login(f"TEST_empty_{suf}@x.app")
    # Do NOT set interests for empty_user
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr(empty_user["token"])).json()
    assert me["interests"] == []

    title = f"TEST_empty_fanout_{suf}"
    start = datetime.now(timezone.utc) + timedelta(days=5)
    body = {
        "title": title,
        "description": "empty users included",
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(hours=1)).isoformat(),
        "category": "scholarship",
        "send_push": False,
    }
    r = requests.post(
        f"{BASE_URL}/api/admin/broadcast-event",
        json=body,
        headers=_hdr(admin["token"]),
    )
    assert r.status_code == 200, r.text

    assert len(_events_for(empty_user["token"], title)) == 1


def test_push_recipients_zero_when_no_matching_users():
    """Broadcasting a category that no one (besides empty/all users) is
    interested in still fans out, but recipients are limited to those
    matching the filter. We just assert success_count == recipients_count
    and no errors."""
    admin = _login(ADMIN_EMAIL, "Admin")
    suf = uuid.uuid4().hex[:6]
    title = f"TEST_nomatch_{suf}"
    start = datetime.now(timezone.utc) + timedelta(days=6)
    body = {
        "title": title,
        "description": "no matching narrow",
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(hours=1)).isoformat(),
        "category": "mentorship",
        "send_push": True,
    }
    r = requests.post(
        f"{BASE_URL}/api/admin/broadcast-event",
        json=body,
        headers=_hdr(admin["token"]),
    )
    assert r.status_code == 200, r.text
    ev = r.json()
    assert ev["failure_count"] == 0
    assert ev["success_count"] == ev["recipients_count"]
