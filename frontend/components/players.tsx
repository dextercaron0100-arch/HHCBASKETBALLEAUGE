"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { League } from "@/lib/types";
import { divisionLabel } from "@/lib/divisions";
import { confirmedPlayerStats } from "@/lib/player-stats";
import { Divisions, Empty, PageHeading, TeamMark } from "./league-app";
import { Button } from "./ui/button";
import PlayerAvatar from "./player-avatar";
import PlayerProfile from "./player-profile";

export default function Players({ league, division, setDivision, initialPlayer }: {
  league: League; division: string; setDivision: (division: string) => void; initialPlayer: string;
}) {
  const [query, setQuery] = useState("");
  const [teamId, setTeamId] = useState("");
  const [sort, setSort] = useState("name");
  const [pagination, setPagination] = useState({ key: "", page: 1 });
  const profileHeading = useRef<HTMLHeadingElement>(null);
  const directoryHeading = useRef<HTMLHeadingElement>(null);
  const previousPlayer = useRef("");
  const teams = useMemo(() => league.teams.filter(team => team.division === division), [league.teams, division]);
  const teamMap = useMemo(() => new Map(league.teams.map(team => [team.id, team])), [league.teams]);
  const stats = useMemo(() => confirmedPlayerStats(league), [league]);
  const selected = league.players.find(player => player.id === initialPlayer && teamMap.get(player.teamId)?.division === division);
  const selectedTeam = selected ? teamMap.get(selected.teamId) : undefined;
  useEffect(() => { setTeamId(""); setQuery(""); }, [division, league.seasons[0]?.id]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (selected) {
        profileHeading.current?.focus({ preventScroll: true });
        profileHeading.current?.closest("section")?.scrollIntoView({ block: "start", behavior: "instant" });
      } else if (previousPlayer.current) directoryHeading.current?.focus({ preventScroll: true });
      previousPlayer.current = selected?.id || "";
    });
    return () => cancelAnimationFrame(frame);
  }, [selected?.id]);
  const average = (id: string, key: "points" | "rebounds" | "assists") => {
    const record = stats.get(id)!;
    return record.games.length ? record.totals[key] / record.games.length : 0;
  };
  const search = query.trim().toLocaleLowerCase();
  const activeTeam = teams.some(team => team.id === teamId) ? teamId : "";
  const players = league.players.filter(player => {
    const team = teamMap.get(player.teamId);
    const searchable = `${player.name} ${team?.name ?? ""} ${player.position} ${player.number >= 0 ? `#${player.number} #${String(player.number).padStart(2, "0")}` : ""}`.toLocaleLowerCase();
    return team?.division === division && (!activeTeam || player.teamId === activeTeam) && (!search || searchable.includes(search));
  }).sort((a, b) => {
    const key = sort === "rebounds" ? "rebounds" : sort === "assists" ? "assists" : "points";
    return (sort === "name" ? 0 : average(b.id, key) - average(a.id, key)) || a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });
  const pageKey = `${league.seasons[0]?.id}:${division}:${activeTeam}:${search}:${sort}`;
  const pageCount = Math.max(1, Math.ceil(players.length / 20));
  const page = Math.min(pagination.key === pageKey ? pagination.page : 1, pageCount);
  const offset = (page - 1) * 20;
  const changePage = (value: number) => {
    setPagination({ key: pageKey, page: value });
    directoryHeading.current?.focus({ preventScroll: true });
    directoryHeading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  };
  return <div className="players-page">
    <PageHeading eyebrow="THE PEOPLE BEHIND THE GAME" title="Players & stats" description="Profiles. Game logs. Achievements. Your season, all in one place."><Divisions value={division} onChange={setDivision} /></PageHeading>
    {initialPlayer && !selected && <p className="notice">This player is not available in the selected division or season. <Link href={`/players?division=${division}`}>Browse players</Link></p>}
    {selected && selectedTeam && <PlayerProfile key={selected.id} player={selected} team={selectedTeam} league={league} record={stats.get(selected.id)!} headingRef={profileHeading} />}
    <section className="players-directory" aria-label="Player directory">
      <div className="players-directory-heading"><div><h2 ref={directoryHeading} tabIndex={-1}>Player directory</h2><p>Junior & Open rosters · Official statistics from confirmed games</p></div><Link href={`/statistics?division=${division}`}>View league leaders<ArrowRight size={15} /></Link></div>
      <div className="players-directory-filters">
        <label className="player-search"><Search size={18} aria-hidden="true" /><input aria-label="Search players" placeholder="Search player, team or jersey number…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <label>Team<select aria-label="Filter players by team" value={activeTeam} onChange={event => setTeamId(event.target.value)}><option value="">All teams</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label>Sort by<select aria-label="Sort players" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Name A–Z</option><option value="points">Points per game</option><option value="rebounds">Rebounds per game</option><option value="assists">Assists per game</option></select></label>
      </div>
      <p className="players-directory-count" role="status" aria-live="polite">{players.length ? `Showing ${offset + 1}–${Math.min(offset + 20, players.length)} of ${players.length} players` : "No matching players"} · {divisionLabel(division)} division</p>
      <div className="players-directory-grid">{players.slice(offset, offset + 20).map(player => {
        const record = stats.get(player.id)!;
        const team = teamMap.get(player.teamId)!;
        return <Link className={`player-directory-card ${selected?.id === player.id ? "is-selected" : ""}`} key={player.id} href={`/players?division=${division}&player=${player.id}`} scroll={false} aria-label={`View ${player.name} player stats`}>
          <div className="player-directory-card-top"><PlayerAvatar player={player} /><div><small>{divisionLabel(division)} · {player.position || "Player"}</small><h3>{player.name}</h3><span><TeamMark team={team} size="tiny" />{team.name}</span></div></div>
          <div className="player-directory-numbers"><div><b>{record.games.length}</b><span>GP</span></div>{(["points", "rebounds", "assists"] as const).map((key, index) => <div key={key}><b>{record.games.length ? average(player.id, key).toFixed(1) : "—"}</b><span>{["PPG", "RPG", "APG"][index]}</span></div>)}</div>
          <div className="player-directory-card-footer"><span>View player stats</span><ArrowRight size={14} /></div>
        </Link>;
      })}</div>
      {!players.length && <Empty title="No players found" description="Try a different name, jersey number, team or division." />}
      {pageCount > 1 && <nav className="statistics-pagination" aria-label="Player directory pagination"><span>Page <strong>{page}</strong> of {pageCount}</span><div className="statistics-pagination-controls"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => changePage(page - 1)}><ChevronLeft size={15} />Previous</Button><Button variant="outline" size="sm" disabled={page === pageCount} onClick={() => changePage(page + 1)}>Next<ChevronRight size={15} /></Button></div></nav>}
    </section>
  </div>;
}
