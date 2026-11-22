"use client";
import { useState } from "react";
import type { Game, GameLineup, League } from "@/lib/types";
import { Button } from "./ui/button";

export default function GameLineupSetup({ game, league, disabled, error, onSave, onStart }: {
  game: Game; league: League; disabled: boolean;
  error?: string;
  onSave: (lineup: GameLineup) => void; onStart: () => void;
}) {
  const [present, setPresent] = useState(game.roster);
  const [starters, setStarters] = useState(game.startingFive ?? []);
  const teams = [game.homeId, game.awayId].map(id => ({
    id, name: league.teams.find(t => t.id === id)?.name || "Team",
    players: league.players.filter(p => p.teamId === id && (p.status == null || p.status === "Approved")).sort((a, b) => a.number - b.number || a.name.localeCompare(b.name)),
  }));
  const valid = teams.every(team => team.players.filter(p => starters.includes(p.id) && present.includes(p.id)).length === 5);
  const matches = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id));
  const saved = valid && matches(present, game.roster) && matches(starters, game.startingFive ?? []);
  return <section className="panel game-lineup" aria-label="Game-day lineup">
    <span className="eyebrow">BEFORE TIP-OFF</span><h2>Attendance & starting five</h2>
    <p>Mark the players present today, then choose five starters for each team. Players left absent will not be included in this game.</p>
    <div className="game-lineup-teams">{teams.map(team => {
      const startingCount = team.players.filter(p => starters.includes(p.id)).length;
      return <fieldset key={team.id} disabled={disabled} aria-label={`${team.name} lineup`}>
        <legend>{team.name}</legend>
        <p>{team.players.filter(p => present.includes(p.id)).length} present · <strong>{startingCount}/5 starters</strong></p>
        <div className="game-lineup-labels" aria-hidden="true"><span>Player</span><span>Present</span><span>Starter</span></div>
        {team.players.map(player => <div className="game-lineup-player" key={player.id}>
          <span><small>#{player.number}</small> {player.name}</span>
          <input type="checkbox" aria-label={`Present ${player.name}`} checked={present.includes(player.id)} onChange={event => {
            setPresent(ids => event.target.checked ? [...ids, player.id] : ids.filter(id => id !== player.id));
            if (!event.target.checked) setStarters(ids => ids.filter(id => id !== player.id));
          }} />
          <input type="checkbox" aria-label={`Starter ${player.name}`} checked={starters.includes(player.id)} disabled={!present.includes(player.id) || (!starters.includes(player.id) && startingCount >= 5)} onChange={event => setStarters(ids => event.target.checked ? [...ids, player.id] : ids.filter(id => id !== player.id))} />
        </div>)}
        {team.players.length === 0 && <p>No approved players available.</p>}
      </fieldset>;
    })}</div>
    <p className="game-lineup-status" role="status">{saved ? "Lineup saved. The selected starting five will begin on court." : valid ? "Save your lineup before starting the game." : "Select exactly five present starters for each team."}</p>
    {error && <p className="notice error" role="alert">{error} The game has not started. Resolve this issue and try again.</p>}
    <div className="button-row"><Button variant="outline" disabled={disabled || !valid || saved} onClick={() => onSave({ presentPlayerIds: present, starterPlayerIds: starters })}>Save lineup</Button><Button disabled={disabled || !saved} onClick={onStart}>Start game & capture roster</Button></div>
  </section>;
}
