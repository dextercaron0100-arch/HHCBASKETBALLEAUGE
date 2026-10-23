"use client";

import { ArrowRight, CheckCircle2, Clock3, Users } from "lucide-react";
import type { Player, Team } from "@/lib/types";
import { imageSources } from "@/lib/images";

export default function ChampionshipBracket({ division, teams, players, groupSizes, selectedGroup, onSelectGroup }: {
  division: string;
  teams: Team[];
  players: Player[];
  groupSizes: number[];
  selectedGroup: string;
  onSelectGroup: (group: string) => void;
}) {
  const capacity = groupSizes.reduce((sum, size) => sum + size, 0);
  const pending = Math.max(0, capacity - teams.length);
  return (
    <section className="draw-stage" aria-label={`${division} division brackets`}>
      <div className="draw-stage-header">
        <div>
          <span className="eyebrow">THE ROAD TO THE TITLE</span>
          <h2>{division} division brackets</h2>
          <p>Meet the groups competing for the championship.</p>
        </div>
        <span className={`draw-stage-status ${pending ? "pending" : ""}`}>{pending ? <Clock3 size={15} /> : <CheckCircle2 size={15} />}{pending ? `${pending} ${pending === 1 ? "team" : "teams"} to be announced` : "All teams confirmed"}</span>
      </div>
      <div className="draw-stage-summary">
        <span><strong>{groupSizes.length}</strong> Groups</span>
        <span><strong>{teams.length}</strong> Teams</span>
        <span className="draw-stage-format">Group-stage draw</span>
      </div>
      <div className={`draw-stage-grid ${groupSizes.length === 4 ? "draw-stage-grid-four" : ""}`} style={{ "--draw-columns": groupSizes.length } as React.CSSProperties}>
        {groupSizes.map((size, index) => {
          const group = String.fromCharCode(65 + index);
          const assigned = teams.filter(team => team.group === group).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
          const active = selectedGroup === group;
          return (
            <article className={`draw-pool ${active ? "is-selected" : ""}`} key={group} aria-label={`Group ${group}`}>
              <header className="draw-pool-header">
                <span className="draw-pool-letter" aria-hidden="true">{group}</span>
                <div><h3>Group {group}</h3><p><Users size={13} aria-hidden="true" />{assigned.length === size ? `${size} teams` : `${assigned.length} of ${size} confirmed`}</p></div>
                {active && <span className="draw-pool-selected">Selected</span>}
                <span className="draw-pool-watermark" aria-hidden="true">{group}</span>
              </header>
              <ol className="draw-pool-teams">
                {Array.from({ length: Math.max(size, assigned.length) }, (_, position) => {
                  const team = assigned[position];
                  const playerCount = team ? players.filter(player => player.teamId === team.id).length : 0;
                  return <li key={team?.id ?? `tba-${position}`} className={team ? "" : "is-tba"}>
                    <span className="draw-pool-logo">{team?.logo ? <img {...imageSources(team.logo)} alt="" loading="lazy" decoding="async" /> : <Users size={24} aria-hidden="true" />}</span>
                    <div className="draw-pool-team"><strong>{team?.name ?? "TBA"}</strong><span>{team ? playerCount ? `${playerCount} ${playerCount === 1 ? "player" : "players"} registered` : "Roster coming soon" : "Team to be announced"}</span></div>
                  </li>;
                })}
              </ol>
              <div className="draw-pool-action"><button type="button" onClick={() => onSelectGroup(group)} aria-label={`View Group ${group} standings`} aria-pressed={active}><span>View standings</span><ArrowRight size={18} aria-hidden="true" /></button></div>
            </article>
          );
        })}
      </div>
      <div className="draw-stage-footer"><CheckCircle2 size={15} aria-hidden="true" /><p>{pending ? "Group draw saved. Remaining teams will fill the TBA slots." : "Group draw complete. Select a group to explore its standings."}</p></div>
    </section>
  );
}
