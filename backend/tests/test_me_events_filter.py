"""Tests for /api/me/events interest filtering (iter5)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://cal-sync-hub-2.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@calsync.app"


def _login(email: str) -> dict:
    r = requests.post(f"{BASE_URL}/api/auth/google/mobile", json={"mock_email": email, "mock_name": email.split("@")[0]})
    assert r.status_code == 200, r.text
    return r.json()


def _set_interests(token: str, interests: list[str]) -> dict:
    r = requests.put(
        f"{BASE_URL}/api/auth/interests",
        headers={"Authorization": f"Bearer {token}"},
        json={"interests": interests},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _broadcast(admin_token: str, title: str, category: str) -> dict:
    r = requests.post(
        f"{BASE_URL}/api/admin/broadcast-event",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "title": title,
            "description": "qa",
            "start_time": "2030-01-15T10:00:00+00:00",
            "end_time": "2030-01-15T11:00:00+00:00",
            "category": category,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


def _my_events(token: str) -> list:
    r = requests.get(f"{BASE_URL}/api/me/events", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL)["token"]


@pytest.fixture(scope="module")
def user_setup(admin_token):
    """Create a fresh user with interests=['all'], then admin broadcasts a scholarship + internship event."""
    email = f"TEST_iter5_{uuid.uuid4().hex[:8]}@calsync.app"
    auth = _login(email)
    token = auth["token"]
    _set_interests(token, ["all"])

    schol_title = f"TEST_iter5_schol_{uuid.uuid4().hex[:6]}"
    intern_title = f"TEST_iter5_intern_{uuid.uuid4().hex[:6]}"
    _broadcast(admin_token, schol_title, "scholarship")
    _broadcast(admin_token, intern_title, "internship")
    return {"token": token, "email": email, "schol_title": schol_title, "intern_title": intern_title}


def _titles(events):
    return {e["title"] for e in events}


def test_all_interests_sees_both(user_setup):
    titles = _titles(_my_events(user_setup["token"]))
    assert user_setup["schol_title"] in titles
    assert user_setup["intern_title"] in titles


def test_switch_to_internship_hides_scholarship(user_setup):
    _set_interests(user_setup["token"], ["internship"])
    titles = _titles(_my_events(user_setup["token"]))
    assert user_setup["intern_title"] in titles
    assert user_setup["schol_title"] not in titles, "scholarship row should be hidden by filter"


def test_switch_to_scholarship_hides_internship(user_setup):
    _set_interests(user_setup["token"], ["scholarship"])
    titles = _titles(_my_events(user_setup["token"]))
    assert user_setup["schol_title"] in titles
    assert user_setup["intern_title"] not in titles


def test_back_to_all_sees_both(user_setup):
    _set_interests(user_setup["token"], ["all"])
    titles = _titles(_my_events(user_setup["token"]))
    assert user_setup["schol_title"] in titles
    assert user_setup["intern_title"] in titles


def test_empty_interests_see_everything(user_setup):
    _set_interests(user_setup["token"], [])
    titles = _titles(_my_events(user_setup["token"]))
    assert user_setup["schol_title"] in titles
    assert user_setup["intern_title"] in titles


def test_admin_broadcasts_unaffected_by_admin_interests(admin_token):
    # Admin sets restrictive interests
    _set_interests(admin_token, ["mentorship"])
    r = requests.get(f"{BASE_URL}/api/admin/broadcasts", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    items = r.json()
    # Admin's /admin/broadcasts must include scholarship+internship events regardless of admin interests
    cats = {b["category"] for b in items}
    assert "scholarship" in cats or "internship" in cats, "admin should see all broadcasts"
    # Reset admin interests
    _set_interests(admin_token, [])
