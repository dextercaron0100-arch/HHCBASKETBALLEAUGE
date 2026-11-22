"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { divisionLabel } from "@/lib/divisions";
import { playoffQualifiers } from "@/lib/playoff-qualification";
import { isPlayoffDisqualified } from "@/lib/playoff-eligibility";
import type { League, Standing } from "@/lib/types";
import { TeamMark } from "./league-app";

export function usePlayoffStandings(league: League, division: string) {
  const season = league.seasons[0];
  const count = season?.groupSizes?.[division]?.length ?? 0;
  const [loaded, setLoaded] = useState<{ key: string; rows: Standing[][] }>();
  const [failed, setFailed] = useState("");
  const key = `${season?.id}:${division}:${league.revision}`;
  useEffect(() => {
    if (!season || !count) return;
    let current = true;
    Promise.all(Array.from({ length: count }, (_, index) => api<Standing[]>(`/standings/${season.id}/${division}/${String.fromCharCode(65 + index)}`)))
      .then(rows => { if (current) setLoaded({ key, rows }); })
      .catch(() => { if (current) setFailed(key); });
    return () => { current = false; };
  }, [season, count, division, key]);
  const ready = loaded?.key === key;
  return { rows: ready ? loaded.rows : undefined, failed: failed === key };
}

export default function PlayoffQualifiers({ league, division, standings }: { league: League; division: string; standings: ReturnType<typeof usePlayoffStandings> }) {
  const ready = !!standings.rows;
  const qualifiers = standings.rows ? playoffQualifiers(league, division, standings.rows) : [];
  const disqualified = league.teams.filter(team => team.seasonId === league.seasons[0]?.id && team.division === division && isPlayoffDisqualified(team));
  return <section className="playoff-qualifiers" aria-label={`${divisionLabel(division)} qualified teams`}>
    <header><div><span className="eyebrow">PLAYOFF QUALIFICATION</span><h3>Already qualified</h3></div>{ready && <span className="badge badge-qualified">{qualifiers.length} teams secured</span>}</header>
    <p>Teams with a secured playoff place from approved results. Final seeds and remaining places depend on unfinished group games and tiebreaks.</p>
    {!ready ? <p role="status">{standings.failed ? "Qualification could not be loaded. Please refresh to retry." : "Checking qualified teams…"}</p> : qualifiers.length ? <ul className="playoff-qualified-list">{qualifiers.map(({ team, wins, losses, bye }) => <li key={team.id}>
      <TeamMark team={team} size="tiny" /><div><strong>{team.name}</strong><span>Group {team.group} · {wins}–{losses}</span></div><span className="badge badge-qualified">{bye ? "QF bye" : "Qualified"}</span>
    </li>)}</ul> : <p>No playoff places have been secured yet.</p>}
    {disqualified.length > 0 && <div role="group" aria-label="Disqualified teams"><h4>Disqualified</h4><ul>{disqualified.map(team => <li key={team.id}>
      <TeamMark team={team} size="tiny" /><div><strong>{team.name}</strong><span>Group {team.group} · Organizer decision</span></div><span className="badge">Disqualified</span>
    </li>)}</ul></div>}
  </section>;
}
