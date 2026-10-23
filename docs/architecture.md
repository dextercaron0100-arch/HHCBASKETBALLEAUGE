# Architecture and league rules

## Persistence and authority

Identity accounts, roles, upload ownership, and schema migrations use relational tables. League domain records live in a versioned PostgreSQL JSONB aggregate (`LeagueDocuments`): seasons, registrations, roster amendments, snapshots, schedules, scoring events, officials, finance, discipline, content, awards, previews, and audit records. Each command changes a freshly read aggregate and commits it with an EF concurrency token. A competing write fails instead of overwriting newer state. This choice makes cross-module updates atomic for a community league; the aggregate should be split into per-season/game tables before supporting high-volume concurrent leagues. SQLite uses the same aggregate contract for development.

The backend computes all standings, permissions, eligibility checks, scheduling constraints, and bracket changes. Public DTOs exclude private registration fields. Managers can submit only their own roster changes; staff review amendments before publication. Game-start snapshots preserve names, jersey numbers, and positions at tip-off. Statistics use approved game rosters; all rostered players count as participants in this version.

## Authentication and transport

ASP.NET Core Identity hashes passwords, locks accounts after five failed sign-ins, and issues HTTP-only cookies. Every API mutation requires a fresh antiforgery token from `/api/v1/auth/csrf` in `X-CSRF-TOKEN`. Login refreshes the token on subsequent requests. Roles and assignments are enforced at the API. The frontend proxies HTTP and SignalR traffic, so the browser normally uses one origin. SignalR clients use automatic reconnection and reload committed snapshots after reconnecting. The local Next.js server supports WebSocket proxying; see deployment guidance for Vercel's separate realtime endpoint.

Scorekeepers hold a renewable 45-second lease, tied to their account and a per-tab client ID. The tablet renews every 20 seconds. Scoring commands include a UUID and expected game version. Previously committed UUIDs return the existing state without adding another event. Failed or uncertain submissions reload the snapshot; the UI does not queue offline scores.

## Competition

- Group sizes are stored per season and division. The current Junior draw has groups of six and five (25 round-robin games); Open/Senior has three groups of five (30 games when all teams are confirmed), with one TBA slot per group. TBA slots are display placeholders and cannot be scheduled as teams. The original default for an unconfigured season is two groups of six.
- Confirmed wins rank first. Tied subsets compare their mutual wins, mutual point difference, then overall point difference. When a subset separates, repeat the applicable head-to-head process on the remaining tied subset. An exact residual tie remains flagged until staff records the team's ordered IDs and a reason.
- For a two-group format, qualification is provisional until every configured group game is confirmed, ties are resolved, and relevant protests are closed. Quarterfinals are A1–B4, A2–B3, B1–A4, B2–A3. Semifinals use Q1/Q4 and Q3/Q2; semifinal winners and losers populate the championship and third-place games. Three-group playoff qualification has not been specified; seeding is blocked until those rules are implemented.
- Player points must sum to team scores before confirmation. Confirmation keeps the result even when an unresolved tie prevents seeding. Once ready, winners advance automatically. Staff can rerun seeding after resolving ties/protests.
- Confirmed corrections require reasons, append events, and invalidate approved division awards. Corrections cannot silently change the teams in a downstream game already started. Staff explicitly cancels conflicted downstream games, with recorded reasons and preserved history, before correcting the upstream result and regenerating replacements.
- Award suggestions use per-game averages of PTS + 1.2×REB + 1.5×AST + 3×STL + 3×BLK. At least half the team's confirmed games is required. Staff chooses one MVP or five distinct eligible Mythical Five players. Team honors must match confirmed playoff winners.

## Scheduling

The default timezone is Asia/Manila. Scheduling uses Friday–Sunday, 08:00–12:00 and 13:00–17:00, 60-minute slots, one court, and 120 minutes of rest from scheduled finish to the next start. Sessions, weekdays, timezone, courts, closures, slot length, and rest are configurable through the calendar editor. The horizon is 1–180 days.

The organizer calendar editor uses game-day checkboxes, session hours, venue/court fields, and local-time closure inputs. The deterministic greedy scheduler places affected future games into the earliest available legal slot, preserving unaffected games and all started/completed matches. Court conflicts, shared-team conflicts, session boundaries, closures, and rest constraints are checked. Unschedulable games prevent applying a preview; extend the horizon or add capacity. Every preview captures the league revision. Any intervening league write makes it stale and requires regeneration. Runtime overruns are managed by organizers; reserved slots represent scheduled duration.

New playoff rounds must be scheduled after their participants are known. Fixed started/completed fixtures are retained even when the proposed calendar would no longer allow their historical slots.

## Media and PWA

Authenticated uploads support verified JPG, PNG, WEBP, and private PDF formats up to 10 MB. Upload metadata records owner and visibility. The API checks access before returning private content. Public and private R2 buckets remain separate; neither private bucket nor private file credentials appear in public DTOs. Use uploaded file URLs for team logos, photos, and galleries.

The PWA offers a manifest and a cached offline explanatory page. It does not cache authenticated data or live scores. Offline scoring, push notifications, certificates, QR IDs, sponsor portals, payments, and OBS overlays are intentionally deferred.
