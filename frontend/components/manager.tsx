"use client";
import { divisionLabel } from "@/lib/divisions";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Amendment, League, Player, Team, User } from "@/lib/types";
import { Empty, PageHeading } from "./league-app";
import { Form, options, Upload } from "./forms";
import { Button } from "./ui/button";
export default function Manager({
  user,
  league,
}: {
  user: User | null;
  league: League;
}) {
  const [data, setData] = useState<{ teams: Team[]; players: Player[] }>({
    teams: [],
    players: [],
  });
  const [logo, setLogo] = useState("");
  const [photo, setPhoto] = useState("");
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState("");
  const [amendPlayer, setAmendPlayer] = useState("");
  const amendmentPlayer = data.players.find((p) => p.id === amendPlayer);
  const load = useCallback(
    () =>
      api<typeof data>("/manager")
        .then(setData)
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    if (user) load();
  }, [user, load]);
  if (!user)
    return (
      <Empty
        title="Sign in to register your team"
        description="Create a team-manager account from the sign-in page."
      />
    );
  return (
    <>
      <PageHeading
        eyebrow="TEAM MANAGER"
        title="My registrations"
        description="Submit your team and roster. Organizers review eligibility before players take the court."
      />
      {error && <p className="notice error">{error}</p>}
      <div className="admin-two-column">
        <section className="panel">
          <h2>Register a team</h2>
          <Form
            label="Submit for approval"
            fields={[
              {
                name: "seasonId",
                label: "Season",
                required: true,
                options: options(
                  league.seasons.filter((s) => s.registrationOpen),
                ),
              },
              { name: "name", label: "Team name", required: true },
              { name: "coach", label: "Coach", required: true },
              {
                name: "division",
                label: "Division",
                options: [
                  { value: "Junior", label: "Junior" },
                  { value: "Senior", label: "Open" },
                ],
              },
              {
                name: "group",
                label: "Group",
                options: [
                  { value: "A", label: "A" },
                  { value: "B", label: "B" },
                  { value: "C", label: "C (Open division)" },
                  { value: "D", label: "D (Open division)" },
                ],
              },
            ]}
            onSubmit={async (values) => {
              await api("/manager/team", { ...values, logo });
              setLogo("");
              await load();
            }}
          >
            <Upload label="Team logo" onUploaded={setLogo} />
          </Form>
        </section>
        <section className="panel">
          <h2>Add a player</h2>
          <Form
            label="Submit for eligibility review"
            fields={[
              {
                name: "teamId",
                label: "Your team",
                required: true,
                options: options(data.teams),
              },
              { name: "name", label: "Player name", required: true },
              {
                name: "number",
                label: "Jersey number",
                type: "number",
                required: true,
                min: 0,
                max: 99,
              },
              {
                name: "position",
                label: "Position",
                options: ["PG", "SG", "SF", "PF", "C"].map((value) => ({
                  value,
                  label: value,
                })),
              },
              {
                name: "birthDate",
                label: "Birth date (private)",
                type: "date",
                required: true,
              },
            ]}
            onSubmit={async (values) => {
              await api("/manager/player", {
                ...values,
                number: Number(values.number),
                photo,
                evidence,
              });
              setPhoto("");
              setEvidence("");
              await load();
            }}
          >
            <Upload label="Roster photo" onUploaded={setPhoto} />
            <Upload
              label="Eligibility evidence (private)"
              confidential
              onUploaded={setEvidence}
            />
          </Form>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 24 }}>
        <h2>Request a roster amendment</h2>
        <label>
          Existing player
          <select
            value={amendPlayer}
            onChange={(e) => setAmendPlayer(e.target.value)}
          >
            <option value="">Choose a player</option>
            {data.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {amendmentPlayer && (
          <Form
            key={amendPlayer}
            label="Submit amendment for review"
            fields={[
              {
                name: "name",
                label: "Player name",
                required: true,
                value: amendmentPlayer.name,
              },
              {
                name: "number",
                label: "Jersey number",
                type: "number",
                required: true,
                value: amendmentPlayer.number,
                min: 0,
                max: 99,
              },
              {
                name: "position",
                label: "Position",
                value: amendmentPlayer.position,
                options: ["PG", "SG", "SF", "PF", "C"].map((value) => ({
                  value,
                  label: value,
                })),
              },
              {
                name: "birthDate",
                label: "Birth date (private)",
                type: "date",
                required: true,
                value: amendmentPlayer.birthDate,
              },
            ]}
            onSubmit={async (values) => {
              await api("/manager/amendment", {
                ...amendmentPlayer,
                ...values,
                number: Number(values.number),
              });
              await load();
            }}
          />
        )}
      </section>
      <section className="panel">
        <h2>Registration status</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>TEAM / PLAYER</th>
                <th>DIVISION / JERSEY</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {data.teams.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.name}</strong>
                  </td>
                  <td>
                    {divisionLabel(t.division)} · Group {t.group}
                  </td>
                  <td>
                    <span className="badge">{t.status}</span>
                  </td>
                </tr>
              ))}
              {data.players.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.name}
                    <small className="table-sub">
                      {data.teams.find((t) => t.id === p.teamId)?.name}
                    </small>
                  </td>
                  <td>
                    #{p.number} · {p.position}
                  </td>
                  <td>
                    <span className="badge">{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="muted">
        Roster changes require organizer approval. Birth dates and evidence are
        never included in the public player directory.
      </p>
      <Button asChild variant="outline">
        <Link href="/schedule">View schedule</Link>
      </Button>
    </>
  );
}
