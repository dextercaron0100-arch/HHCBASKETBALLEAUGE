"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Clock3, GitBranch, Trophy } from "lucide-react";
import { Divisions, PageHeading, TeamMark } from "./league-app";
import { divisionLabel } from "@/lib/divisions";
import { gameWinner, hasOfficialResult } from "@/lib/results";
import { dateTime } from "@/lib/api";
import type { Game, League } from "@/lib/types";

import { playoffFormat, type PlayoffSlot } from "@/lib/playoff-format";
import RotatingTrophy from "./rotating-trophy";
import PlayoffQualifiers, { usePlayoffStandings } from "./playoff-qualifiers";
import { qualifiedBracketSeeds, type BracketSeed } from "@/lib/playoff-qualification";

export default function Playoffs({ league, division, setDivision }: {
  league: League;
  division: string;
  setDivision: (division: string) => void;
}) {
  const label = divisionLabel(division);
  const standings = usePlayoffStandings(league, division);
  const bracketSeeds = standings.rows ? qualifiedBracketSeeds(league, division, standings.rows) : {};
  const season = league.seasons[0];
  const sizes = season?.groupSizes?.[division] ?? [];
  const bestOf = (key: string) => key.startsWith("S") ? season?.semifinalBestOf ?? 1 : key === "F" ? season?.finalBestOf ?? 1 : 1;
  const hasSeries = bestOf("S1") > 1 || bestOf("F") > 1;
  const format = playoffFormat(division, sizes);
  const { slots, rounds, connections } = format;
  const inRound = (slot: PlayoffSlot, index: number) => slot.key.startsWith(rounds[index].key) || (rounds[index].key === "F" && slot.key === "T");
  const [roundSelection, setRoundSelection] = useState({ division, index: 0 });
  const activeRound = roundSelection.division === division ? roundSelection.index : 0;
  const bracketRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(0);
  useEffect(() => {
    const element = bracketRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setBoardWidth(element.clientWidth - 24));
    observer.observe(element);
    return () => observer.disconnect();
  }, [division]);
  const boardScale = boardWidth ? Math.min(1, boardWidth / format.width) : 1;
  function selectRound(index: number) {
    setRoundSelection({ division, index });
  }
  const teams = league.teams.filter(team => team.division === division);
  const formatReady = teams.length === format.teams && sizes.join(",") === format.groupSizes.join(",");
  const games = league.games.filter(game => game.seasonId === season?.id && game.division === division && game.stage !== "Group" && game.status !== "Cancelled");
  const matchups = new Map(slots.map(slot => {
    const series = games.filter(game => game.bracketKey === slot.key || game.bracketKey.startsWith(`${slot.key}-`))
      .sort((a, b) => a.bracketKey.localeCompare(b.bracketKey));
    const wins = new Map<string, number>();
    for (const game of series.filter(hasOfficialResult)) {
      const winner = gameWinner(game);
      wins.set(winner, (wins.get(winner) ?? 0) + 1);
    }
    const winner = [...wins].find(([, count]) => count > bestOf(slot.key) / 2)?.[0];
    const game = series.find(game => !hasOfficialResult(game)) ?? series.at(-1);
    return [slot.key, { game, wins, winner }];
  }));
  const champion = league.teams.find(team => team.id === matchups.get("F")?.winner);
  const decided = [...matchups.values()].filter(match => match.winner).length;
  if (!formatReady && games.length === 0) {
    const groupGames = sizes.reduce((sum, size) => sum + size * (size - 1) / 2, 0);
    return <>
      <PageHeading eyebrow="HHC BASKETBALL LEAGUE" title="Playoffs" description="Qualification, matchups and results."><Divisions value={division} onChange={setDivision} /></PageHeading>
      <section className="postseason-panel" aria-label={`${label} playoff bracket`}>
        <header className="postseason-header"><div><span className="eyebrow">{league.seasons[0]?.year ?? "HHC"} POSTSEASON</span><h2>{label} division</h2><p>Qualification rules and matchups are awaiting confirmation.</p></div><span className="postseason-status"><Clock3 size={14} />Format pending</span></header>
        <dl className="postseason-facts"><div><dt>Field</dt><dd>{teams.length} teams</dd></div><div><dt>Teams per group</dt><dd>{sizes.join(" / ") || "To be confirmed"}</dd></div><div><dt>Group games</dt><dd>{groupGames}</dd></div></dl>
        <div className="postseason-qualification"><p><strong>Playoff qualification pending</strong><span>{division === "Junior" ? "Three confirmed losses mean automatic elimination. " : ""}Advancement places and matchups will be announced before seeding.</span></p></div>
        <div className="postseason-toolbar"><div><h3>Groups {sizes.map((_, index) => String.fromCharCode(65 + index)).join(", ")}</h3></div><Link href={`/standings?division=${division}`}>Group standings <ArrowRight size={15} /></Link></div>
      </section>
    </>;
  }
  return (
    <>
      <PageHeading eyebrow="HHC BASKETBALL LEAGUE" title="Playoffs" description="Qualification, matchups and results.">
        <Divisions value={division} onChange={setDivision} />
      </PageHeading>
      <section className="postseason-panel" aria-label={`${label} playoff bracket`}>
        <header className="postseason-header">
          <div><span className="eyebrow">{league.seasons[0]?.year ?? "HHC"} POSTSEASON</span><h2>{champion ? `${champion.name} are champions` : `${label} division`}</h2><p>{champion ? "Championship result confirmed." : games.length ? `${decided} of ${slots.length} playoff matchups decided.` : "Awaiting official seeds. Matchups will be posted here."}</p></div>
          <span className={`postseason-status ${games.some(game => game.status === "Live") ? "is-live" : ""}`}><Clock3 size={14} />{champion ? "Complete" : games.some(game => game.status === "Live") ? "Live playoffs" : games.length ? "Playoffs underway" : "Seeding pending"}</span>
        </header>
        <dl className="postseason-facts"><div><dt>Field</dt><dd>{format.teams} teams</dd></div><div><dt>Group stage</dt><dd>{format.groupSizes.length} groups of {format.groupSizes[0]}</dd></div><div><dt>Qualifiers</dt><dd>{format.qualifiers} teams</dd></div><div><dt>Format</dt><dd>{hasSeries ? "Best-of-three series" : "Single elimination"}</dd></div></dl>
        <div className="postseason-qualification"><p><strong>{format.senior ? "Top 3 in each group advance" : format.juniorWildcards ? "Top 2 per bracket + 2 wildcards advance" : "Top 4 in each group advance"}</strong><span>{format.senior ? "Group winners receive a quarterfinal bye." : format.juniorWildcards ? "Wildcards go to the two best third-place teams." : "Quarterfinals pair qualifiers from opposite groups."}</span></p></div>
        <PlayoffQualifiers league={league} division={division} standings={standings} />
        <details className="postseason-format">
          <summary>Qualification & tournament rules <ChevronDown size={16} /></summary>
          <div className="postseason-rules">
          <p>{format.senior ? "Top three from Groups A, B, C and D qualify. All four group champions receive quarterfinal byes; the eight second- and third-place teams play crossover matches in the Round of 12." : format.juniorWildcards ? "Top two from Brackets A, B and C qualify, plus the two best third-place teams as wildcards. All qualifiers must have fewer than three confirmed losses. Rank each tier by wins, overall point difference, then points scored; unresolved ties need an organizer decision. Group winners receive seeds 1–3, runners-up 4–6, and wildcards 7–8. Quarterfinals: Q1 1 vs 8, Q2 2 vs 7, Q3 4 vs 5, Q4 3 vs 6. No byes. Semifinals: winners Q1 vs Q3 and winners Q2 vs Q4." : "Top four from Groups A and B qualify for crossover quarterfinals. The bottom two in each group are eliminated. No byes or Round of 12."}</p>
          {format.senior && <p>Round of 12: A2 vs B3, C2 vs D3, B2 vs A3, D2 vs C3. Quarterfinals keep teams from facing opponents from their own group.</p>}
          {!formatReady && <p className="postseason-configuration" role="status">Group assignments pending: {teams.length} teams are currently listed in {sizes.length} groups. This bracket follows the new {format.teams}-team format; official seeding waits for the group assignments to be finalized.</p>}
          <p>All {format.senior ? 24 : format.juniorWildcards ? 18 : 30} group games must be confirmed and qualification ties resolved before seeding. Games tied at the end of regulation go to overtime.</p>
          {hasSeries && <p>{bestOf("S1") > 1 && bestOf("F") > 1 ? "The semifinals and finals are best of three." : bestOf("S1") > 1 ? "The semifinals are best of three." : "The finals are best of three."} The first team to win two games wins the series.</p>}
          </div>
        </details>
        <div className="postseason-toolbar"><div><h3>Tournament bracket</h3><p>{slots.length} matchups, including the third-place playoff</p></div><Link href={`/standings?division=${division}`}>Group standings <ArrowRight size={15} /></Link></div>
        <div className="postseason-round-nav" role="group" aria-label="Choose playoff round">
          {rounds.map((round, index) => <button type="button" key={round.label} aria-pressed={activeRound === index} aria-controls="playoff-rounds" onClick={() => selectRound(index)}><strong>{round.label}</strong><small>{slots.filter(slot => inRound(slot, index)).length}</small></button>)}
        </div>
        <p className="postseason-hint">Qualified teams appear in the bracket. “Seed pending” places use current standings and can move before final seeding.</p>
        <div ref={bracketRef} key={division} id="playoff-rounds" className="postseason-scroll" role="region" aria-label={`${label} knockout rounds`} tabIndex={0}>
          <div className="conference-board" style={{ width: format.width * boardScale, height: 830 * boardScale }}>
          <div className="postseason-canvas conference-canvas" style={{ width: format.width, transform: `scale(${boardScale})`, transformOrigin: "top left" }}>
            <div className="conference-name west" style={{ left: 16, width: format.centerX - 40 }}><strong>WEST</strong></div>
            <div className="conference-name east" style={{ right: 16, width: format.centerX - 40 }}><strong>EAST</strong></div>
            {rounds.map((round, index) => <h3 key={round.label} aria-label={round.label} className={`postseason-round ${activeRound === index ? "is-active-round" : ""}`} style={{ left: round.x }}>{round.label}<span>{index === rounds.length - 1 ? "The title & the podium" : `${slots.filter(slot => inRound(slot, index)).length} matchups`}</span></h3>)}
            {rounds.filter(round => round.key !== "F").flatMap(round => [round.x, format.width - format.cardWidth - round.x].map((x, index) => <div key={`${round.key}-${index}`} aria-hidden="true" className="conference-round-label" style={{ left: x }}>{round.label}</div>))}
            <svg className="postseason-lines" width={format.width} height="820" aria-hidden="true">
              {connections.map(([from, to]) => {
                const a = slots.find(slot => slot.key === from)!;
                const b = slots.find(slot => slot.key === to)!;
                const forward = a.x < b.x;
                const start = a.x + (forward ? format.cardWidth : 0), end = b.x + (forward ? 0 : format.cardWidth), middle = (start + end) / 2;
                return <path key={`${from}-${to}`} className={matchups.get(from)?.winner ? "completed" : ""} d={`M ${start} ${a.y + 80} H ${middle} V ${b.y + 80} H ${end}`} />;
              })}
            </svg>
            <div className="postseason-trophy" style={{ left: format.centerX, top: 116 }}><RotatingTrophy /><strong>THE FINALS</strong><span>WEST vs EAST</span></div>
            <div className="conference-champion" style={{ left: format.centerX, top: 528 }}>{champion && <TeamMark team={champion} />}<span>{league.seasons[0]?.year ?? "HHC"} · {label.toUpperCase()}</span><strong>{champion ? "CHAMPIONS" : "CHAMPION"}</strong><small>{champion?.name ?? "To be decided"}</small></div>
            {[...slots].sort((a, b) => a.number - b.number).map(slot => <PlayoffMatch key={slot.key} slot={slot} match={matchups.get(slot.key)!} bestOf={bestOf(slot.key)} league={league} seeds={bracketSeeds} active={inRound(slot, activeRound)} conference={slot.x < format.centerX ? "West" : slot.x > format.centerX ? "East" : undefined} />)}
          </div>
          </div>
        </div>
        <footer className="postseason-footer"><span className="postseason-legend" />Confirmed winners advance along the bracket. Third place is contested by the semifinal losers.</footer>
      </section>
    </>
  );
}

function PlayoffMatch({ slot, match, bestOf, league, seeds, active, conference }: { slot: PlayoffSlot; match: { game?: Game; wins: Map<string, number>; winner?: string }; bestOf: number; league: League; seeds: Record<string, BracketSeed>; active: boolean; conference?: string }) {
  const { game, wins, winner: seriesWinner } = match;
  const scored = game && ["Live", "Final", "Confirmed"].includes(game.status);
  const content = <>
    <div className="postseason-match-label"><span>{slot.key === "F" && <Trophy size={13} />}{slot.key === "F" ? "Championship" : slot.key === "T" ? "Third place" : `${conference} · G${slot.number}`}</span><small className={game?.status === "Live" ? "is-live" : ""}>{bestOf > 1 ? "Best of 3" : game ? game.status : "Pending"}</small></div>
    {(["home", "away"] as const).map(side => {
      const [seed, description, bye] = slot[side].split(" · ");
      const projection = !game ? seeds[seed] : undefined;
      const team = league.teams.find(team => team.id === (game ? side === "home" ? game.homeId : game.awayId : projection?.teamId));
      const participant = side === "home" ? game?.homeId : game?.awayId;
      const score = side === "home" ? game?.homeScore : game?.awayScore;
      const winner = seriesWinner && participant === seriesWinner;
      return <div className={`postseason-team ${winner ? "winner" : ""}`} key={side}>{team ? <TeamMark team={team} size="tiny" /> : <span className={`postseason-team-placeholder ${description ? "seed" : ""}`}>{description ? seed : <GitBranch size={15} />}</span>}<span title={team?.name ?? slot[side]}>{team?.name ?? description ?? seed}{projection && <small className="postseason-seed-status">{seed} · {projection.provisional ? "Seed pending" : "Qualified"}</small>}{bye && <small className="postseason-bye">BYE</small>}</span>{winner && <Check size={13} aria-label="Winner" />}<b>{bestOf > 1 && participant ? wins.get(participant) ?? 0 : scored ? score : "—"}</b></div>;
    })}
    <div className="postseason-match-time"><Clock3 size={12} />{game?.start ? dateTime(game.start, league.seasons.find(season => season.id === game.seasonId)?.timezone) : "Schedule to be announced"}{game && <ArrowRight size={12} />}</div>
  </>;
  const className = `postseason-match ${slot.key === "F" ? "championship" : ""} ${slot.key === "T" ? "third-place" : ""} ${game?.status === "Live" ? "live" : ""} ${active ? "is-active-round" : ""}`;
  const style = { left: slot.x, top: slot.y };
  return game ? <Link href={`/live?game=${game.id}`} className={className} style={style} aria-label={`${slot.label}: view game`}>{content}</Link> : <div className={className} style={style} aria-label={`${slot.label}: awaiting seeding`}>{content}</div>;
}
