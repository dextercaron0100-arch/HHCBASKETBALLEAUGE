# Deployment

The frontend is deployed to **https://hhcbasketballleague.vercel.app**. The API, PostgreSQL, and logo storage currently run on this computer in Docker. The API uses a dedicated temporary Cloudflare tunnel; the computer, Docker, and `hhc-backend-public` container must stay running for league data and sign-in to work.

## Frontend

The Vercel project is `hhcbasketballleague`, deployed from the `frontend` directory. Run `./infrastructure/deploy-vercel.ps1` to deploy, or pass `-BackendUrl https://your-backend.example` explicitly. The script checks the backend, then sets both the API proxy and realtime addresses at build time. Source uploads exclude local builds, dependencies, test output, and local environment files. Vercel uses Node 24.

Start the backend tunnel with `docker compose -f compose.yml -f compose.vercel.yml up -d --no-deps backend-public`. Its address is printed by `docker logs hhc-backend-public` and the current value is stored in the ignored `.tools/vercel-backend-url.txt` file. If the tunnel restarts or expires, save its new HTTPS address to that file and rerun the deployment script. The Vercel website address remains unchanged. This temporary backend tunnel has no uptime guarantee; a stable backend hostname is needed for unattended hosting.

For a managed backend, set `BACKEND_URL` to its HTTPS URL before building. Install with `npm ci`; build with `npm run build`. Redeploy when the backend origin changes because rewrites are resolved at build time.

For realtime hosting on Vercel, connect SignalR directly to the backend: set `NEXT_PUBLIC_REALTIME_URL=https://api.your-domain.example/hubs/games` before building. Vercel HTTP rewrites are used for REST/cookie traffic, while the backend must independently allow your frontend origin for SignalR. The local `.env` setting `FRONTEND_ORIGINS` accepts comma-separated origins; it includes localhost and the Vercel production address. Keep browser authentication and private REST calls on the frontend's same-origin proxy. The game hub is public/read-only; scoring commands remain authenticated REST calls.

## Backend and PostgreSQL

Build `infrastructure/Dockerfile.backend` and deploy to a managed service that supports long-lived SignalR WebSockets. Run one backend instance initially; multiple instances require a SignalR backplane such as managed SignalR/Redis and shared Identity data-protection keys. Aggregate concurrency protects database writes but does not distribute realtime broadcasts.

Required settings:

```text
ASPNETCORE_ENVIRONMENT=Production
DatabaseProvider=Postgres
ConnectionStrings__League=Host=...;Database=...;Username=...;Password=...;SSL Mode=VerifyFull
FrontendOrigin=https://your-frontend-domain.example
TrustedProxy=IP_ADDRESS_OF_YOUR_TRUSTED_INGRESS
Storage__Endpoint=https://ACCOUNT_ID.r2.cloudflarestorage.com
Storage__Region=auto
Storage__AccessKey=...
Storage__SecretKey=...
Storage__PublicBucket=league-public
Storage__PrivateBucket=league-private
```

Store secrets in the hosting provider's secret manager. Restrict the database and R2 credentials to the application. Keep the private bucket private; all downloads pass through the authorization checks. The local S3Mock service is a test implementation and is not deployed to production.

Terminate HTTPS at the trusted ingress. Configure trusted forwarded headers there so secure cookie handling sees the original scheme. Persist Identity data-protection keys on an encrypted durable volume shared by any instances. Application containers run as a non-root user; grant that user access to its key volume.

The backend applies versioned EF migrations during startup; a separate `dotnet League.Api.dll migrate` job can apply them before rollout. Never use `EnsureCreated` for PostgreSQL. Back up before schema changes; deploy a compatible image only after the migration job succeeds. Create the real administrator by injecting `ADMIN_EMAIL` and `ADMIN_PASSWORD` into a one-off `dotnet League.Api.dll bootstrap-admin` job, then remove those variables. Never seed demo data in production.

## Operations

### Public image delivery

The Vercel deploy helper runs `npm run optimize:images` against the public backend before uploading the frontend. It prepares responsive WebP logo sizes and hero images in `frontend/public/optimized-images`, with a manifest in `frontend/lib/optimized-images.json`. Content-hashed filenames allow one-year immutable caching. Existing uploaded logo IDs are immutable, so previously prepared variants are reused. Original uploaded files remain unchanged.

Only approved public team logos are mirrored; private documents and player evidence are excluded. A newly uploaded logo falls back to its original URL until the next deployment prepares its static versions. Run the optimizer manually from `frontend` with `LEAGUE_ASSET_ORIGIN` set to the backend origin, or use the deploy helper.

- Probe `/health` for database readiness. Track 5xx responses, concurrency conflicts, failed sign-ins, SignalR reconnects, and upload failures. Send structured application logs to your provider; audit history is available to staff.
- Schedule encrypted PostgreSQL backups, enable provider point-in-time recovery where available, and test restoration into a separate database. Include R2 object backup/versioning and data-protection keys in the recovery procedure.
- Before release, test sign-in through the public frontend origin, CSRF rejection, unauthorized/private-file access, WebSocket reconnect, and secure cookies. Keep the API container off the public network except through its ingress.
- This release has local Identity sign-up and sign-in; email delivery, password recovery, and MFA enrollment are not yet implemented. Provision and maintain staff accounts through the bootstrap/role workflows until those account-lifecycle features are added.
- For more than a small number of concurrently scored games, split the league JSONB aggregate into game/season tables and introduce a transactional outbox/backplane before scaling out.

Roll back an application image only if it remains compatible with the current schema. Restore backups into a separate database for review before replacing production state.
