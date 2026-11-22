"use client";

import { Maximize, Minimize, Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Game, League, Stats } from "@/lib/types";
import { Button } from "./ui/button";

const columns = [
  ["points", "PTS", "points"],
  ["rebounds", "REB", "rebounds"],
  ["assists", "AST", "assists"],
  ["steals", "STL", "steals"],
  ["blocks", "BLK", "blocks"],
  ["fouls", "PF", "personal fouls"],
] as const;

export default function CommitteeScoresheet({ game, league, disabled, selectedPlayer, onSelect, onRecord, pointsQuarter, onPointsQuarterChange, practice, canOverrideFinish, onOverrideFinish }: {
  game: Game;
  league: League;
  disabled: boolean;
  selectedPlayer: string;
  onSelect: (id: string) => void;
  onRecord: (kind: string, amount: number, playerId: string, incomingPlayerId?: string) => void;
  pointsQuarter: string;
  onPointsQuarterChange: (quarter: string) => void;
  practice: boolean;
  canOverrideFinish: boolean;
  onOverrideFinish: (reason: string) => Promise<boolean>;
}) {
  const scoresheet = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [courtOnly, setCourtOnly] = useState(false);
  const finishDialog = useRef<HTMLDialogElement>(null);
  const [finishReason, setFinishReason] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");
  useEffect(() => {
    const update = () => setExpanded(document.fullscreenElement === scoresheet.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const substitutionDialog = useRef<HTMLDialogElement>(null);
  const [outgoingId, setOutgoingId] = useState("");
  const [incomingId, setIncomingId] = useState("");
  const season = league.seasons.find(s => s.id === game.seasonId);
  const foulLimit = season?.foulLimit;
  const timeoutPeriod = game.quarter > 4 && season?.overtimeTimeoutLimit != null ? "this overtime" : season?.timeoutPeriod === "Half" ? "this half" : "this game";
  const timeoutLimit = game.quarter > 4 ? season?.overtimeTimeoutLimit ?? season?.timeoutLimit : season?.timeoutLimit;
  // Captured game rosters retain names and numbers even after roster amendments.
  const roster = game.roster.length ? game.roster.map(id => {
    const snapshot = game.rosterSnapshots?.find(p => p.playerId === id);
    const current = league.players.find(p => p.id === id);
    return snapshot ?? (current && { ...current, playerId: current.id });
  }).filter(p => p != null) : league.players.filter(p =>
    game.status === "Scheduled" && [game.homeId, game.awayId].includes(p.teamId) && (p.status == null || p.status === "Approved")
  ).map(p => ({ ...p, playerId: p.id }));
  const periods = Array.from({ length: Math.max(4, game.quarter) }, (_, i) => i + 1);
  const canRecord = !disabled && game.status === "Live";
  const court = season?.courts.find(c => c.id === game.courtId);
  const outgoing = roster.find(p => p.playerId === outgoingId);
  const replacements = roster.filter(p => p.teamId === outgoing?.teamId && !game.onCourt?.includes(p.playerId) && (foulLimit == null || (game.stats[p.playerId]?.fouls ?? 0) < foulLimit)).sort((a, b) => a.number - b.number);
  const canSubstitute = canRecord && Boolean(outgoing && game.onCourt?.includes(outgoingId));
  const priorityPlayers = new Set(game.status === "Scheduled" ? game.startingFive ?? [] : game.onCourt ?? []);

  return <section ref={scoresheet} className="committee-scoresheet panel" aria-label="Committee scoresheet">
    <div className="scoresheet-heading">
      <div><span className="eyebrow">{practice ? "PRACTICE · " : ""}TABLE COMMITTEE</span><h2>Committee scoresheet <span className="scoresheet-live-summary">{game.quarter <= 4 ? `Q${game.quarter}` : `OT${game.quarter - 4}`} · {game.homeScore}–{game.awayScore}</span></h2>
        <p>{season?.name} · {game.division} · {game.stage}{game.number ? ` · Game ${game.number}` : ""}</p>
        <p>{game.start ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: season?.timezone || "Asia/Manila" }).format(new Date(game.start)) : "Date to be confirmed"}{court ? ` · ${court.venue} / ${court.name}` : ""} · {game.status}</p>
      </div>
      <div className="scoresheet-actions scoresheet-toolbar">
        {canOverrideFinish && game.status === "Live" && <Button variant="outline" disabled={disabled} onClick={() => { setFinishError(""); setFinishReason(""); finishDialog.current?.showModal(); }}>Override finish</Button>}
        <Button className="scoresheet-expand" variant="outline" aria-pressed={expanded} onClick={async () => {
          try {
            if (document.fullscreenElement === scoresheet.current) await document.exitFullscreen();
            else await scoresheet.current?.requestFullscreen();
          } catch {
            // Browsers may deny fullscreen; keep the normal scoresheet usable.
          }
        }}>{expanded ? <Minimize size={16} /> : <Maximize size={16} />}{expanded ? "Exit expanded view" : "Expand scoresheet"}</Button>
        <Button variant="outline" onClick={() => window.print()}><Printer size={16} />Print / Save PDF</Button>
      </div>
    </div>
    {game.status === "Final" && <p className="notice" role="status">{game.resultApproved ? "Official team result — included in standings. Player statistics are pending confirmation." : "Final — awaiting organizer approval. Approve the team result in League management to include it in standings; player statistics can be confirmed separately."}</p>}
    {game.status === "Confirmed" && <p className="notice" role="status">Official result — included in standings and player statistics.</p>}
    <p className="scoresheet-help">The selected starting five begin on court. Use Sub in to bring in a present bench player. Click Sub out and choose the player coming in to replace them. Tap +1, +2 or +3 beside a player to score, or a stat total to add one. Select a player’s name to make corrections below. {game.status === "Scheduled" ? "Roster preview — acquire control and start the game to record." : canRecord ? "Changes update the live scoreboard." : "View only — scoring requires control and a live connection."}</p>
    <div className="scoresheet-actions scoresheet-view-controls" role="group" aria-label="Scoresheet entry controls">
      <Button variant={courtOnly ? "outline" : "default"} aria-pressed={!courtOnly} onClick={() => setCourtOnly(false)}>All players</Button>
      <Button variant={courtOnly ? "default" : "outline"} aria-pressed={courtOnly} disabled={game.status === "Scheduled"} onClick={() => setCourtOnly(true)}>On court</Button>
      <label className="scoresheet-quarter-entry" htmlFor="points-quarter">Points quarter
        <select id="points-quarter" aria-label="Points quarter" value={pointsQuarter} onChange={event => onPointsQuarterChange(event.target.value)} disabled={!canRecord}>
          <option value="">Live quarter ({game.quarter <= 4 ? `Q${game.quarter}` : `OT${game.quarter - 4}`})</option>
          {periods.map(quarter => <option key={quarter} value={quarter}>{quarter <= 4 ? `Q${quarter}` : `OT${quarter - 4}`} · manual entry</option>)}
        </select>
      </label>
      <span role="status">{pointsQuarter ? `Manual entry: points go to ${Number(pointsQuarter) <= 4 ? `Q${pointsQuarter}` : `OT${Number(pointsQuarter) - 4}`}. Choose a player and add their points. The live quarter and clock stay unchanged.` : "Points follow the live quarter. Choose a quarter to enter scores from your paper sheet."}</span>
    </div>
    <div className="scoresheet-scroll" tabIndex={0} role="region" aria-label="Score by quarter">
      <table className="scoresheet-periods"><caption>Score by quarter</caption><thead><tr><th scope="col">Team</th>{periods.map(q => <th scope="col" key={q}>{q <= 4 ? `Q${q}` : `OT${q - 4}`}</th>)}<th scope="col">Total</th></tr></thead>
        <tbody>{[game.homeId, game.awayId].map((id, index) => <tr key={id}><th scope="row">{league.teams.find(t => t.id === id)?.name || (index ? "Away" : "Home")}</th>{periods.map(q => {
          const period = game.quarterResults?.find(result => result.quarter === q);
          return <td key={q}>{game.status === "Scheduled" || (q > game.quarter && !period) ? "—" : period?.[index ? "away" : "home"] ?? 0}</td>;
        })}<td><strong>{index ? game.awayScore : game.homeScore}</strong></td></tr>)}</tbody>
      </table>
    </div>
    <div className="scoresheet-teams">{[game.homeId, game.awayId].map((teamId, index) => {
      const team = league.teams.find(t => t.id === teamId);
      const players = roster.filter(p => p.teamId === teamId).sort((a, b) =>
        Number(priorityPlayers.has(b.playerId)) - Number(priorityPlayers.has(a.playerId)) ||
        a.number - b.number || a.name.localeCompare(b.name)
      );
      const visiblePlayers = courtOnly ? players.filter(p => game.onCourt?.includes(p.playerId)) : players;
      const onCourtCount = players.filter(p => game.onCourt?.includes(p.playerId)).length;
      const total = (key: keyof Stats) => players.reduce((sum, p) => sum + (game.stats[p.playerId]?.[key] ?? 0), 0);
      return <div className="scoresheet-team" key={teamId}>
        <div className="scoresheet-team-heading"><h3>{team?.name || (index ? "Away" : "Home")} <span>{index ? "AWAY" : "HOME"}</span></h3><p><strong>{onCourtCount}/5 on court</strong> · Quarter fouls: {index ? game.awayFouls : game.homeFouls} · Timeouts {timeoutPeriod}: {index ? game.awayTimeouts : game.homeTimeouts}{timeoutLimit != null ? ` / ${timeoutLimit}` : ""}</p></div>
        <div className="scoresheet-scroll" tabIndex={0} role="region" aria-label={`${team?.name || (index ? "Away" : "Home")} player statistics`}>
          <table className="scoresheet-roster"><caption>{team?.name || (index ? "Away" : "Home")} player statistics</caption><thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Court status</th><th scope="col" className="scoresheet-actions">Add points</th>{columns.map(([key, label, full]) => <th scope="col" key={key}><abbr title={full}>{label}</abbr></th>)}</tr></thead>
            <tbody>{players.map(p => {
              const fouledOut = foulLimit != null && (game.stats[p.playerId]?.fouls ?? 0) >= foulLimit;
              const onCourt = Boolean(game.onCourt?.includes(p.playerId));
              return <tr key={p.playerId} className={`${selectedPlayer === p.playerId ? "is-selected" : ""} ${courtOnly && !onCourt ? "scoresheet-filtered-player" : ""}`}>
                <td className="scoresheet-number"><span className="scoresheet-number-prefix" aria-hidden="true">#</span>{p.number}</td><th scope="row"><button className="scoresheet-player" aria-pressed={selectedPlayer === p.playerId} onClick={() => onSelect(p.playerId)}>{p.name}</button>{fouledOut && <small className="scoresheet-foul-limit">Foul limit</small>}</th>
                <td><div className={`scoresheet-substitution ${onCourt ? "is-on-court" : ""}`}><span>{onCourt ? "On court" : "Bench"}</span><button className="scoresheet-actions" disabled={!canRecord || (!onCourt && (fouledOut || onCourtCount >= 5))} aria-label={`${onCourt ? "Sub out" : "Sub in"} ${p.name}`} onClick={() => {
                  if (!onCourt) { onRecord("substitution", 1, p.playerId); return; }
                  setOutgoingId(p.playerId);
                  setIncomingId("");
                  substitutionDialog.current?.showModal();
                }}>{onCourt ? "Sub out" : "Sub in"}</button></div></td>
                <td className="scoresheet-actions"><div className="scoresheet-points">{[1, 2, 3].map(n => <button key={n} disabled={!canRecord || (fouledOut && !pointsQuarter)} aria-label={`Add ${n} ${n === 1 ? "point" : "points"} for ${p.name}`} onClick={() => onRecord("points", n, p.playerId)}>+{n}</button>)}</div></td>
                {columns.map(([key, label, full]) => <td key={key} data-stat={label}>{key === "points" ? <strong>{game.stats[p.playerId]?.[key] ?? 0}</strong> : <button className="scoresheet-stat" data-label={label} disabled={!canRecord || (fouledOut && key !== "fouls")} aria-label={`Add 1 ${full} for ${p.name}`} onClick={() => onRecord(key, 1, p.playerId)}><span>{game.stats[p.playerId]?.[key] ?? 0}</span><small aria-hidden="true">+1</small></button>}</td>)}
              </tr>;
            })}{visiblePlayers.length === 0 && <tr className="scoresheet-empty"><td colSpan={10}>{courtOnly ? "No players on court. Choose All players to make a substitution." : "No captured players for this team."}</td></tr>}</tbody>
            <tfoot><tr><th colSpan={3} scope="row">Team totals</th><td className="scoresheet-actions" />{columns.map(([key, label]) => <td key={key} data-stat={label}>{total(key)}</td>)}</tr></tfoot>
          </table>
        </div>
        {total("points") !== (index ? game.awayScore : game.homeScore) && <p className="notice error" role="alert">Player points do not match the team score. Review the scoring records before confirming this result.</p>}
      </div>;
    })}</div>
    <p className="scoresheet-legend">PTS Points · REB Rebounds · AST Assists · STL Steals · BLK Blocks · PF Personal fouls.{foulLimit != null && ` Foul limit: ${foulLimit}.`}</p>
    <div className="scoresheet-signatures"><span>Scorer: ____________________</span><span>Statistician: ____________________</span><span>Referee: ____________________</span></div>
    <dialog className="scoresheet-sub-dialog scoresheet-actions" ref={finishDialog} aria-labelledby="override-finish-title" onCancel={event => { if (finishing) event.preventDefault(); }}>
      <form onSubmit={async event => {
        event.preventDefault();
        if (finishing || disabled || !canOverrideFinish || game.status !== "Live" || !finishReason.trim() || game.homeScore === game.awayScore) return;
        setFinishing(true); setFinishError("");
        try {
          if (await onOverrideFinish(finishReason.trim())) finishDialog.current?.close();
          else setFinishError("Could not finish the game. Check the connection and your control, then try again.");
        } catch (error) { setFinishError((error as Error).message); }
        finally { setFinishing(false); }
      }}>
        <span className="eyebrow">ORGANIZER OVERRIDE</span>
        <h2 id="override-finish-title">Finish this game now?</h2>
        <p><strong>{league.teams.find(team => team.id === game.homeId)?.name} {game.homeScore} – {game.awayScore} {league.teams.find(team => team.id === game.awayId)?.name}</strong></p>
        <p>This stops the clock even if the displayed quarter or clock is unfinished. Recorded scores and player stats stay unchanged. {practice ? "This affects only your practice game." : "When player points match the team totals, this organizer override confirms the result and updates standings and player statistics immediately. Otherwise, the game stays Final awaiting review."}</p>
        <label htmlFor="override-finish-reason">Reason for override</label>
        <textarea id="override-finish-reason" required value={finishReason} onChange={event => setFinishReason(event.target.value)} disabled={finishing} placeholder="For example: game completed on the paper scoresheet." />
        {game.homeScore === game.awayScore && <p role="alert">The score is tied. Record the correct score or play overtime before finishing.</p>}
        {finishError && <p className="error" role="alert">{finishError}</p>}
        <div className="button-row"><Button type="submit" disabled={finishing || disabled || game.status !== "Live" || !finishReason.trim() || game.homeScore === game.awayScore}>{finishing ? "Finishing…" : "Finish game with override"}</Button><Button type="button" variant="outline" disabled={finishing} onClick={() => finishDialog.current?.close()}>Keep scoring</Button></div>
      </form>
    </dialog>
    <dialog className="scoresheet-sub-dialog scoresheet-actions" ref={substitutionDialog} aria-labelledby="substitution-title" onClose={() => { setOutgoingId(""); setIncomingId(""); }}>
      <form onSubmit={event => {
        event.preventDefault();
        if (!canSubstitute || !replacements.some(p => p.playerId === incomingId)) return;
        onRecord("substitution", 0, outgoingId, incomingId);
        substitutionDialog.current?.close();
      }}>
        <span className="eyebrow">PLAYER SUBSTITUTION</span>
        <h2 id="substitution-title">Who’s coming in?</h2>
        <p>Going out: <strong>#{outgoing?.number} {outgoing?.name}</strong></p>
        <label htmlFor="incoming-player">Player coming in</label>
        <select id="incoming-player" value={incomingId} onChange={event => setIncomingId(event.target.value)} disabled={!canSubstitute || replacements.length === 0}>
          <option value="">Select a bench player</option>
          {replacements.map(p => <option key={p.playerId} value={p.playerId}>#{p.number} {p.name}</option>)}
        </select>
        {replacements.length === 0 && <p>No available bench players. You can sub this player out without a replacement.</p>}
        <div className="button-row">
          <Button type="submit" disabled={!canSubstitute || !replacements.some(p => p.playerId === incomingId)}>Confirm substitution</Button>
          <Button type="button" variant="outline" onClick={() => substitutionDialog.current?.close()}>Cancel</Button>
        </div>
        <Button type="button" variant="ghost" disabled={!canSubstitute} onClick={() => { onRecord("substitution", 0, outgoingId); substitutionDialog.current?.close(); }}>Sub out only</Button>
      </form>
    </dialog>
  </section>;
}
