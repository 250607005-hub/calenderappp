"""
CalSync Admin — FastAPI backend
================================

Google Calendar Automation & Notification System.

Notes
-----
- The original spec asked for SQLAlchemy + SQLite/PostgreSQL. The hosting
  environment ships with MongoDB preconfigured (MONGO_URL / DB_NAME), so this
  implementation uses Motor (async MongoDB). All endpoints, request/response
  shapes, and behaviours match the spec — only the persistence layer differs.
- Google OAuth has a real `requests-oauthlib` token-exchange code path. If the
  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars are unset the backend falls
  back to a MOCK mode that returns a synthetic refresh token and "syncs" events
  by writing them to MongoDB only. This lets the entire user / admin flow be
  exercised end-to-end without real Google credentials. Wire in real
  credentials and the same code path uploads to actual Google Calendars.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("calsync")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "postmessage").strip()
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@calsync.app").strip().lower()
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")
JWT_ALG = "HS256"
JWT_TTL_DAYS = 30

GOOGLE_MOCK_MODE = not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
if GOOGLE_MOCK_MODE:
    logger.warning(
        "Google OAuth running in MOCK mode (GOOGLE_CLIENT_ID/SECRET unset). "
        "Set both to enable real Google Calendar sync."
    )

PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
users_col = db["users"]
events_col = db["broadcast_events"]
syncs_col = db["user_event_syncs"]  # one row per (user, event) delivery
push_col = db["push_tokens"]

# ---------------------------------------------------------------------------
# Shared HTTP clients
# ---------------------------------------------------------------------------
push_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)
google_client = httpx.AsyncClient(timeout=15.0)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="CalSync Admin API")
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class GoogleMobileAuthBody(BaseModel):
    server_auth_code: str | None = None
    # Mock-mode fields (only used when GOOGLE_MOCK_MODE is on).
    mock_email: EmailStr | None = None
    mock_name: str | None = None


class MockLoginBody(BaseModel):
    email: EmailStr
    name: str | None = None


class AuthResponse(BaseModel):
    token: str
    user: "PublicUser"


class PublicUser(BaseModel):
    id: str
    email: EmailStr
    name: str
    is_admin: bool
    google_connected: bool
    interests: list[str] = Field(default_factory=list)
    created_at: datetime


class InterestsBody(BaseModel):
    interests: list[str]


# Allowed broadcast categories. Must match frontend src/lib/categories.ts keys.
ALLOWED_CATEGORIES = {
    "internship",
    "job",
    "self_improvement",
    "opportunities",
    "education",
    "scholarship",
    "mentorship",
    "networking",
}


class BroadcastBody(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    start_time: datetime
    end_time: datetime
    location: str | None = None
    category: str = "opportunities"
    all_day: bool = False
    reminder_minutes: int = 10  # 0 disables; matches Google's "Bildirim X dakika önce"
    recurrence: str = "none"  # none | daily | weekly | monthly
    visibility: str = "default"  # default | public | private
    busy_status: str = "busy"  # busy | free
    send_push: bool = True
    guests_can_invite_others: bool = True
    guests_can_see_other_guests: bool = True
    guests_can_modify: bool = False


class BroadcastEvent(BaseModel):
    id: str
    title: str
    description: str
    start_time: datetime
    end_time: datetime
    location: str | None = None
    category: str = "opportunities"
    all_day: bool = False
    reminder_minutes: int = 10
    recurrence: str = "none"
    visibility: str = "default"
    busy_status: str = "busy"
    send_push: bool = True
    guests_can_invite_others: bool = True
    guests_can_see_other_guests: bool = True
    guests_can_modify: bool = False
    admin_id: str
    admin_email: EmailStr
    created_at: datetime
    recipients_count: int
    success_count: int
    failure_count: int


class UserEventSync(BaseModel):
    id: str
    event_id: str
    title: str
    description: str
    category: str = "opportunities"
    start_time: datetime
    end_time: datetime
    delivered_at: datetime
    google_event_id: str | None = None
    status: str  # "synced" | "failed" | "mock"
    error: str | None = None


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str
    device_token: str


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def make_jwt(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": int(time.time()),
        "exp": int(time.time()) + JWT_TTL_DAYS * 86400,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_jwt(token: str) -> str:
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return data["sub"]
    except jwt.PyJWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"invalid token: {e}")


async def current_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    user_id = decode_jwt(authorization.split(" ", 1)[1])
    doc = await users_col.find_one({"id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found")
    return doc


async def require_admin(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if not user.get("is_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin only")
    return user


def to_public_user(doc: dict[str, Any]) -> PublicUser:
    return PublicUser(
        id=doc["id"],
        email=doc["email"],
        name=doc.get("name") or doc["email"].split("@")[0],
        is_admin=bool(doc.get("is_admin")),
        google_connected=bool(doc.get("google_refresh_token")),
        interests=list(doc.get("interests") or []),
        created_at=doc["created_at"],
    )


# ---------------------------------------------------------------------------
# Google OAuth
# ---------------------------------------------------------------------------
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_CALENDAR_INSERT_URL = (
    "https://www.googleapis.com/calendar/v3/calendars/primary/events"
)


async def google_exchange_code(server_auth_code: str) -> dict[str, Any]:
    """Exchange a serverAuthCode for tokens. Enforces offline access via the
    grant_type=authorization_code flow — Google returns a refresh_token because
    the client requested access_type=offline and prompt=consent."""
    resp = await google_client.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": server_auth_code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
            "access_type": "offline",
            "prompt": "consent",
        },
    )
    if resp.status_code >= 400:
        raise HTTPException(400, f"google token exchange failed: {resp.text}")
    return resp.json()


async def google_userinfo(access_token: str) -> dict[str, Any]:
    resp = await google_client.get(
        GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}
    )
    if resp.status_code >= 400:
        raise HTTPException(400, f"google userinfo failed: {resp.text}")
    return resp.json()


async def google_refresh_access_token(refresh_token: str) -> str:
    resp = await google_client.post(
        GOOGLE_TOKEN_URL,
        data={
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"refresh failed: {resp.text}")
    return resp.json()["access_token"]


async def google_insert_event(access_token: str, body: dict[str, Any]) -> dict[str, Any]:
    resp = await google_client.post(
        GOOGLE_CALENDAR_INSERT_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        json=body,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"calendar insert failed: {resp.text}")
    return resp.json()


def google_event_payload(ev: BroadcastBody) -> dict[str, Any]:
    """Build a Google Calendar v3 event body. Honours all-day, location,
    reminders, recurrence, visibility, busy/free transparency, and guest
    permissions — same fields shown in Google Calendar's event editor."""
    if ev.all_day:
        start_block = {"date": ev.start_time.date().isoformat()}
        end_block = {"date": ev.end_time.date().isoformat()}
    else:
        start_block = {"dateTime": ev.start_time.isoformat()}
        end_block = {"dateTime": ev.end_time.isoformat()}

    body: dict[str, Any] = {
        "summary": ev.title,
        "description": ev.description,
        "location": ev.location,
        "start": start_block,
        "end": end_block,
        "visibility": ev.visibility,
        "transparency": "transparent" if ev.busy_status == "free" else "opaque",
        "guestsCanInviteOthers": ev.guests_can_invite_others,
        "guestsCanSeeOtherGuests": ev.guests_can_see_other_guests,
        "guestsCanModify": ev.guests_can_modify,
    }
    if ev.reminder_minutes and ev.reminder_minutes > 0:
        body["reminders"] = {
            "useDefault": False,
            "overrides": [{"method": "popup", "minutes": ev.reminder_minutes}],
        }
    else:
        body["reminders"] = {"useDefault": False, "overrides": []}
    if ev.recurrence and ev.recurrence != "none":
        freq_map = {"daily": "DAILY", "weekly": "WEEKLY", "monthly": "MONTHLY"}
        freq = freq_map.get(ev.recurrence)
        if freq:
            body["recurrence"] = [f"RRULE:FREQ={freq}"]
    return body


# ---------------------------------------------------------------------------
# Push helper (Emergent managed)
# ---------------------------------------------------------------------------
async def send_push(recipients: list[str], data: dict[str, Any]) -> None:
    if not recipients:
        return
    try:
        for i in range(0, len(recipients), 100):
            chunk = recipients[i : i + 100]
            resp = await push_client.post(
                "/api/v1/push/trigger",
                json={"recipients": chunk, "data": data},
            )
            if resp.status_code >= 400:
                logger.warning("push trigger non-ok: %s %s", resp.status_code, resp.text[:200])
    except Exception as e:  # noqa: BLE001
        logger.warning("push trigger failed (non-blocking): %s", e)


# ---------------------------------------------------------------------------
# Category labels (server-side mirror of frontend src/lib/categories.ts)
# ---------------------------------------------------------------------------
CATEGORY_LABELS: dict[str, str] = {
    "internship": "Staj",
    "job": "İş",
    "self_improvement": "Kendini geliştirmek",
    "opportunities": "Yeni imkanlar",
    "education": "Eğitim & Kurs",
    "scholarship": "Burs",
    "mentorship": "Mentorluk",
    "networking": "Etkinlik",
}


def categoryLabelServer(key: str) -> str:  # noqa: N802
    return CATEGORY_LABELS.get(key, key)


# ---------------------------------------------------------------------------
# Routes — health
# ---------------------------------------------------------------------------
@api.get("/")
async def root() -> dict[str, Any]:
    return {
        "service": "calsync-admin",
        "status": "ok",
        "google_mock_mode": GOOGLE_MOCK_MODE,
        "admin_email": ADMIN_EMAIL,
    }


@api.get("/status")
async def status_check() -> dict[str, Any]:
    user_count = await users_col.count_documents({})
    event_count = await events_col.count_documents({})
    return {
        "ok": True,
        "google_mock_mode": GOOGLE_MOCK_MODE,
        "users": user_count,
        "events": event_count,
    }


# ---------------------------------------------------------------------------
# Routes — Auth
# ---------------------------------------------------------------------------
async def _upsert_user(
    *,
    email: str,
    name: str,
    google_refresh_token: str | None,
    google_access_token: str | None,
    token_expiry: datetime | None,
) -> dict[str, Any]:
    email = email.lower()
    existing = await users_col.find_one({"email": email}, {"_id": 0})
    now = datetime.now(timezone.utc)
    is_admin = email == ADMIN_EMAIL
    if existing:
        update: dict[str, Any] = {"name": name, "is_admin": is_admin, "updated_at": now}
        if google_refresh_token:
            update["google_refresh_token"] = google_refresh_token
        if google_access_token:
            update["google_access_token"] = google_access_token
            update["token_expiry"] = token_expiry
        await users_col.update_one({"id": existing["id"]}, {"$set": update})
        return await users_col.find_one({"id": existing["id"]}, {"_id": 0})
    new = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": name,
        "is_admin": is_admin,
        "google_refresh_token": google_refresh_token,
        "google_access_token": google_access_token,
        "token_expiry": token_expiry,
        "created_at": now,
        "updated_at": now,
    }
    await users_col.insert_one(new)
    return await users_col.find_one({"id": new["id"]}, {"_id": 0})


@api.post("/auth/google/mobile", response_model=AuthResponse)
async def google_mobile_auth(body: GoogleMobileAuthBody) -> AuthResponse:
    """Exchange Google `serverAuthCode` for tokens and create/refresh the user.

    When GOOGLE_MOCK_MODE is on, accepts `mock_email`/`mock_name` instead and
    returns a synthetic refresh token so the rest of the flow keeps working.
    """
    if GOOGLE_MOCK_MODE:
        email = (body.mock_email or "user@example.com").lower()
        name = body.mock_name or email.split("@")[0].replace(".", " ").title()
        user = await _upsert_user(
            email=email,
            name=name,
            google_refresh_token=f"mock-refresh-{uuid.uuid4()}",
            google_access_token=f"mock-access-{uuid.uuid4()}",
            token_expiry=datetime.now(timezone.utc) + timedelta(hours=1),
        )
    else:
        if not body.server_auth_code:
            raise HTTPException(400, "server_auth_code required")
        tokens = await google_exchange_code(body.server_auth_code)
        access_token = tokens["access_token"]
        refresh_token = tokens.get("refresh_token")
        if not refresh_token:
            raise HTTPException(
                400,
                "google did not return a refresh_token. Ensure access_type=offline "
                "and prompt=consent on the mobile-side request, and revoke prior consent.",
            )
        expires_in = int(tokens.get("expires_in", 3600))
        info = await google_userinfo(access_token)
        user = await _upsert_user(
            email=info["email"],
            name=info.get("name") or info["email"].split("@")[0],
            google_refresh_token=refresh_token,
            google_access_token=access_token,
            token_expiry=datetime.now(timezone.utc) + timedelta(seconds=expires_in),
        )
    return AuthResponse(token=make_jwt(user["id"]), user=to_public_user(user))


@api.post("/auth/mock-login", response_model=AuthResponse)
async def mock_login(body: MockLoginBody) -> AuthResponse:
    """Pure mock login (no Google involvement). Useful for demo / Expo Go."""
    name = body.name or body.email.split("@")[0].replace(".", " ").title()
    user = await _upsert_user(
        email=body.email,
        name=name,
        google_refresh_token=f"mock-refresh-{uuid.uuid4()}",
        google_access_token=None,
        token_expiry=None,
    )
    return AuthResponse(token=make_jwt(user["id"]), user=to_public_user(user))


@api.get("/auth/me", response_model=PublicUser)
async def get_me(user: dict[str, Any] = Depends(current_user)) -> PublicUser:
    return to_public_user(user)


@api.post("/auth/disconnect-google")
async def disconnect_google(user: dict[str, Any] = Depends(current_user)) -> dict[str, str]:
    await users_col.update_one(
        {"id": user["id"]},
        {"$set": {"google_refresh_token": None, "google_access_token": None, "token_expiry": None}},
    )
    return {"status": "disconnected"}


@api.put("/auth/interests", response_model=PublicUser)
async def set_interests(
    body: InterestsBody, user: dict[str, Any] = Depends(current_user)
) -> PublicUser:
    """Set the current user's interest categories.

    Accepts any of ALLOWED_CATEGORIES plus the special 'all' key (which
    matches every broadcast). Empty list also means see-everything for
    safety, so a misconfigured user never silently misses events.
    """
    allowed = ALLOWED_CATEGORIES | {"all"}
    interests = [k for k in dict.fromkeys(body.interests) if k in allowed]
    await users_col.update_one(
        {"id": user["id"]}, {"$set": {"interests": interests, "updated_at": datetime.now(timezone.utc)}}
    )
    doc = await users_col.find_one({"id": user["id"]}, {"_id": 0})
    return to_public_user(doc)


# ---------------------------------------------------------------------------
# Routes — Push
# ---------------------------------------------------------------------------
@api.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody) -> dict[str, str]:
    # Store local copy for diagnostics — Emergent push resolves by user_id.
    await push_col.update_one(
        {"user_id": body.user_id, "platform": body.platform},
        {
            "$set": {
                "user_id": body.user_id,
                "platform": body.platform,
                "device_token": body.device_token,
                "updated_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )
    if PUSH_KEY == "placeholder":
        logger.info("register-push (placeholder mode): %s/%s", body.user_id, body.platform)
        return {"status": "registered_local_only"}
    try:
        resp = await push_client.post("/api/v1/push/users/register", json=body.model_dump())
        if resp.status_code >= 500:
            raise HTTPException(502, "push provider unavailable")
        if resp.status_code == 401:
            raise HTTPException(500, "EMERGENT_PUSH_KEY invalid")
        resp.raise_for_status()
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.warning("register-push upstream failed (non-blocking): %s", e)
        return {"status": "registered_local_only"}
    return {"status": "registered"}


# ---------------------------------------------------------------------------
# Routes — User Dashboard
# ---------------------------------------------------------------------------
class SyncEventBody(BaseModel):
    """User-initiated sync to their own Google Calendar."""
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    start_time: datetime
    end_time: datetime
    location: str | None = None
    category: str = "opportunities"
    all_day: bool = False
    reminder_minutes: int = 10


class SyncEventResult(BaseModel):
    id: str
    google_event_id: str | None
    status: str
    error: str | None


@api.get("/me/events", response_model=list[UserEventSync])
async def my_synced_events(user: dict[str, Any] = Depends(current_user)) -> list[UserEventSync]:
    rows = await syncs_col.find({"user_id": user["id"]}, {"_id": 0}).sort("delivered_at", -1).to_list(200)
    # Filter by the user's CURRENT interests so that historic syncs from
    # categories the user no longer cares about disappear from the UI.
    # Empty interests OR 'all' => see-everything.
    interests = set(user.get("interests") or [])
    see_all = not interests or "all" in interests
    if not see_all:
        rows = [r for r in rows if r.get("category", "opportunities") in interests]
    out: list[UserEventSync] = []
    for r in rows:
        out.append(
            UserEventSync(
                id=r["id"],
                event_id=r["event_id"],
                title=r["title"],
                description=r.get("description", ""),
                category=r.get("category", "opportunities"),
                start_time=r["start_time"],
                end_time=r["end_time"],
                delivered_at=r["delivered_at"],
                google_event_id=r.get("google_event_id"),
                status=r["status"],
                error=r.get("error"),
            )
        )
    return out


@api.post("/me/sync-event", response_model=SyncEventResult)
async def sync_event_to_my_calendar(
    body: SyncEventBody, user: dict[str, Any] = Depends(current_user)
) -> SyncEventResult:
    """Sync a single event to the user's own Google Calendar.

    This is the 'Connect to My Calendar' feature - users can add any event
    to their personal Google Calendar with one tap.
    """
    if body.end_time <= body.start_time:
        raise HTTPException(400, "end_time must be after start_time")

    sync_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    refresh_token = user.get("google_refresh_token")

    # Check if user has connected Google Calendar
    if GOOGLE_MOCK_MODE or not refresh_token or str(refresh_token).startswith("mock-"):
        # Mock mode - just record the sync
        row = {
            "id": sync_id,
            "user_id": user["id"],
            "event_id": sync_id,
            "title": body.title,
            "description": body.description,
            "category": body.category,
            "start_time": body.start_time,
            "end_time": body.end_time,
            "delivered_at": now,
            "status": "mock",
            "google_event_id": f"mock-evt-{uuid.uuid4()}",
        }
        await syncs_col.insert_one(row)
        return SyncEventResult(
            id=sync_id,
            google_event_id=row["google_event_id"],
            status="mock",
            error=None,
        )

    try:
        # Refresh access token and insert event
        access_token = await google_refresh_access_token(refresh_token)

        # Build event payload for Google Calendar
        event_payload = google_event_payload(BroadcastBody(
            title=body.title,
            description=body.description,
            start_time=body.start_time,
            end_time=body.end_time,
            location=body.location,
            category=body.category,
            all_day=body.all_day,
            reminder_minutes=body.reminder_minutes,
        ))

        gevent = await google_insert_event(access_token, event_payload)

        # Update user's access token
        await users_col.update_one(
            {"id": user["id"]},
            {"$set": {"google_access_token": access_token, "token_expiry": now + timedelta(hours=1)}},
        )

        # Record the sync
        row = {
            "id": sync_id,
            "user_id": user["id"],
            "event_id": sync_id,
            "title": body.title,
            "description": body.description,
            "category": body.category,
            "start_time": body.start_time,
            "end_time": body.end_time,
            "delivered_at": now,
            "status": "synced",
            "google_event_id": gevent.get("id"),
        }
        await syncs_col.insert_one(row)

        return SyncEventResult(
            id=sync_id,
            google_event_id=gevent.get("id"),
            status="synced",
            error=None,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("user sync failed for %s: %s", user["email"], e)
        row = {
            "id": sync_id,
            "user_id": user["id"],
            "event_id": sync_id,
            "title": body.title,
            "description": body.description,
            "category": body.category,
            "start_time": body.start_time,
            "end_time": body.end_time,
            "delivered_at": now,
            "status": "failed",
            "error": str(e)[:300],
        }
        await syncs_col.insert_one(row)
        return SyncEventResult(
            id=sync_id,
            google_event_id=None,
            status="failed",
            error=str(e)[:300],
        )


# ---------------------------------------------------------------------------
# Routes — Admin
# ---------------------------------------------------------------------------
async def _inject_event_for_user(
    admin_user: dict[str, Any],
    target_user: dict[str, Any],
    body: BroadcastBody,
    event_id: str,
) -> dict[str, Any]:
    """Insert the event into a single user's Google Calendar (or mock-sync)."""
    sync_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    refresh_token = target_user.get("google_refresh_token")
    base_row = {
        "id": sync_id,
        "user_id": target_user["id"],
        "event_id": event_id,
        "title": body.title,
        "description": body.description,
        "category": body.category,
        "start_time": body.start_time,
        "end_time": body.end_time,
        "delivered_at": now,
    }
    if GOOGLE_MOCK_MODE or not refresh_token or str(refresh_token).startswith("mock-"):
        row = {**base_row, "status": "mock", "google_event_id": f"mock-evt-{uuid.uuid4()}"}
        await syncs_col.insert_one(row)
        return {"status": "mock"}
    try:
        access_token = await google_refresh_access_token(refresh_token)
        gevent = await google_insert_event(access_token, google_event_payload(body))
        await users_col.update_one(
            {"id": target_user["id"]},
            {"$set": {"google_access_token": access_token, "token_expiry": now + timedelta(hours=1)}},
        )
        await syncs_col.insert_one(
            {**base_row, "status": "synced", "google_event_id": gevent.get("id")}
        )
        return {"status": "synced"}
    except Exception as e:  # noqa: BLE001
        logger.warning("inject failed for %s: %s", target_user["email"], e)
        await syncs_col.insert_one({**base_row, "status": "failed", "error": str(e)[:300]})
        return {"status": "failed", "error": str(e)}


@api.post("/admin/broadcast-event", response_model=BroadcastEvent)
async def admin_broadcast(
    body: BroadcastBody, admin: dict[str, Any] = Depends(require_admin)
) -> BroadcastEvent:
    if body.end_time <= body.start_time:
        raise HTTPException(400, "end_time must be after start_time")
    if body.category not in ALLOWED_CATEGORIES:
        raise HTTPException(
            400,
            f"category must be one of {sorted(ALLOWED_CATEGORIES)}",
        )
    event_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # 1. Create event on the admin's primary calendar
    admin_google_event_id: str | None = None
    admin_status = "mock"
    admin_refresh = admin.get("google_refresh_token")
    if not GOOGLE_MOCK_MODE and admin_refresh and not str(admin_refresh).startswith("mock-"):
        try:
            access = await google_refresh_access_token(admin_refresh)
            gevent = await google_insert_event(access, google_event_payload(body))
            admin_google_event_id = gevent.get("id")
            admin_status = "synced"
        except Exception as e:  # noqa: BLE001
            logger.warning("admin calendar insert failed: %s", e)
            admin_status = "failed"

    # 2. Fan out only to users whose interests include this category
    #    (or who picked 'all' / haven't set interests yet).
    all_targets = await users_col.find(
        {"id": {"$ne": admin["id"]}}, {"_id": 0}
    ).to_list(10_000)
    targets = [
        u for u in all_targets
        if not u.get("interests")
        or "all" in (u.get("interests") or [])
        or body.category in (u.get("interests") or [])
    ]
    results = await asyncio.gather(
        *[_inject_event_for_user(admin, t, body, event_id) for t in targets]
    )
    success_count = sum(1 for r in results if r["status"] in ("synced", "mock"))
    failure_count = sum(1 for r in results if r["status"] == "failed")

    # 3. Persist broadcast record (and admin's own sync row so it appears in their history)
    await syncs_col.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": admin["id"],
            "event_id": event_id,
            "title": body.title,
            "description": body.description,
            "category": body.category,
            "start_time": body.start_time,
            "end_time": body.end_time,
            "delivered_at": now,
            "status": admin_status,
            "google_event_id": admin_google_event_id,
        }
    )
    record = {
        "id": event_id,
        "title": body.title,
        "description": body.description,
        "start_time": body.start_time,
        "end_time": body.end_time,
        "location": body.location,
        "category": body.category,
        "all_day": body.all_day,
        "reminder_minutes": body.reminder_minutes,
        "recurrence": body.recurrence,
        "visibility": body.visibility,
        "busy_status": body.busy_status,
        "send_push": body.send_push,
        "guests_can_invite_others": body.guests_can_invite_others,
        "guests_can_see_other_guests": body.guests_can_see_other_guests,
        "guests_can_modify": body.guests_can_modify,
        "admin_id": admin["id"],
        "admin_email": admin["email"],
        "created_at": now,
        "recipients_count": len(targets),
        "success_count": success_count,
        "failure_count": failure_count,
        "admin_google_event_id": admin_google_event_id,
    }
    await events_col.insert_one(record)

    # 4. Push notification fan-out (only to users whose interests match — same
    #    set we just synced to). Admins do not receive their own broadcast push.
    if body.send_push:
        recipients = [t["id"] for t in targets]
        await send_push(
            recipients=recipients,
            data={
                "title": f"{categoryLabelServer(body.category)} · {body.title}",
                "message": body.description[:120]
                or "An admin broadcast has been added to your calendar.",
            },
        )

    return BroadcastEvent(**{k: v for k, v in record.items() if k != "admin_google_event_id"})


@api.get("/admin/broadcasts", response_model=list[BroadcastEvent])
async def list_broadcasts(admin: dict[str, Any] = Depends(require_admin)) -> list[BroadcastEvent]:
    rows = await events_col.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Drop legacy/internal-only keys before Pydantic validation.
    out: list[BroadcastEvent] = []
    for r in rows:
        r.pop("admin_google_event_id", None)
        out.append(BroadcastEvent(**r))
    return out


@api.get("/admin/users")
async def list_users(admin: dict[str, Any] = Depends(require_admin)) -> list[PublicUser]:
    rows = await users_col.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [to_public_user(r) for r in rows]


# ---------------------------------------------------------------------------
# Wire-up & startup
# ---------------------------------------------------------------------------
app.include_router(api)


@app.on_event("startup")
async def on_startup() -> None:
    await users_col.create_index("email", unique=True)
    await users_col.create_index("id", unique=True)
    await events_col.create_index("id", unique=True)
    await syncs_col.create_index([("user_id", 1), ("delivered_at", -1)])
    logger.info("CalSync ready. mock_mode=%s admin=%s", GOOGLE_MOCK_MODE, ADMIN_EMAIL)


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await push_client.aclose()
    await google_client.aclose()
    client.close()
