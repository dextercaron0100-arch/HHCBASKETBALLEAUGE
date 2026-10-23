# HHC BASKETBALL LEAGUE

A league platform for Junior and Open divisions, team rosters, live scorekeeping, and organizer administration. The interface uses Next.js 16, TypeScript, Tailwind, and shadcn-compatible components. The API uses ASP.NET Core 10, Identity, Entity Framework Core, PostgreSQL 18, and SignalR.

Maintenance mode is controlled by `frontend/lib/site-status.ts`; set it to `true` to show the maintenance page or `false` to open the league site, then redeploy. This repository contains application source and public image assets; live league data, private uploads, credentials, and local backups are not included.

Public frontend: **https://hhcbasketballleague.vercel.app**. The backend and data remain on this computer. Keep Docker and `hhc-backend-public` running for league data, logos, sign-in, and live scores. Redeploy frontend changes with `./infrastructure/deploy-vercel.ps1`; see [deployment](docs/deployment.md) for backend tunnel renewal.

## Start with Docker

Install and start Docker Desktop with Linux containers. From this directory:

```powershell
./infrastructure/setup.ps1 -Demo
./infrastructure/bootstrap-admin.ps1 -Email organizer@example.com
```

Open **http://localhost:3000**. `-Demo` explicitly seeds fictional teams and players; omit it for an empty real league. Seeding never runs automatically and refuses an existing league. The setup script generates ignored local credentials in `.env` if none exist.

On this computer, Docker's existing data disk was relocated to **`.tools/docker-storage/disk/docker_data.vhdx` on D:** after C: ran out of space. Its original Windows location points here through a directory junction. **Keep `.tools/docker-storage` when cleaning build caches or moving the workspace**: it contains the persistent Docker images, containers, and league database. This machine-specific relocation is not needed for a fresh installation.

The local stack provides PostgreSQL, an S3-compatible Adobe S3Mock server, the API, and the frontend. The frontend listens on port 3000 on all host interfaces for local network testing; database, storage, and API ports bind to localhost. Use `docker compose stop` to stop the stack without deleting its data. Use `docker compose up -d` to restart it.

For phone testing, connect to the same Wi-Fi as this computer and open **http://192.168.100.81:3000**. A Windows firewall rule allows port 3000 from the local subnet on `Wi-Fi 2`. If the computer's Wi-Fi IP changes, update the URL and the rule's local address. Keep the computer and Docker running while testing.

For a temporary public HTTPS preview, run `docker compose -f compose.yml -f compose.preview.yml up -d --no-deps public-preview` while the site is running. Get the temporary address from `docker logs hhc-public-preview`. Stop public access with `docker stop hhc-public-preview`. The address changes when the tunnel restarts; the computer, Docker, and tunnel must stay running. Quick Tunnels are for testing and have no uptime guarantee. The preview administrator sign-in details are saved locally in the ignored, access-restricted `infrastructure/secrets/public-preview-admin.txt` file; the previously documented local test password has been replaced.

## Develop without Docker

Install Node 24 and the .NET 10 SDK. This workspace also has an ignored SDK under `.tools/dotnet` that `dev.ps1` detects. The development API defaults to SQLite and local file storage; Docker uses PostgreSQL and S3 storage.

```powershell
cd frontend
npm ci
cd ..
./infrastructure/dev.ps1 -Mode SeedDemo
./infrastructure/dev.ps1 -Mode BootstrapAdmin
./infrastructure/dev.ps1 -Mode Api
```

In a second terminal, run `./infrastructure/dev.ps1 -Mode Web`. SQLite data resides in `league.db` beneath the repository root when using these scripts. Do not switch database providers against the same connection string. SQLite initialization uses `EnsureCreated`; versioned EF migrations target PostgreSQL.

## First organizer workflow

1. Sign in and open **Organizer dashboard**. Create a season and configure official cutoff dates, division age ranges, game duration, foul limits, and timeouts. Open registration only after defining eligibility.
2. Team managers create accounts, submit teams and rosters, and request amendments. Review teams and players in **Registration**. Public profiles omit birth dates, evidence, and manager identifiers.
3. Approve six teams in each division/group. Generate the 60 round-robin matchups in **Scheduling**, preview the calendar, and apply it when every game has a valid slot.
4. Add officials. Administrators grant scorekeeper roles; organizers assign accounts to games. Use **Scorekeeping desk** to acquire the exclusive control lease and start a game.
5. Record player statistics and control the clock. At the final buzzer, finish the game. Organizers confirm the result after the API reconciles player points against team totals.
6. Rankings update from confirmed results. Resolve ties and protests before playoff seeding. Schedule newly generated playoff games. Confirm playoff results to advance winners and populate the third-place game.
7. Publish content, maintain the finance ledger, record discipline cases, and approve award recipients from their dedicated modules.

Demo ages are fictional examples, not official eligibility rules. There is no automatic production administrator or embedded production password. Create your administrator with the bootstrap script and keep its credentials outside the repository.

## Checks

```powershell
./infrastructure/dev.ps1 -Mode Test
cd frontend
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

End-to-end tests require a running local app and an administrator account. Set `TEST_ADMIN_EMAIL` and `TEST_ADMIN_PASSWORD` for a different test administrator. Run against a disposable, nonproduction database: the workflow test creates a separate QA season, registrations, results, and ledger entries. Tests also check desktop/mobile layouts and tablet connectivity.

Project NuGet packages use `.tools/nuget` through `NuGet.Config`. This workspace's browser-test binaries use `.tools/playwright`, which the test configuration detects automatically. To install test browsers there on a fresh checkout, set `PLAYWRIGHT_BROWSERS_PATH` to that absolute folder before `npx playwright install chromium`.

API contract: **http://localhost:5080/openapi/v1.json**. Health endpoint: **http://localhost:5080/health**. API routes use `/api/v1`; live game subscriptions use `/hubs/games`.

See [architecture and rules](docs/architecture.md), [deployment](docs/deployment.md), and [verification](docs/verification.md). Production deployment and the listed premium features are deferred.
