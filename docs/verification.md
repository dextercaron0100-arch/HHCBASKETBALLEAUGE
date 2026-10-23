# Verification

Delivery checks passed: **37 backend tests and 5 Playwright end-to-end tests**; TypeScript checking; frontend production build; backend release/container build; PostgreSQL migrations; all four Docker services; S3 upload/private access checks; and retained league revision, games, and players after restarting the API, database, and storage. Dependency scans reported no known frontend production or backend package vulnerabilities at verification time.

The local Community Cup has 24 fictional teams, 192 fictional players, 60 group games, 24 confirmed results, and 36 scheduled upcoming games. Temporary QA seasons were removed after testing. No production deployment or live R2 account was used; R2 production credentials and external YouTube/Facebook playback require deployment-time verification.

The automated suite covers round-robin completeness, age boundaries, rankings/ties, crossover progression, protests, started-bracket conflicts, court/session/rest constraints, closures, stale previews, insufficient capacity, exclusive scoring leases, command idempotency, stale versions, clock pause/resume, suspensions, final point reconciliation, award thresholds, and livestream URL validation.

Playwright checks the public routes, Junior/Senior and group switching, filters, phone overflow, keyboard skip navigation, every organizer module, tablet SignalR connectivity, and the API workflow from manager registration through team/player approval, schedule preview/application, scoring, confirmation, amendment approval, award approval, announcement publishing, and finance export. It also checks anonymous and manager access restrictions and public omission of sensitive registration fields.

Run `npm run test:e2e` against a disposable local database with a bootstrapped administrator. Tests write explicit QA seasons and records; they do not touch external services. Layout screenshots are generated in ignored `frontend/test-results`.

Additional deployment acceptance checks: persistence across a backend/database restart, S3 uploads/private download denial, production frontend/backend builds, Docker startup, health readiness, and dependency vulnerability scans. Verification outcomes and any remaining limitations should be reported with delivery.

The Schedule & Results UI update adds a ten-day date rail, All/Junior/Senior tabs, game-day markers, group/team/status filters, date jumping, Hide Scores, Live Only, and date-grouped match cards with venues. `tests/schedule.spec.ts` verifies date paging, filter reset, spoiler hiding, phone-width layout, selected-date visibility, and season timezone handling. The refresh recovered the existing 24 teams, 192 players, and 60 games after a full C: drive interrupted Docker; the persistent Docker disk now resides on D: as described in the README.
