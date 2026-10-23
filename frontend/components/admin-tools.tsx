"use client";
import { divisionLabel } from "@/lib/divisions";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AdminState, Leader, Season, Standing, User } from "@/lib/types";
import { Button } from "./ui/button";
import { Form, options } from "./forms";

type Command = (body: unknown) => Promise<void>;
export function AuditChanges({ details }: { details: string }) {
  if (!details) return null;
  const changes = JSON.parse(details) as {
    entity: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  }[];
  if (changes.length === 0) return null;
  const show = (value: unknown) =>
    value == null
      ? "—"
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return (
    <details>
      <summary>
        {changes.length} changed record{changes.length === 1 ? "" : "s"}
      </summary>
      {changes.map((change) => (
        <div key={change.entity}>
          <strong>
            {String(
              change.after?.name ||
                change.after?.title ||
                change.before?.name ||
                change.entity.split(":")[0],
            )}
          </strong>
          <table>
            <thead>
              <tr>
                <th>FIELD</th>
                <th>BEFORE</th>
                <th>AFTER</th>
              </tr>
            </thead>
            <tbody>
              {[
                ...new Set([
                  ...Object.keys(change.before || {}),
                  ...Object.keys(change.after || {}),
                ]),
              ]
                .filter(
                  (key) =>
                    key !== "id" &&
                    key !== "version" &&
                    JSON.stringify(change.before?.[key]) !==
                      JSON.stringify(change.after?.[key]),
                )
                .map((key) => (
                  <tr key={key}>
                    <td>{key.replace(/([A-Z])/g, " $1")}</td>
                    <td>{show(change.before?.[key])}</td>
                    <td>{show(change.after?.[key])}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </details>
  );
}
export function CheckList({
  items,
  selected,
  onChange,
  label,
}: {
  items: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  label: string;
}) {
  return (
    <fieldset className="check-list">
      <legend>{label}</legend>
      {items.map((item) => (
        <label className="check-option" key={item.id}>
          <input
            type="checkbox"
            checked={selected.includes(item.id)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...selected, item.id]
                  : selected.filter((id) => id !== item.id),
              )
            }
          />
          <span>{item.name}</span>
        </label>
      ))}
      {items.length === 0 && <p className="muted">No eligible options yet.</p>}
    </fieldset>
  );
}
function localTime(value: string, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
function utcTime(value: string, zone: string) {
  const target = Date.parse(value + "Z");
  let utc = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const wall = Date.parse(localTime(new Date(utc).toISOString(), zone) + "Z");
    utc += target - wall;
  }
  if (localTime(new Date(utc).toISOString(), zone) !== value)
    throw new Error("This local time does not exist in the selected timezone.");
  return new Date(utc).toISOString();
}
export function CalendarEditor({
  season,
  command,
}: {
  season: Season;
  command: Command;
}) {
  const [draft, setDraft] = useState<Season>(() => structuredClone(season));
  const [closures, setClosures] = useState(
    () =>
      season.closures?.map((c) => ({
        ...c,
        start: localTime(c.start, season.timezone),
        end: localTime(c.end, season.timezone),
      })) || [],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const change = <K extends keyof Season>(key: K, value: Season[K]) =>
    setDraft((s) => ({ ...s, [key]: value }));
  return (
    <form
      className="module-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const values = new FormData(e.currentTarget);
        setBusy(true);
        try {
          await command({
            action: "preview",
            calendar: {
              ...draft,
              closures: closures.map((c) => ({
                ...c,
                start: utcTime(c.start, draft.timezone),
                end: utcTime(c.end, draft.timezone),
              })),
            },
            from: values.get("from"),
            days: Number(values.get("days")),
            all: values.get("all") === "true",
          });
          setMessage(
            "Preview generated. Review every placement below before applying.",
          );
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        <label>
          Schedule from
          <input
            required
            name="from"
            type="date"
            defaultValue={new Intl.DateTimeFormat("en-CA", {
              timeZone: draft.timezone,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date())}
          />
        </label>
        <label>
          Planning horizon (days)
          <input
            required
            name="days"
            type="number"
            min={1}
            max={180}
            defaultValue={60}
          />
        </label>
        <label>
          Timezone
          <select
            value={draft.timezone}
            onChange={(e) => change("timezone", e.target.value)}
          >
            {[
              "Asia/Manila",
              "UTC",
              "Asia/Singapore",
              "Asia/Tokyo",
              "America/New_York",
              "America/Los_Angeles",
              "Europe/London",
              "Australia/Sydney",
            ].map((zone) => (
              <option key={zone}>{zone}</option>
            ))}
          </select>
        </label>
        <label>
          Games to move
          <select name="all">
            <option value="false">Affected and unscheduled games</option>
            <option value="true">All future scheduled games</option>
          </select>
        </label>
        <label>
          Game slot duration (minutes)
          <input
            required
            type="number"
            min={15}
            value={draft.slotMinutes ?? 60}
            onChange={(e) => change("slotMinutes", Number(e.target.value))}
          />
        </label>
        <label>
          Rest after scheduled finish (minutes)
          <input
            required
            type="number"
            min={0}
            value={draft.restMinutes ?? 120}
            onChange={(e) => change("restMinutes", Number(e.target.value))}
          />
        </label>
      </div>
      <CheckList
        label="Game days"
        items={[
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ].map((name, id) => ({ id: String(id), name }))}
        selected={(draft.days || []).map(String)}
        onChange={(ids) => change("days", ids.map(Number))}
      />
      <h3>Morning & afternoon sessions</h3>
      {draft.sessions?.map((session, index) => (
        <div className="calendar-row" key={index}>
          <label>
            Start hour
            <input
              required
              type="number"
              min={0}
              max={23}
              value={session.startHour}
              onChange={(e) =>
                change(
                  "sessions",
                  draft.sessions!.map((s, i) =>
                    i === index
                      ? { ...s, startHour: Number(e.target.value) }
                      : s,
                  ),
                )
              }
            />
          </label>
          <label>
            End hour
            <input
              required
              type="number"
              min={1}
              max={24}
              value={session.endHour}
              onChange={(e) =>
                change(
                  "sessions",
                  draft.sessions!.map((s, i) =>
                    i === index ? { ...s, endHour: Number(e.target.value) } : s,
                  ),
                )
              }
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              change(
                "sessions",
                draft.sessions!.filter((_, i) => i !== index),
              )
            }
          >
            Remove session
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          change("sessions", [
            ...(draft.sessions || []),
            { startHour: 18, endHour: 21 },
          ])
        }
      >
        Add session
      </Button>
      <h3>Venues & courts</h3>
      {draft.courts.map((court, index) => (
        <div className="calendar-row" key={court.id}>
          <label>
            Venue
            <input
              required
              value={court.venue}
              onChange={(e) =>
                change(
                  "courts",
                  draft.courts.map((c, i) =>
                    i === index ? { ...c, venue: e.target.value } : c,
                  ),
                )
              }
            />
          </label>
          <label>
            Court name
            <input
              required
              value={court.name}
              onChange={(e) =>
                change(
                  "courts",
                  draft.courts.map((c, i) =>
                    i === index ? { ...c, name: e.target.value } : c,
                  ),
                )
              }
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            disabled={draft.courts.length === 1}
            onClick={() => {
              change(
                "courts",
                draft.courts.filter((c) => c.id !== court.id),
              );
              setClosures((cs) => cs.filter((c) => c.courtId !== court.id));
            }}
          >
            Remove court
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          change("courts", [
            ...draft.courts,
            {
              id: crypto.randomUUID(),
              venue: "Community Sports Center",
              name: `Court ${draft.courts.length + 1}`,
            },
          ])
        }
      >
        Add court
      </Button>
      <h3>Court closures</h3>
      <p className="muted">Closure times use the selected timezone.</p>
      {closures.map((closure, index) => (
        <div className="calendar-row closure-row" key={index}>
          <label>
            Court
            <select
              value={closure.courtId}
              onChange={(e) =>
                setClosures((cs) =>
                  cs.map((c, i) =>
                    i === index ? { ...c, courtId: e.target.value } : c,
                  ),
                )
              }
            >
              {draft.courts.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Unavailable from
            <input
              required
              type="datetime-local"
              value={closure.start}
              onChange={(e) =>
                setClosures((cs) =>
                  cs.map((c, i) =>
                    i === index ? { ...c, start: e.target.value } : c,
                  ),
                )
              }
            />
          </label>
          <label>
            Available again
            <input
              required
              type="datetime-local"
              value={closure.end}
              onChange={(e) =>
                setClosures((cs) =>
                  cs.map((c, i) =>
                    i === index ? { ...c, end: e.target.value } : c,
                  ),
                )
              }
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setClosures((cs) => cs.filter((_, i) => i !== index))
            }
          >
            Remove closure
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          setClosures((cs) => [
            ...cs,
            { courtId: draft.courts[0].id, start: "", end: "" },
          ])
        }
      >
        Add closure
      </Button>
      <div className="button-row">
        <Button type="submit" disabled={busy}>
          {busy ? "Generating…" : "Generate preview"}
        </Button>
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
export function TieResolver({
  state,
  seasonId,
  command,
}: {
  state: AdminState;
  seasonId: string;
  command: Command;
}) {
  const [division, setDivision] = useState("Junior");
  const [group, setGroup] = useState("A");
  const [rows, setRows] = useState<Standing[]>([]);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (seasonId)
      api<Standing[]>(`/standings/${seasonId}/${division}/${group}`)
        .then(setRows)
        .catch((e) => setMessage(e.message));
  }, [seasonId, division, group, state.revision]);
  const keys = [
    ...new Set(rows.filter((r) => r.unresolved).map((r) => r.tieKey)),
  ];
  const move = (id: string, direction: number) => {
    setRows((current) => {
      const copy = [...current];
      const index = copy.findIndex((r) => r.teamId === id);
      const next = index + direction;
      if (
        next >= 0 &&
        next < copy.length &&
        copy[next].tieKey === copy[index].tieKey
      )
        [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  };
  return (
    <div>
      <div className="form-grid">
        <label>
          Division
          <select
            value={division}
            onChange={(e) => setDivision(e.target.value)}
          >
            <option>Junior</option>
            <option value="Senior">Open</option>
          </select>
        </label>
        <label>
          Group
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option>A</option>
            <option>B</option>
          </select>
        </label>
      </div>
      {keys.map((key) => (
        <div className="tie-group" key={key}>
          <h3>Rank this tied set</h3>
          {rows
            .filter((r) => r.tieKey === key)
            .map((row, index) => (
              <div className="approval-row" key={row.teamId}>
                <span>
                  {index + 1}. {row.name} · {row.wins} wins ·{" "}
                  {row.difference > 0 ? "+" : ""}
                  {row.difference} difference
                </span>
                <div className="button-row">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Move ${row.name} up`}
                    onClick={() => move(row.teamId, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Move ${row.name} down`}
                    onClick={() => move(row.teamId, 1)}
                  >
                    ↓
                  </Button>
                </div>
              </div>
            ))}
          <label>
            Decision reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <Button
            disabled={!reason.trim()}
            onClick={async () => {
              try {
                await command({
                  action: "tieDecision",
                  id: seasonId,
                  division,
                  group,
                  teamIds: rows
                    .filter((r) => r.tieKey === key)
                    .map((r) => r.teamId),
                  reason,
                });
                setMessage("Tie decision recorded.");
                setReason("");
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            Record ranked decision
          </Button>
        </div>
      ))}
      {keys.length === 0 && (
        <p className="muted">No unresolved ties in this group.</p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
export function AwardApproval({
  state,
  seasonId,
  command,
}: {
  state: AdminState;
  seasonId: string;
  command: Command;
}) {
  const [division, setDivision] = useState("Junior");
  const [type, setType] = useState("MVP");
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [team, setTeam] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setSelected([]);
    setTeam("");
    if (seasonId)
      api<Leader[]>(`/leaders/${seasonId}/${division}`)
        .then(setLeaders)
        .catch((e) => setMessage(e.message));
  }, [seasonId, division, state.revision]);
  const playerAward = type === "MVP" || type === "Mythical Five";
  return (
    <form
      className="module-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await command({
            action: "award",
            award: {
              id: crypto.randomUUID(),
              seasonId,
              division,
              type,
              playerIds: selected,
              teamId: team,
              approvedBy: "",
            },
          });
          setMessage("Official award approved.");
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        <label>
          Division
          <select
            value={division}
            onChange={(e) => setDivision(e.target.value)}
          >
            <option>Junior</option>
            <option value="Senior">Open</option>
          </select>
        </label>
        <label>
          Award
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setSelected([]);
            }}
          >
            {["MVP", "Mythical Five", "Champion", "Third place"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      {playerAward ? (
        <>
          <p className="muted">
            Choose {type === "MVP" ? "one player" : "five distinct players"}.
            Candidates below meet the half-season participation threshold.
          </p>
          <CheckList
            label="Eligible candidates"
            items={leaders
              .filter((p) => p.eligible)
              .map((p) => ({
                id: p.id,
                name: `${p.name} · ${state.teams.find((t) => t.id === p.teamId)?.name} · ranking ${p.ranking}`,
              }))}
            selected={selected}
            onChange={setSelected}
          />
        </>
      ) : (
        <label>
          Winning team
          <select
            required
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          >
            {options(
              state.teams.filter(
                (t) => t.seasonId === seasonId && t.division === division,
              ),
            ).map((o) => (
              <option value={o.value} key={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <Button
        disabled={
          busy || (playerAward && selected.length !== (type === "MVP" ? 1 : 5))
        }
        type="submit"
      >
        Approve award
      </Button>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
export function CrewAssignment({
  state,
  users,
  seasonId,
  command,
}: {
  state: AdminState;
  users: User[];
  seasonId: string;
  command: Command;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <Form
      label="Assign game crew"
      fields={[
        {
          name: "id",
          label: "Game",
          required: true,
          options: options(
            state.games
              .filter((g) => g.seasonId === seasonId)
              .map((g) => ({
                id: g.id,
                name: `${divisionLabel(g.division)} · ${state.teams.find((t) => t.id === g.homeId)?.name} vs ${state.teams.find((t) => t.id === g.awayId)?.name}`,
              })),
          ),
        },
        {
          name: "scorekeeperId",
          label: "Scorekeeper account",
          required: true,
          options: options(
            users
              .filter((u) =>
                u.roles.some((r) =>
                  ["Administrator", "Organizer", "Scorekeeper"].includes(r),
                ),
              )
              .map((u) => ({ id: u.id, name: u.email })),
          ),
        },
      ]}
      onSubmit={async (v) => {
        await command({ action: "assign", ...v, officialIds: selected });
      }}
    >
      <CheckList
        label="Referees and table officials"
        items={state.officials.map((o) => ({
          id: o.id,
          name: `${o.name} · ${o.role}`,
        }))}
        selected={selected}
        onChange={setSelected}
      />
    </Form>
  );
}
