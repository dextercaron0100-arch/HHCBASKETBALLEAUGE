"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Star } from "lucide-react";
import type { League, Team } from "@/lib/types";
import { useFollowedTeams } from "@/lib/followed-teams";
import { divisionLabel } from "@/lib/divisions";
import { dateTime } from "@/lib/api";
import { TeamMark } from "./league-app";

export function teamLink(team: Team) {
  return `/teams?division=${encodeURIComponent(team.division)}&team=${encodeURIComponent(team.id)}#team-roster`;
}

export default function FanHub({ league }: { league: League }) {
  const { ids, ready, persistent, toggle } = useFollowedTeams();
  const teams = league.teams.filter(team => ids.includes(team.id));
  if (!ready) return null;
  if (!teams.length) return <section className="fan-intro" aria-label="Follow your teams"><span className="fan-star"><Star size={23} /></span><div><h2>Your teams. Your home court.</h2><p>Follow a team from its roster to keep its record and next game right here.</p></div><Link href="/teams">Choose your teams <ArrowRight size={16} /></Link></section>;
  return <section className="fan-hub" aria-label="Your followed teams">
    <div className="fan-hub-heading"><div><span className="eyebrow">YOUR COURTSIDE PICKS</span><h2>Following your teams</h2><p>{persistent ? "Saved on this device. No account needed." : "Following for this visit. Browser storage is unavailable."}</p></div><Link href="/teams">Find more teams <ArrowRight size={15} /></Link></div>
    <div className="fan-team-grid">{teams.map(team => {
      const games = league.games.filter(game => game.homeId === team.id || game.awayId === team.id);
      const confirmed = games.filter(game => game.status === "Confirmed");
      const wins = confirmed.filter(game => game.homeId === team.id ? game.homeScore > game.awayScore : game.awayScore > game.homeScore).length;
      const next = games.find(game => game.status === "Live") ?? games.filter(game => game.status === "Scheduled" && (!game.start || new Date(game.start).getTime() >= Date.now())).sort((a, b) => (a.start || "z").localeCompare(b.start || "z"))[0];
      const opponent = league.teams.find(value => value.id === (next?.homeId === team.id ? next.awayId : next?.homeId));
      return <article className="fan-team" key={team.id}>
        <div className="fan-team-heading"><TeamMark team={team} size="small" /><Link href={teamLink(team)}><span>{divisionLabel(team.division)} · Group {team.group}</span><h3>{team.name}</h3></Link><button aria-label={`Unfollow ${team.name}`} aria-pressed="true" onClick={() => toggle(team.id)}><Star size={18} fill="currentColor" /></button></div>
        <div className="fan-team-record"><strong>{wins}<span>W</span><i>—</i>{confirmed.length - wins}<span>L</span></strong><small>Confirmed record</small></div>
        <div className="fan-next-game"><CalendarDays size={16} /><div><span>{next?.status === "Live" ? "LIVE NOW" : "NEXT GAME"}</span><p>{next ? `vs ${opponent?.name || "Opponent to be announced"}` : "Schedule to be announced"}</p><small>{next?.status === "Live" ? "Follow the live score" : next ? dateTime(next.start, league.seasons.find(season => season.id === team.seasonId)?.timezone) : "Your next matchup will appear here."}</small></div></div>
        <Link className="fan-team-action" href={next ? `/live?game=${next.id}` : `/schedule?division=${team.division}&team=${team.id}`}>{next?.status === "Live" ? "Watch the scoreboard" : next ? "View matchup" : "View team schedule"}<ArrowRight size={14} /></Link>
      </article>;
    })}</div>
  </section>;
}
