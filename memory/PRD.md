# CalSync Admin — PRD

## Vision
A plug-and-play Google Calendar Automation & Notification System. An admin
broadcasts an event once; the backend fans it out to every linked user's
Google Calendar via stored refresh tokens, then triggers a push notification
to every device.

## Architecture
- **Monorepo**: `/backend` (FastAPI + MongoDB via Motor) and `/frontend`
  (React Native Expo with Expo Router).
- **Auth**: Google OAuth 2.0 mobile flow (`serverAuthCode` → `access_token` +
  `refresh_token`, enforcing `access_type=offline` & `prompt=consent`).
  Automatic MOCK fallback when `GOOGLE_CLIENT_ID` is unset so the entire
  product flow is demo-able with zero credentials.
- **Push**: Emergent managed push relay (per integration playbook) — backend
  exposes `POST /api/register-push` and calls `send_push()` after each
  broadcast.
- **Persistence**: MongoDB (env-provided). Collections: `users`,
  `broadcast_events`, `user_event_syncs`, `push_tokens`.
  > NOTE: Spec asked for SQLAlchemy + SQLite/PostgreSQL. The hosting
  > environment provides MongoDB; same schema shape, async Motor.

## Roles
- **User**: connection-status card, sync history of received events with
  per-event status (synced / mock / failed).
- **Admin** (email matches `ADMIN_EMAIL` env): broadcast form (title,
  description, start, end), sticky glass "Broadcast to All Users" CTA, list
  of past broadcasts with X/Y delivery stats.

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/google/mobile` | Exchange serverAuthCode (or mock_email) for JWT + user |
| POST | `/api/auth/mock-login` | Pure mock login (demo) |
| GET  | `/api/auth/me` | Current user |
| POST | `/api/auth/disconnect-google` | Clear stored refresh token |
| POST | `/api/admin/broadcast-event` | Create event on admin calendar + fan out |
| GET  | `/api/admin/broadcasts` | List of past broadcasts (admin) |
| GET  | `/api/admin/users` | List of users (admin) |
| GET  | `/api/me/events` | This user's synced events |
| POST | `/api/register-push` | Register FCM/APNs device token |
| GET  | `/api/status` | Health, user/event counts, mock-mode flag |

## Screens
1. **Sign-in** — Hero image + "Continue with Google" + "Sign in as Admin (demo)" + custom-email toggle.
2. **User Dashboard** (Tabs/index) — Connection status card + sync history list, pull-to-refresh, empty state.
3. **Admin Dashboard** (Tabs/admin) — Form + sticky glass broadcast CTA + past broadcasts. Hidden for non-admins.
4. **Profile** (Tabs/profile) — Avatar, role pill, account rows, disconnect Google, sign out.

## Design
- Moss Green personality (`#2E4F3B`), light mode.
- Generous Apple-native spacing; max font weight 500; rounded radii (md=12, lg=20, pill).
- `expo-blur` glass on the sticky broadcast CTA.

## Event creation options (Google Calendar parity)
The admin broadcast form mirrors Google Calendar's event editor:
- **Title**, **Description**, **Location**
- **All-day** toggle (date-only payload to Google)
- **Starts/Ends** datetime pickers
- **Repeat** — none / daily / weekly / monthly → Google `RRULE:FREQ=...`
- **Calendar reminder** — 0/5/10/15/30/60/1440 min → Google reminders override
- **Send push notification** toggle (skip FCM fan-out when off)
- **Visibility** — default/public/private
- **Show me as** — busy/free → Google `transparency`
- **Guest permissions** — invite others / see guest list / modify event

## Smart Enhancement (business value)
Past Broadcasts panel exposes per-broadcast delivery stats (X/Y synced). This
turns the app into a measurable comms tool — admins can prove reach for
internal events, which is the single most-requested feature in real-world
calendar automation tools.

## Open items for real deployment
- Fill `GOOGLE_CLIENT_ID/SECRET` to leave mock mode.
- Publish via Emergent → push relay key replaces `placeholder` automatically.
- Provide `frontend/google-services.json` for Android push.
