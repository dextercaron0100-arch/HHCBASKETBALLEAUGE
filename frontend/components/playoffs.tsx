"use client";

import Link from "next/link";
import { ArrowRight, Clock3, GitBranch, Trophy, Users } from "lucide-react";
import { Divisions, PageHeading, TeamMark } from "./league-app";
import { divisionLabel } from "@/lib/divisions";
import { dateTime } from "@/lib/api";
import type { Game, League } from "@/lib/types";

import { playoffFormat, type PlayoffSlot } from "@/lib/playoff-format";

export default function Playoffs({ league, division, setDivision }: {
  league: League;
  division: string;
  setDivision: (division: string) => void;
}) {
  const label = divisionLabel(division);
  const format = playoffFormat(division);
  const { slots, rounds, connections } = format;
  const teams = league.teams.filter(team => team.division === division);
  const sizes = league.seasons[0]?.groupSizes?.[division] ?? [];
  const formatReady = teams.length === format.teams && sizes.join(",") === format.groupSizes.join(",");
  const games = league.games.filter(game => game.division === division && game.stage !== "Group" && game.status !== "Cancelled");
  const findGame = (key: string) => games.find(game => game.bracketKey === key);
  const final = findGame("F");
  const champion = final?.status === "Confirmed" ? league.teams.find(team => team.id === (final.homeScore > final.awayScore ? final.homeId : final.awayId)) : undefined;
  const confirmed = games.filter(game => game.status === "Confirmed").length;
  return (
    <>
      <PageHeading eyebrow="THE CHAMPIONSHIP CHASE" title="Playoffs" description="Follow the official qualification rules and every single-elimination round.">
        <Divisions value={division} onChange={setDivision} />
      </PageHeading>
      <section className="postseason-panel" aria-label={`${label} playoff bracket`}>
        <header className="postseason-header">
          <span className="postseason-title-icon"><Trophy size={28} aria-hidden="true" /></span>
          <div><span className="eyebrow">{label.toUpperCase()} DIVISION</span><h2>{champion ? `${champion.name} are champions` : "The road to the trophy"}</h2><p>{champion ? "Championship result confirmed." : games.length ? `${confirmed} playoff results confirmed` : "Matchups will appear when official playoff seeding is confirmed."}</p></div>
          <span className={`postseason-status ${games.some(game => game.status === "Live") ? "is-live" : ""}`}><Clock3 size={14} />{champion ? "Complete" : games.some(game => game.status === "Live") ? "Live playoffs" : games.length ? "Playoffs underway" : "Seeding pending"}</span>
        </header>
        <div className="postseason-format">
          <div className="postseason-format-stats"><span><b>{format.teams}</b> teams</span><span><b>{format.groupSizes.length} × {format.groupSizes[0]}</b> group stage</span><span><b>{format.qualifiers}</b> qualifiers</span><span><b>{format.totalGames}</b> total games</span></div>
          <p>{format.senior ? "Top three from Groups A, B, C and D qualify. All four group champions receive quarterfinal byes; the eight second- and third-place teams play crossover matches in the Round of 12." : "Top four from Groups A and B qualify for crossover quarterfinals. The bottom two in each group are eliminated. No byes or Round of 12."}</p>
          {format.senior && <p>Round of 12: A2 vs B3, C2 vs D3, B2 vs A3, D2 vs C3. Quarterfinals keep teams from facing opponents from their own group.</p>}
          {!formatReady && <p className="postseason-configuration" role="status">Group assignments pending: {teams.length} teams are currently listed in {sizes.length} groups. This bracket follows the new {format.teams}-team format; official seeding waits for the group assignments to be finalized.</p>}
          <p>All {format.senior ? 24 : 30} group games must be confirmed and qualification ties resolved before seeding. Single elimination with overtime for tied games.</p>
        </div>
        <div className="postseason-toolbar"><span><GitBranch size={16} />{format.senior ? "Round of 12 → Quarterfinals → Semifinals → Final" : "Quarterfinals → Semifinals → Final"}</span><Link href="/standings">Group standings <ArrowRight size={15} /></Link></div>
        <p className="postseason-hint">Scroll sideways to follow the bracket on smaller screens.</p>
        <div key={division} className="postseason-scroll" role="region" aria-label={`${label} knockout rounds. Scroll horizontally to view all rounds.`} tabIndex={0}>
          <div className="postseason-canvas" style={{ width: format.width }}>
            {rounds.map(round => <h3 key={round.label} className="postseason-round" style={{ left: round.x }}>{round.label}</h3>)}
            <svg className="postseason-lines" width={format.width} height="790" aria-hidden="true">
              {connections.map(([from, to]) => {
                const a = slots.find(slot => slot.key === from)!;
                const b = slots.find(slot => slot.key === to)!;
                const start = a.x + 280, end = b.x, middle = (start + end) / 2;
                return <path key={`${from}-${to}`} className={findGame(from)?.status === "Confirmed" ? "completed" : ""} d={`M ${start} ${a.y + 72} H ${middle} V ${b.y + 72} H ${end}`} />;
              })}
            </svg>
            <div className="postseason-trophy" style={{ left: format.width - 296, top: 104 }}><Trophy size={48} strokeWidth={1.25} /><span>ONE DIVISION. ONE CHAMPION.</span></div>
            {slots.map(slot => <PlayoffMatch key={slot.key} slot={slot} game={findGame(slot.key)} league={league} />)}
          </div>
        </div>
        <footer className="postseason-footer"><span className="postseason-legend" />Confirmed winners advance along the bracket. Third place is contested by the semifinal losers.</footer>
      </section>
    </>
  );
}

function PlayoffMatch({ slot, game, league }: { slot: PlayoffSlot; game?: Game; league: League }) {
  const scored = game && ["Live", "Final", "Confirmed"].includes(game.status);
  const content = <>
    <div className="postseason-match-label"><span>{slot.key === "F" && <Trophy size={13} />}{slot.label} · G{slot.number}</span><small className={game?.status === "Live" ? "is-live" : ""}>{game ? game.status : "TBA"}</small></div>
    {(["home", "away"] as const).map(side => {
      const team = league.teams.find(team => team.id === (side === "home" ? game?.homeId : game?.awayId));
      const score = side === "home" ? game?.homeScore : game?.awayScore;
      const winner = game?.status === "Confirmed" && (side === "home" ? game.homeScore > game.awayScore : game.awayScore > game.homeScore);
      return <div className={`postseason-team ${winner ? "winner" : ""}`} key={side}>{team ? <TeamMark team={team} size="tiny" /> : <span className="postseason-team-placeholder"><Users size={14} /></span>}<span>{team?.name ?? slot[side]}</span><b>{scored ? score : "—"}</b></div>;
    })}
    <div className="postseason-match-time">{game?.start ? dateTime(game.start, league.seasons.find(season => season.id === game.seasonId)?.timezone) : "Schedule to be announced"}</div>
  </>;
  const className = `postseason-match ${slot.key === "F" ? "championship" : ""} ${game?.status === "Live" ? "live" : ""}`;
  const style = { left: slot.x, top: slot.y };
  return game ? <Link href={`/live?game=${game.id}`} className={className} style={style} aria-label={`${slot.label}: view game`}>{content}</Link> : <div className={className} style={style} aria-label={`${slot.label}: awaiting seeding`}>{content}</div>;
}
