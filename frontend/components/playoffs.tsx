"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Clock3, GitBranch, ShieldCheck, Trophy, Users } from "lucide-react";
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
  const [roundSelection, setRoundSelection] = useState({ division, index: 0 });
  const activeRound = roundSelection.division === division ? roundSelection.index : 0;
  const bracketRef = useRef<HTMLDivElement>(null);
  function selectRound(index: number) {
    setRoundSelection({ division, index });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bracketRef.current?.scrollTo({ left: rounds[index].x - 16, behavior: reducedMotion ? "instant" : "smooth" });
  }
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
        <div className="postseason-format-stats"><div><Users size={18} /><b>{format.teams}</b><span>Competing teams</span></div><div><GitBranch size={18} /><b>{format.groupSizes.length} × {format.groupSizes[0]}</b><span>Group stage</span></div><div><ShieldCheck size={18} /><b>{format.qualifiers}</b><span>Playoff places</span></div><div><Trophy size={18} /><b>1</b><span>Champion</span></div></div>
        <div className="postseason-qualification"><ShieldCheck size={19} /><p><strong>{format.senior ? "Top 3 in each group advance" : "Top 4 in each group advance"}</strong><span>{format.senior ? "Group winners go straight to the quarterfinals." : "Eight teams. Crossover quarterfinals. No second chances."}</span></p><span className="postseason-total">{format.totalGames} games · One title</span></div>
        <details className="postseason-format">
          <summary>Qualification & tournament rules <ChevronDown size={16} /></summary>
          <div className="postseason-rules">
          <p>{format.senior ? "Top three from Groups A, B, C and D qualify. All four group champions receive quarterfinal byes; the eight second- and third-place teams play crossover matches in the Round of 12." : "Top four from Groups A and B qualify for crossover quarterfinals. The bottom two in each group are eliminated. No byes or Round of 12."}</p>
          {format.senior && <p>Round of 12: A2 vs B3, C2 vs D3, B2 vs A3, D2 vs C3. Quarterfinals keep teams from facing opponents from their own group.</p>}
          {!formatReady && <p className="postseason-configuration" role="status">Group assignments pending: {teams.length} teams are currently listed in {sizes.length} groups. This bracket follows the new {format.teams}-team format; official seeding waits for the group assignments to be finalized.</p>}
          <p>All {format.senior ? 24 : 30} group games must be confirmed and qualification ties resolved before seeding. Single elimination with overtime for tied games.</p>
          </div>
        </details>
        <div className="postseason-toolbar"><div><span className="eyebrow">THE KNOCKOUT STAGE</span><h3>Win. Advance. Repeat.</h3></div><Link href={`/standings?division=${division}`}>Group standings <ArrowRight size={15} /></Link></div>
        <div className="postseason-round-nav" role="group" aria-label="Choose playoff round">
          {rounds.map((round, index) => <button type="button" key={round.label} aria-pressed={activeRound === index} aria-controls="playoff-rounds" onClick={() => selectRound(index)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{round.label}</strong><small>{slots.filter(slot => slot.x === round.x).length} games</small></button>)}
        </div>
        <p className="postseason-hint"><span className="postseason-desktop-hint">Follow the connections to the final. Select a round to bring it into view.</span><span className="postseason-mobile-hint">Choose a round above to see its matchups.</span></p>
        <div ref={bracketRef} key={division} id="playoff-rounds" className="postseason-scroll" role="region" aria-label={`${label} knockout rounds`} tabIndex={0}>
          <div className="postseason-canvas" style={{ width: format.width }}>
            {rounds.map((round, index) => <h3 key={round.label} aria-label={round.label} className={`postseason-round ${activeRound === index ? "is-active-round" : ""}`} style={{ left: round.x }}>{round.label}<span>{index === rounds.length - 1 ? "The title & the podium" : `${slots.filter(slot => slot.x === round.x).length} matchups`}</span></h3>)}
            <svg className="postseason-lines" width={format.width} height="790" aria-hidden="true">
              {connections.map(([from, to]) => {
                const a = slots.find(slot => slot.key === from)!;
                const b = slots.find(slot => slot.key === to)!;
                const start = a.x + 280, end = b.x, middle = (start + end) / 2;
                return <path key={`${from}-${to}`} className={findGame(from)?.status === "Confirmed" ? "completed" : ""} d={`M ${start} ${a.y + 80} H ${middle} V ${b.y + 80} H ${end}`} />;
              })}
            </svg>
            <div className="postseason-trophy" style={{ left: format.width - 296, top: 104 }}><span className="postseason-trophy-orbit">{champion ? <TeamMark team={champion} /> : <Trophy size={42} strokeWidth={1.25} />}</span><strong>{champion?.name ?? "Earn the crown."}</strong><span>{champion ? "CONFIRMED CHAMPION" : "ONE DIVISION. ONE CHAMPION."}</span></div>
            {[...slots].sort((a, b) => a.number - b.number).map(slot => <PlayoffMatch key={slot.key} slot={slot} game={findGame(slot.key)} league={league} active={slot.x === rounds[activeRound].x} />)}
          </div>
        </div>
        <footer className="postseason-footer"><span className="postseason-legend" />Confirmed winners advance along the bracket. Third place is contested by the semifinal losers.</footer>
      </section>
    </>
  );
}

function PlayoffMatch({ slot, game, league, active }: { slot: PlayoffSlot; game?: Game; league: League; active: boolean }) {
  const scored = game && ["Live", "Final", "Confirmed"].includes(game.status);
  const content = <>
    <div className="postseason-match-label"><span>{slot.key === "F" && <Trophy size={13} />}{slot.key === "F" ? "Championship" : slot.key === "T" ? "Third place" : `Game ${slot.number}`}</span><small className={game?.status === "Live" ? "is-live" : ""}>{game ? game.status : "Awaiting teams"}</small></div>
    {(["home", "away"] as const).map(side => {
      const team = league.teams.find(team => team.id === (side === "home" ? game?.homeId : game?.awayId));
      const score = side === "home" ? game?.homeScore : game?.awayScore;
      const winner = game?.status === "Confirmed" && (side === "home" ? game.homeScore > game.awayScore : game.awayScore > game.homeScore);
      const [seed, description, bye] = slot[side].split(" · ");
      return <div className={`postseason-team ${winner ? "winner" : ""}`} key={side}>{team ? <TeamMark team={team} size="tiny" /> : <span className={`postseason-team-placeholder ${description ? "seed" : ""}`}>{description ? seed : <GitBranch size={15} />}</span>}<span title={team?.name ?? slot[side]}>{team?.name ?? description ?? seed}{bye && !team && <small className="postseason-bye">BYE</small>}</span>{winner && <Check size={13} aria-label="Winner" />}<b>{scored ? score : "—"}</b></div>;
    })}
    <div className="postseason-match-time"><Clock3 size={12} />{game?.start ? dateTime(game.start, league.seasons.find(season => season.id === game.seasonId)?.timezone) : "Schedule to be announced"}{game && <ArrowRight size={12} />}</div>
  </>;
  const className = `postseason-match ${slot.key === "F" ? "championship" : ""} ${slot.key === "T" ? "third-place" : ""} ${game?.status === "Live" ? "live" : ""} ${active ? "is-active-round" : ""}`;
  const style = { left: slot.x, top: slot.y };
  return game ? <Link href={`/live?game=${game.id}`} className={className} style={style} aria-label={`${slot.label}: view game`}>{content}</Link> : <div className={className} style={style} aria-label={`${slot.label}: awaiting seeding`}>{content}</div>;
}
