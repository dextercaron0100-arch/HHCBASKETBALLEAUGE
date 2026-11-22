"use client";

import { useState, type CSSProperties, type RefObject } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, ArrowRight, BarChart3, CalendarDays, Check, Copy, Info, List, Trophy } from "lucide-react";
import type { Game, League, Player, Stats, Team } from "@/lib/types";
import { dateTime } from "@/lib/api";
import { divisionLabel } from "@/lib/divisions";
import { playerStatColumns } from "@/lib/player-stats";
import { imageSources } from "@/lib/images";
import { TeamMark } from "./league-app";
import PlayerAvatar from "./player-avatar";

const sections = [
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "games", label: "Game Log", icon: List },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "awards", label: "Awards", icon: Trophy },
  { id: "about", label: "About", icon: Info },
] as const;
type ProfileSection = typeof sections[number]["id"];

export default function PlayerProfile({ player, team, league, record, headingRef }: {
  player: Player; team: Team; league: League; record: { totals: Stats; games: Game[] }; headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const [active, setActive] = useState<ProfileSection>("stats");
  const [statView, setStatView] = useState<"averages" | "totals">("averages");
  const [shareStatus, setShareStatus] = useState("");
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const season = league.seasons.find(season => season.id === team.seasonId);
  const timezone = season?.timezone || "Asia/Manila";
  const teams = new Map(league.teams.map(team => [team.id, team]));
  const awards = league.awards.filter(award => award.approvedBy && award.playerIds?.includes(player.id));
  const side = (game: Game) => game.homeId === (game.rosterSnapshots?.find(snapshot => snapshot.playerId === player.id)?.teamId ?? player.teamId);
  const wins = record.games.filter(game => side(game) ? game.homeScore > game.awayScore : game.awayScore > game.homeScore).length;
  const best = [...record.games].sort((a, b) => (b.stats?.[player.id]?.points ?? 0) - (a.stats?.[player.id]?.points ?? 0))[0];
  const upcoming = league.games.filter(game => (game.homeId === team.id || game.awayId === team.id) && (game.status === "Live" || game.status === "Scheduled"))
    .sort((a, b) => Number(b.status === "Live") - Number(a.status === "Live") || (a.start ?? "z").localeCompare(b.start ?? "z"));
  const average = (key: keyof Stats) => record.games.length ? (record.totals[key] / record.games.length).toFixed(1) : "—";
  const panelId = `player-${player.id}-panel`;
  const tabsId = `player-${player.id}-tab`;
  const emptyLog = <div className="player-passport-empty"><Activity size={28} aria-hidden="true" /><h4>Your story starts on court.</h4><p>No confirmed appearances yet. Official stats will appear here after the organizer confirms a result.</p></div>;
  const gameLog = (limit?: number) => record.games.length ? <div className="table-wrap player-game-log"><table><caption className="sr-only">{player.name} game log</caption><thead><tr><th>Date</th><th>Opponent</th><th>Result</th>{playerStatColumns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{record.games.slice(0, limit).map(game => {
    const home = side(game);
    const own = home ? game.homeScore : game.awayScore;
    const other = home ? game.awayScore : game.homeScore;
    return <tr key={game.id}><td><Link href={`/live?game=${game.id}`}>{dateTime(game.start, timezone)}</Link></td><td>{teams.get(home ? game.awayId : game.homeId)?.name || "Opponent"}</td><td><span className={own > other ? "positive" : "muted"}>{own > other ? "W" : "L"} {own}–{other}</span></td>{playerStatColumns.map(([key]) => <td key={key}>{game.stats?.[player.id]?.[key] ?? 0}</td>)}</tr>;
  })}</tbody></table></div> : emptyLog;
  return <section className="panel player-profile player-passport" aria-label={`${player.name} player profile`}>
    <div className="player-passport-topbar"><Link className="player-profile-back" href={`/players?division=${team.division}`} scroll={false}><ArrowLeft size={15} />Back to players</Link><span>SPORT PROFILE <b>Basketball</b></span><button type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(window.location.href); setShareStatus("Profile link copied"); }
      catch { setShareStatus("Copy the address from your browser to share this profile."); }
    }}>{shareStatus === "Profile link copied" ? <Check size={14} /> : <Copy size={14} />}Share profile</button></div>
    {shareStatus && <p className="player-share-status" role="status">{shareStatus}</p>}
    <header className="player-passport-banner" style={{ "--profile-team-color": team.color || "#245d91" } as CSSProperties}>
      {team.logo && failedLogo !== team.logo && <img className="player-passport-backdrop" {...imageSources(team.logo, "(max-width: 600px) 360px, 640px")} alt="" aria-hidden="true" decoding="async" onError={() => setFailedLogo(team.logo)} />}
      <PlayerAvatar player={player} />
      <div className="player-passport-identity"><span className="player-passport-eyebrow">HHC BASKETBALL LEAGUE · {season?.year}</span><h2 ref={headingRef} tabIndex={-1}>{player.name}</h2><p>{[player.position, divisionLabel(team.division), "Basketball"].filter(Boolean).join(" / ")}</p><Link href={`/teams?division=${team.division}&team=${team.id}#team-roster`}><TeamMark team={team} size="tiny" />{team.name}<ArrowRight size={12} /></Link>
        <dl className="player-passport-quick"><div className="player-profile-games"><dt>GP</dt><dd><strong>{record.games.length}</strong></dd></div>{playerStatColumns.filter(([key]) => key !== "fouls").map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{average(key)}</dd></div>)}</dl>
      </div>
      <div className="player-passport-seal"><Trophy size={22} /><strong>EVERY GAME<br />COUNTS.</strong><span>YOUR OFFICIAL PLAYER PROFILE</span></div>
    </header>
    <dl className="player-passport-facts">{[
      ["DIVISION", divisionLabel(team.division)], ["JERSEY", player.number >= 0 ? `#${String(player.number).padStart(2, "0")}` : "Not assigned"],
      ["POSITION", player.position || "Not listed"], ["GROUP", `Group ${team.group}`], ["SEASON", String(season?.year ?? "Current")], ["ROSTER", "Approved"],
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className="player-passport-tabs" role="tablist" aria-label="Player profile sections" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = sections.findIndex(section => section.id === active);
      const next = event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + sections.length) % sections.length;
      setActive(sections[next].id);
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
    }}>{sections.map(section => <button key={section.id} id={`${tabsId}-${section.id}`} type="button" role="tab" aria-selected={active === section.id} aria-controls={panelId} tabIndex={active === section.id ? 0 : -1} onClick={() => setActive(section.id)}><section.icon size={16} />{section.label}{section.id === "awards" && awards.length > 0 && <span>{awards.length}</span>}</button>)}</div>
    <div className="player-passport-content" role="tabpanel" id={panelId} aria-labelledby={`${tabsId}-${active}`} tabIndex={0}>
      {active === "stats" && <>
        <div className="player-passport-section-heading"><h3>Season overview <small>{season?.year} · BASKETBALL</small></h3><span>Confirmed results only</span></div>
        <dl className="player-passport-career">{[["W–L", `${wins}–${record.games.length - wins}`, "Player appearances"], ["AWARDS", String(awards.length), "Official achievements"], ["POINTS", average("points"), "Per game"], ["REBOUNDS", average("rebounds"), "Per game"], ["ASSISTS", average("assists"), "Per game"]].map(([label, value, detail]) => <div key={label}><dt>{label}</dt><dd>{value}</dd><small>{detail}</small></div>)}</dl>
        <div className="player-profile-stat-heading"><h3>Season statistics</h3><div role="group" aria-label="Player statistics view"><button type="button" aria-pressed={statView === "averages"} onClick={() => setStatView("averages")}>Per game</button><button type="button" aria-pressed={statView === "totals"} onClick={() => setStatView("totals")}>Totals</button></div></div>
        <dl className="player-profile-stats">{playerStatColumns.map(([key, label, full]) => <div key={key}><dt><abbr title={full}>{label}</abbr></dt><dd>{statView === "totals" ? record.totals[key] : average(key)}</dd></div>)}</dl>
        <div className="player-passport-dashboard"><section className="player-passport-log-preview"><div className="player-passport-section-heading"><h3>Recent games</h3><button type="button" onClick={() => setActive("games")}>View game log<ArrowRight size={13} /></button></div>{gameLog(3)}</section>
          <aside className="player-season-best" aria-label="Player season high"><div className="player-season-best-brand"><Trophy size={20} /><span>SEASON HIGH<small>HHC BASKETBALL LEAGUE</small></span></div><div className="player-season-best-person"><PlayerAvatar player={player} /><div><h3>{player.name}</h3><span>{team.name}</span></div></div>
            {best ? <><div className="player-season-best-numbers">{(["points", "rebounds", "assists", "steals"] as const).map((key, index) => <div key={key}><b>{best.stats?.[player.id]?.[key] ?? 0}</b><span>{["PTS", "REB", "AST", "STL"][index]}</span></div>)}</div><p>Highest scoring confirmed game · {dateTime(best.start, timezone)}</p><Link href={`/live?game=${best.id}`}>View game<ArrowRight size={13} /></Link></> : <div className="player-season-best-pending"><strong>Your next big moment<br />belongs here.</strong><p>Your first confirmed game will start your season record.</p></div>}
          </aside></div>
      </>}
      {active === "games" && <><div className="player-passport-section-heading"><h3>Game log</h3><span>{record.games.length} confirmed appearances</span></div>{gameLog()}</>}
      {active === "schedule" && <><div className="player-passport-section-heading"><h3>Team schedule</h3><span>Game-day attendance determines each lineup</span></div><div className="player-passport-schedule">{upcoming.length ? upcoming.map(game => {
        const opponent = teams.get(game.homeId === team.id ? game.awayId : game.homeId);
        return <Link key={game.id} href={`/live?game=${game.id}`}><div><small>{game.status === "Live" ? "LIVE NOW" : dateTime(game.start, timezone)}</small><strong><TeamMark team={opponent} size="tiny" />vs {opponent?.name || "Opponent to be announced"}</strong><span>{season?.courts.find(court => court.id === game.courtId)?.venue || "Venue to be announced"}</span></div><ArrowRight size={18} /></Link>;
      }) : <div className="player-passport-empty"><CalendarDays size={28} /><h4>No upcoming team games</h4><p>Published fixtures for {team.name} will appear here.</p></div>}</div></>}
      {active === "awards" && <><div className="player-passport-section-heading"><h3>Achievements</h3><span>Officially awarded by the league</span></div><div className="player-passport-awards">{awards.length ? awards.map(award => <article key={award.id}><Trophy size={32} /><span>{season?.year} SEASON</span><h3>{award.type}</h3><p>{player.name} · {team.name}</p></article>) : <div className="player-passport-empty"><Trophy size={30} /><h4>The journey is just beginning.</h4><p>Official player awards will be displayed here once announced.</p></div>}</div></>}
      {active === "about" && <><div className="player-passport-section-heading"><h3>About the player</h3><span>HHC Basketball League</span></div><p className="player-passport-about-intro">{player.name} represents {team.name} in the {divisionLabel(team.division)} division.</p><dl className="player-passport-about">{[["Team", team.name], ["Division", divisionLabel(team.division)], ["Group", team.group], ["Jersey", player.number >= 0 ? `#${String(player.number).padStart(2, "0")}` : "To be announced"], ["Position", player.position || "To be announced"], ["Season", season?.name || "Current season"], ...(player.rosterRole ? [["Roster role", player.rosterRole]] : [])].map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></>}
    </div>
    <footer className="player-passport-footer"><BarChart3 size={16} /><span>Every game adds to your story.</span><span>{season?.name}</span></footer>
  </section>;
}
