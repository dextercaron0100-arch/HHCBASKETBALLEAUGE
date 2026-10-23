"use client";
import { divisionLabel } from "@/lib/divisions";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, dateTime } from "@/lib/api";
import type { AdminState, Season, User } from "@/lib/types";
import { Empty, PageHeading } from "./league-app";
import { Button } from "./ui/button";
import { Form, options, Upload } from "./forms";
import {
  CalendarEditor,
  TieResolver,
  AwardApproval,
  CrewAssignment,
  CheckList,
  AuditChanges,
} from "./admin-tools";
const modules = [
  "League management",
  "Registration",
  "Scheduling",
  "Live scoring",
  "Standings",
  "Bracket generator",
  "Officials",
  "Finance",
  "Discipline",
  "Announcements",
  "Audit logs",
];
const uid = () => crypto.randomUUID();
export default function Admin({
  user,
  reload,
}: {
  user: User | null;
  reload: () => void;
}) {
  const [state, setState] = useState<AdminState | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [module, setModule] = useState(modules[0]);
  const [seasonId, setSeasonId] = useState("");
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [suspendedGames, setSuspendedGames] = useState<string[]>([]);
  const [editPost, setEditPost] = useState("");
  const staff = user?.roles.some((r) =>
    ["Administrator", "Organizer"].includes(r),
  );
  const load = useCallback(async () => {
    try {
      const data = await api<AdminState>("/admin/state");
      setState(data);
      setSeasonId((id) => id || data.seasons[0]?.id || "");
      setUsers(await api<User[]>("/admin/users"));
    } catch (e) {
      setMessage((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (staff) load();
  }, [staff, load]);
  const command = async (body: unknown) => {
    const data = await api<AdminState>("/admin/command", body);
    setState(data);
    reload();
  };
  const act = async (body: unknown) => {
    try {
      await command(body);
      setMessage("Saved successfully.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  if (!staff)
    return (
      <Empty
        title="Organizer access required"
        description="Sign in using your organizer or administrator account."
      />
    );
  if (!state) return <p>{message || "Loading league administration…"}</p>;
  const season = state.seasons.find((s) => s.id === seasonId);
  const gameOptions = options(
    state.games
      .filter((g) => g.seasonId === seasonId)
      .map((g) => ({
        id: g.id,
        name: `${divisionLabel(g.division)} · ${state.teams.find((t) => t.id === g.homeId)?.name} vs ${state.teams.find((t) => t.id === g.awayId)?.name} · ${g.status}`,
      })),
  );
  const teamOptions = options(
    state.teams.filter((t) => t.seasonId === seasonId),
  );
  const playerOptions = options(
    state.players
      .filter((p) =>
        state.teams.some((t) => t.id === p.teamId && t.seasonId === seasonId),
      )
      .map((p) => ({ id: p.id, name: `${p.name} · #${p.number}` })),
  );
  const selectedPost = state.posts.find((p) => p.id === editPost);
  return (
    <>
      <PageHeading
        eyebrow="ORGANIZER WORKSPACE"
        title="Run the league"
        description="From the first registration to the championship buzzer."
      />
      <div className="filter-bar">
        <label>
          Active season
          <select
            value={seasonId}
            onChange={(e) => setSeasonId(e.target.value)}
          >
            {state.seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.year}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          Revision {state.revision} · {user?.email}
        </span>
        <Button variant="outline" onClick={load}>
          Refresh
        </Button>
      </div>
      <div className="admin-tabs">
        {modules.map((m) => (
          <button
            key={m}
            className={module === m ? "active" : ""}
            onClick={() => {
              setModule(m);
              setMessage("");
            }}
          >
            {m}
          </button>
        ))}
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {module === "League management" && (
        <div className="admin-two-column">
          <section className="panel">
            <h2>{season ? "Season settings" : "Create your first season"}</h2>
            <Form
              key={seasonId}
              label="Save season rules"
              fields={[
                {
                  name: "name",
                  label: "League / season name",
                  required: true,
          value: season?.name || "HHC BASKETBALL LEAGUE",
                },
                {
                  name: "year",
                  label: "Year",
                  type: "number",
                  value: season?.year || 2026,
                  required: true,
                },
                {
                  name: "ageCutoff",
                  label: "Official age cutoff date",
                  type: "date",
                  value: season?.ageCutoff || "",
                  required: true,
                },
                {
                  name: "juniorMin",
                  label: "Junior minimum age",
                  type: "number",
                  value: season?.juniorMin,
                  required: true,
                  min: 0,
                },
                {
                  name: "juniorMax",
                  label: "Junior maximum age",
                  type: "number",
                  value: season?.juniorMax,
                  required: true,
                  min: 0,
                },
                {
                  name: "seniorMin",
                  label: "Open minimum age",
                  type: "number",
                  value: season?.seniorMin,
                  required: true,
                  min: 0,
                },
                {
                  name: "seniorMax",
                  label: "Open maximum age",
                  type: "number",
                  value: season?.seniorMax,
                  required: true,
                  min: 0,
                },
                {
                  name: "foulLimit",
                  label: "Personal foul limit",
                  type: "number",
                  value: season?.foulLimit,
                  required: true,
                  min: 1,
                },
                {
                  name: "timeoutLimit",
                  label: "Timeouts per team / game",
                  type: "number",
                  value: season?.timeoutLimit,
                  required: true,
                  min: 1,
                },
                {
                  name: "quarterSeconds",
                  label: "Quarter duration (seconds)",
                  type: "number",
                  value: season?.quarterSeconds || 600,
                  required: true,
                  min: 60,
                },
                {
                  name: "overtimeSeconds",
                  label: "Overtime duration (seconds)",
                  type: "number",
                  value: season?.overtimeSeconds || 300,
                  required: true,
                  min: 60,
                },
                {
                  name: "registrationOpen",
                  label: "Registration",
                  value: String(season?.registrationOpen || false),
                  options: [
                    { value: "false", label: "Closed" },
                    { value: "true", label: "Open" },
                  ],
                },
              ]}
              onSubmit={async (v) => {
                const data = {
                  ...season,
                  id: season?.id || uid(),
                  name: v.name,
                  year: Number(v.year),
                  ageCutoff: v.ageCutoff,
                  juniorMin: Number(v.juniorMin),
                  juniorMax: Number(v.juniorMax),
                  seniorMin: Number(v.seniorMin),
                  seniorMax: Number(v.seniorMax),
                  foulLimit: Number(v.foulLimit),
                  timeoutLimit: Number(v.timeoutLimit),
                  quarterSeconds: Number(v.quarterSeconds),
                  overtimeSeconds: Number(v.overtimeSeconds),
                  registrationOpen: v.registrationOpen === "true",
                };
                await command({ action: "season", season: data });
                setSeasonId(data.id);
              }}
            />
          </section>
          <section className="panel">
            <h2>New season</h2>
            <p className="muted">
              New seasons start with registration closed. Configure official
              eligibility rules before opening registration.
            </p>
            <Form
              fields={[
                { name: "name", label: "Season name", required: true },
                {
                  name: "year",
                  label: "Year",
                  type: "number",
                  value: 2026,
                  required: true,
                },
              ]}
              onSubmit={async (v) => {
                const id = uid();
                await command({
                  action: "season",
                  season: {
                    id,
                    name: v.name,
                    year: Number(v.year),
                    registrationOpen: false,
                  },
                });
                setSeasonId(id);
              }}
            />
            <h3>League format</h3>
            <p>
              {(["Junior", "Senior"] as const).map(division => <span key={division} style={{ display: "block" }}>{divisionLabel(division)}: {(season?.groupSizes?.[division] ?? [6, 6]).map((size, index) => `Group ${String.fromCharCode(65 + index)}: ${size} teams`).join(" · ")}</span>)}
            </p>
            <p className="muted">
              Demo cutoffs are examples. Configure the real league’s official
              rules before accepting real registrations.
            </p>
          </section>
        </div>
      )}
      {module === "Registration" && (
        <section className="panel">
          <h2>Team approvals</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>TEAM</th>
                  <th>DIVISION</th>
                  <th>MANAGER</th>
                  <th>STATUS</th>
                  <th>REVIEW</th>
                </tr>
              </thead>
              <tbody>
                {state.teams
                  .filter((t) => t.seasonId === seasonId)
                  .map((t) => (
                    <tr key={t.id}>
                      <td>
                        {t.name}
                        <small className="table-sub">{t.coach}</small>
                      </td>
                      <td>
                        {divisionLabel(t.division)} · {t.group}
                      </td>
                      <td>
                        {users.find((u) => u.id === t.managerId)?.email ||
                          "Demo / organizer"}
                      </td>
                      <td>{t.status}</td>
                      <td>
                        {t.status === "Pending" && (
                          <div className="button-row">
                            <Button
                              size="sm"
                              onClick={() =>
                                act({ action: "approveTeam", id: t.id })
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                act({
                                  action: "approveTeam",
                                  id: t.id,
                                  status: "Rejected",
                                })
                              }
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <h2>Eligibility review</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PLAYER</th>
                  <th>TEAM</th>
                  <th>BIRTH DATE</th>
                  <th>EVIDENCE</th>
                  <th>STATUS</th>
                  <th>REVIEW</th>
                </tr>
              </thead>
              <tbody>
                {state.players
                  .filter((p) =>
                    state.teams.some(
                      (t) => t.id === p.teamId && t.seasonId === seasonId,
                    ),
                  )
                  .map((p) => (
                    <tr key={p.id}>
                      <td>
                        {p.name}
                        <small className="table-sub">
                          #{p.number} · {p.position}
                        </small>
                      </td>
                      <td>
                        {state.teams.find((t) => t.id === p.teamId)?.name}
                      </td>
                      <td>{p.birthDate}</td>
                      <td>
                        {p.evidence ? (
                          <a
                            className="text-link"
                            target="_blank"
                            rel="noreferrer"
                            href={p.evidence}
                          >
                            View private file
                          </a>
                        ) : (
                          "Not supplied"
                        )}
                      </td>
                      <td>{p.status}</td>
                      <td>
                        {p.status === "Pending" && (
                          <div className="button-row">
                            <Button
                              size="sm"
                              onClick={() =>
                                act({ action: "approvePlayer", id: p.id })
                              }
                            >
                              Approve eligibility
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                act({ action: "rejectPlayer", id: p.id })
                              }
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <h2>Pending roster amendments</h2>
          {state.amendments
            .filter((a) => a.status === "Pending")
            .map((a) => (
              <div className="approval-row" key={a.id}>
                <span>
                  {a.proposed.name} · #{a.proposed.number} ·{" "}
                  {a.proposed.position} · Birth date {a.proposed.birthDate}
                </span>
                <div className="button-row">
                  <Button
                    size="sm"
                    onClick={() =>
                      act({
                        action: "reviewAmendment",
                        id: a.id,
                        status: "Approved",
                      })
                    }
                  >
                    Approve amendment
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      act({
                        action: "reviewAmendment",
                        id: a.id,
                        status: "Rejected",
                      })
                    }
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
        </section>
      )}
      {module === "Scheduling" && (
        <>
          <section className="panel">
            <h2>Generate round-robin fixtures</h2>
            <p>
              Generate 60 group games after all four groups contain six approved
              teams. Existing fixtures are preserved.
            </p>
            <Button
              disabled={!season}
              onClick={() => act({ action: "generate", id: seasonId })}
            >
              Generate matchups
            </Button>
          </section>
          {season && (
            <section className="panel">
              <h2>Calendar & rescheduling preview</h2>
              <p className="muted">
                Edit venues, courts, closures, game days, session hours, rest
                periods, and slot duration. Only future scheduled games can
                move. A preview makes no public calendar changes.
              </p>
              <CalendarEditor
                key={seasonId}
                season={season}
                command={command}
              />
            </section>
          )}
          {state.previews.map((p) => (
            <section className="panel" key={p.id}>
              <h2>Review proposed changes</h2>
              <p>
                {p.placements.length} placements · {p.unscheduled.length}{" "}
                unschedulable games · Preview revision {p.revision}
              </p>
              {p.unscheduled.length > 0 && (
                <p className="notice error">
                  Add court capacity or extend the horizon. This proposal cannot
                  be applied while games remain unscheduled.
                </p>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>GAME</th>
                      <th>PREVIOUS</th>
                      <th>PROPOSED</th>
                      <th>COURT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.placements.map((slot) => {
                      const g = state.games.find((g) => g.id === slot.gameId);
                      return (
                        <tr key={slot.gameId}>
                          <td>
                            {state.teams.find((t) => t.id === g?.homeId)?.name}{" "}
                            vs{" "}
                            {state.teams.find((t) => t.id === g?.awayId)?.name}
                          </td>
                          <td>{dateTime(g?.start || null)}</td>
                          <td>{dateTime(slot.start)}</td>
                          <td>
                            {
                              p.calendar.courts.find(
                                (c) => c.id === slot.courtId,
                              )?.name
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Button
                disabled={
                  p.unscheduled.length > 0 || p.revision !== state.revision
                }
                onClick={() => act({ action: "applyPreview", id: p.id })}
              >
                Apply reviewed calendar
              </Button>
              {p.revision !== state.revision && (
                <p className="error">
                  This preview is stale. Generate another.
                </p>
              )}
            </section>
          ))}
        </>
      )}
      {module === "Live scoring" && (
        <>
          <section className="panel">
            <h2>Table officials’ desk</h2>
            <p>
              Assigned scorekeepers enter events, clock changes, fouls, and
              timeouts from the dedicated desk.
            </p>
            <Button asChild>
              <Link href="/scorekeeper">Open scorekeeping desk</Link>
            </Button>
          </section>
          <section className="panel">
            <h2>Final result confirmation</h2>
            {state.games
              .filter((g) => g.seasonId === seasonId && g.status === "Final")
              .map((g) => (
                <div className="approval-row" key={g.id}>
                  <span>
                    {state.teams.find((t) => t.id === g.homeId)?.name}{" "}
                    {g.homeScore} – {g.awayScore}{" "}
                    {state.teams.find((t) => t.id === g.awayId)?.name}
                  </span>
                  <Button onClick={() => act({ action: "confirm", id: g.id })}>
                    Confirm result
                  </Button>
                </div>
              ))}
            {!state.games.some(
              (g) => g.seasonId === seasonId && g.status === "Final",
            ) && <p className="muted">No results awaiting confirmation.</p>}
            <h3>Resolve a started bracket conflict</h3>
            <p className="muted">
              If an upstream correction would change a started playoff’s teams,
              record an explicit resolution here. Cancelling preserves its
              events and results; the bracket generator creates a replacement
              game.
            </p>
            <Form
              label="Cancel conflicted playoff with recorded reason"
              fields={[
                {
                  name: "id",
                  label: "Playoff game",
                  required: true,
                  options: options(
                    state.games
                      .filter(
                        (g) =>
                          g.seasonId === seasonId &&
                          g.stage !== "Group" &&
                          g.status !== "Cancelled",
                      )
                      .map((g) => ({
                        id: g.id,
                        name:
                          g.stage +
                          " · " +
                          state.teams.find((t) => t.id === g.homeId)?.name +
                          " vs " +
                          state.teams.find((t) => t.id === g.awayId)?.name,
                      })),
                  ),
                },
                { name: "reason", label: "Resolution reason", required: true },
              ]}
              onSubmit={async (v) =>
                command({ action: "resolveBracketConflict", ...v })
              }
            />
            <h3>Correct a confirmed result</h3>
            <Form
              label="Record correction"
              fields={[
                {
                  name: "id",
                  label: "Game",
                  required: true,
                  options: gameOptions,
                },
                {
                  name: "playerId",
                  label: "Player",
                  required: true,
                  options: playerOptions,
                },
                {
                  name: "kind",
                  label: "Statistic",
                  options: [
                    "points",
                    "rebounds",
                    "assists",
                    "steals",
                    "blocks",
                    "fouls",
                  ].map((value) => ({ value, label: value })),
                },
                {
                  name: "amount",
                  label: "Adjustment (+ / −)",
                  type: "number",
                  required: true,
                },
                { name: "reason", label: "Reason", required: true },
              ]}
              onSubmit={async (v) =>
                command({ action: "correct", ...v, amount: Number(v.amount) })
              }
            />
          </section>
        </>
      )}
      {module === "Standings" && (
        <section className="panel">
          <h2>Rankings & tie decisions</h2>
          <p>
            Standings derive from confirmed scores. Organizer decisions resolve
            remaining ties and are recorded in the audit log.
          </p>
          <Button asChild variant="outline">
            <Link href="/standings">View live standings</Link>
          </Button>
          <TieResolver state={state} seasonId={seasonId} command={command} />
        </section>
      )}
      {module === "Bracket generator" && (
        <>
          <section className="panel">
            <h2>Seed / refresh playoffs</h2>
            <p>
              All 30 group games in a division must be confirmed. Resolve
              protests and ties before seeding. Started downstream games cannot
              have their participants changed.
            </p>
            <div className="button-row">
              {["Junior", "Senior"].map((division) => (
                <Button
                  key={division}
                  onClick={() =>
                    act({ action: "seedBracket", id: seasonId, division })
                  }
                >
                  Seed {divisionLabel(division)} bracket
                </Button>
              ))}
            </div>
            <p className="muted">
              Schedule newly generated playoff games from Scheduling. Winners
              advance automatically after confirmation.
            </p>
          </section>
          <section className="panel">
            <h2>Approve league honors</h2>
            <AwardApproval
              state={state}
              seasonId={seasonId}
              command={command}
            />
          </section>
        </>
      )}
      {module === "Officials" && (
        <>
          <div className="admin-two-column">
            <section className="panel">
              <h2>Official directory</h2>
              <Form
                fields={[
                  { name: "name", label: "Name", required: true },
                  {
                    name: "role",
                    label: "Role",
                    options: ["Referee", "Scorer", "Table official"].map(
                      (value) => ({ value, label: value }),
                    ),
                  },
                  {
                    name: "userId",
                    label: "Linked account (optional)",
                    options: options(
                      users.map((u) => ({ id: u.id, name: u.email })),
                    ),
                  },
                ]}
                onSubmit={async (v) =>
                  command({ action: "official", official: { id: uid(), ...v } })
                }
              />
              {state.officials.map((o) => (
                <p key={o.id}>
                  {o.name} · {o.role}
                </p>
              ))}
            </section>
            <section className="panel">
              <h2>Assign a game crew</h2>
              <CrewAssignment
                state={state}
                users={users}
                seasonId={seasonId}
                command={command}
              />
            </section>
          </div>
          {user?.roles.includes("Administrator") && (
            <section className="panel">
              <h2>Account role assignment</h2>
              <Form
                fields={[
                  {
                    name: "userId",
                    label: "Account",
                    required: true,
                    options: options(
                      users.map((u) => ({ id: u.id, name: u.email })),
                    ),
                  },
                  {
                    name: "role",
                    label: "Grant role",
                    options: ["Organizer", "Scorekeeper", "TeamManager"].map(
                      (value) => ({ value, label: value }),
                    ),
                  },
                ]}
                onSubmit={async (v) => {
                  await api("/admin/role", v);
                  await load();
                }}
              />
            </section>
          )}
        </>
      )}
      {module === "Finance" && (
        <>
          <div className="metric-grid finance-metrics">
            {["Fee", "Payment", "Expense", "Sponsorship"].map((type) => (
              <div className="metric" key={type}>
                <div>
                  <span>{type === "Fee" ? "Registration fees due" : type}</span>
                  <strong>
                    ₱
                    {state.finance
                      .filter((e) => e.seasonId === seasonId && e.type === type)
                      .reduce((sum, e) => sum + e.amount, 0)
                      .toLocaleString()}
                  </strong>
                </div>
              </div>
            ))}
          </div>
          <section className="panel">
            <div className="section-title">
              <h2>Manual finance ledger</h2>
              <a className="text-link" href="/api/v1/admin/finance.csv">
                Export CSV <ArrowDownRightIcon />
              </a>
            </div>
            <Form
              label="Record entry"
              fields={[
                {
                  name: "type",
                  label: "Type",
                  options: ["Fee", "Payment", "Expense", "Sponsorship"].map(
                    (value) => ({ value, label: value }),
                  ),
                },
                {
                  name: "teamId",
                  label: "Team (fees/payments)",
                  options: teamOptions,
                },
                {
                  name: "amount",
                  label: "Amount (PHP)",
                  type: "number",
                  required: true,
                  min: 0.01,
                },
                { name: "date", label: "Date", type: "date", required: true },
                { name: "description", label: "Description", required: true },
              ]}
              onSubmit={async (v) =>
                command({
                  action: "finance",
                  entry: {
                    id: uid(),
                    seasonId,
                    ...v,
                    amount: Number(v.amount),
                  },
                })
              }
            />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>TYPE</th>
                    <th>TEAM</th>
                    <th>AMOUNT</th>
                    <th>DESCRIPTION</th>
                  </tr>
                </thead>
                <tbody>
                  {state.finance
                    .filter((e) => e.seasonId === seasonId)
                    .map((e) => (
                      <tr key={e.id}>
                        <td>{e.date}</td>
                        <td>{e.type}</td>
                        <td>
                          {state.teams.find((t) => t.id === e.teamId)?.name ||
                            "—"}
                        </td>
                        <td>₱{e.amount.toLocaleString()}</td>
                        <td>{e.description}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <h3>Team balances</h3>
            {state.teams
              .filter((t) => t.seasonId === seasonId)
              .map((t) => (
                <div className="balance-row" key={t.id}>
                  <span>{t.name}</span>
                  <strong>
                    ₱
                    {state.finance
                      .filter((e) => e.teamId === t.id)
                      .reduce(
                        (sum, e) =>
                          sum +
                          (e.type === "Fee"
                            ? e.amount
                            : e.type === "Payment"
                              ? -e.amount
                              : 0),
                        0,
                      )
                      .toLocaleString()}
                  </strong>
                </div>
              ))}
          </section>
        </>
      )}
      {module === "Discipline" && (
        <section className="panel">
          <h2>Suspensions, technical fouls & protests</h2>
          <Form
            label="Record case"
            fields={[
              {
                name: "type",
                label: "Type",
                options: ["Suspension", "Technical", "Protest"].map(
                  (value) => ({ value, label: value }),
                ),
              },
              { name: "playerId", label: "Player", options: playerOptions },
              {
                name: "gameId",
                label: "Game (protests / technical)",
                options: gameOptions,
              },
              { name: "from", label: "Suspension start date", type: "date" },
              {
                name: "until",
                label: "Suspension end date (inclusive)",
                type: "date",
              },
              { name: "reason", label: "Reason", required: true },
            ]}
            onSubmit={async (v) =>
              command({
                action: "discipline",
                case: {
                  id: uid(),
                  ...v,
                  from: v.from || null,
                  until: v.until || null,
                  gameIds: suspendedGames,
                  resolved: false,
                },
              })
            }
          >
            <CheckList
              label="Or select specific suspended games"
              items={state.games
                .filter((g) => g.seasonId === seasonId)
                .map((g) => ({
                  id: g.id,
                  name:
                    g.division +
                    " · " +
                    state.teams.find((t) => t.id === g.homeId)?.name +
                    " vs " +
                    state.teams.find((t) => t.id === g.awayId)?.name,
                }))}
              selected={suspendedGames}
              onChange={setSuspendedGames}
            />
          </Form>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>TYPE</th>
                  <th>PLAYER / GAME</th>
                  <th>REASON</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {state.discipline.map((d) => (
                  <tr key={d.id}>
                    <td>{d.type}</td>
                    <td>
                      {state.players.find((p) => p.id === d.playerId)?.name ||
                        d.gameId}
                    </td>
                    <td>{d.reason}</td>
                    <td>
                      {d.resolved ? (
                        "Resolved"
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const reason = window.prompt(
                              "Record the resolution reason",
                            );
                            if (reason)
                              act({ action: "resolveCase", id: d.id, reason });
                          }}
                        >
                          Resolve case
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {module === "Announcements" && (
        <section className="panel">
          <h2>News, galleries & streams</h2>
          <label>
            Edit existing post
            <select
              value={editPost}
              onChange={(e) => {
                setEditPost(e.target.value);
                setImages(
                  state.posts.find((p) => p.id === e.target.value)?.images ||
                    [],
                );
              }}
            >
              <option value="">Create a new post</option>
              {state.posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <Form
            key={editPost}
            label="Save content"
            fields={[
              {
                name: "title",
                label: "Title",
                required: true,
                value: selectedPost?.title,
              },
              {
                name: "type",
                label: "Type",
                value: selectedPost?.type,
                options: ["Announcement", "Highlight", "Gallery", "Stream"].map(
                  (value) => ({ value, label: value }),
                ),
              },
              {
                name: "body",
                label: "Body",
                type: "textarea",
                required: true,
                value: selectedPost?.body,
              },
              {
                name: "gameId",
                label: "Related game (optional)",
                options: gameOptions,
                value: selectedPost?.gameId,
              },
              {
                name: "streamUrl",
                label: "YouTube / Facebook embed URL",
                type: "url",
                value: selectedPost?.streamUrl,
                hint: "https://www.youtube.com/embed/VIDEO_ID or Facebook /plugins/video.php URL",
              },
              {
                name: "published",
                label: "Visibility",
                value: String(selectedPost?.published || false),
                options: [
                  { value: "false", label: "Draft" },
                  { value: "true", label: "Published" },
                ],
              },
            ]}
            onSubmit={async (v) => {
              await command({
                action: "post",
                post: {
                  id: selectedPost?.id || uid(),
                  ...v,
                  images,
                  published: v.published === "true",
                  createdAt:
                    selectedPost?.createdAt || new Date().toISOString(),
                },
              });
            }}
          >
            <Upload
              label="Add a gallery image"
              onUploaded={(url) => setImages((list) => [...list, url])}
            />
            <div className="gallery">
              {images.map((url) => (
                <button
                  type="button"
                  key={url}
                  aria-label="Remove gallery image"
                  onClick={() =>
                    setImages((list) => list.filter((x) => x !== url))
                  }
                >
                  <img src={url} alt="Uploaded gallery image" />
                </button>
              ))}
            </div>
          </Form>
          <p className="muted">
            Publishing an announcement does not apply scheduling changes. Review
            and apply changes in Scheduling.
          </p>
        </section>
      )}
      {module === "Audit logs" && (
        <section className="panel">
          <h2>League change history</h2>
          <p className="muted">
            Scorekeeping event history, roster approvals, calendar changes, and
            staff decisions are recorded with their actor and timestamp.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>TIME</th>
                  <th>ACTOR</th>
                  <th>ACTION</th>
                  <th>TARGET</th>
                  <th>REASON</th>
                </tr>
              </thead>
              <tbody>
                {[...state.audit].reverse().map((a) => (
                  <tr key={a.id}>
                    <td>{dateTime(a.at)}</td>
                    <td>
                      {users.find((u) => u.id === a.actor)?.email || a.actor}
                    </td>
                    <td>{a.action}</td>
                    <td>
                      <small>
                        {state.teams.find((t) => t.id === a.target)?.name ||
                          state.players.find((p) => p.id === a.target)?.name ||
                          state.seasons.find((s) => s.id === a.target)?.name ||
                          (a.action.includes("Preview")
                            ? "Calendar review"
                            : a.target
                              ? "League record"
                              : "League")}
                      </small>
                    </td>
                    <td>
                      {a.reason || "—"}
                      <AuditChanges details={a.details} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>Game scoring event histories</summary>
            {state.games
              .filter(
                (g) =>
                  "events" in g &&
                  (g as unknown as { events: unknown[] }).events.length > 0,
              )
              .map((g) => (
                <pre key={g.id}>
                  {JSON.stringify(
                    {
                      id: g.id,
                      events: (g as unknown as { events: unknown[] }).events,
                    },
                    null,
                    2,
                  )}
                </pre>
              ))}
          </details>
        </section>
      )}
    </>
  );
}
function ArrowDownRightIcon() {
  return <span aria-hidden="true">↘</span>;
}
