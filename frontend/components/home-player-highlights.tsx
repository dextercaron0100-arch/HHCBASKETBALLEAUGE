"use client";

import Link from "next/link";
import { ArrowRight, UserRound } from "lucide-react";
import type { League, Player } from "@/lib/types";
import { imageSources } from "@/lib/images";
import type { CSSProperties } from "react";

// Keep the extra spotlight stable across refreshes and live score updates.
function selectionKey(id: string) {
  return [...id].reduce((key, character) => (Math.imul(key, 31) + character.charCodeAt(0)) >>> 0, 17);
}

export default function HomePlayerHighlights({ league }: { league: League }) {
  const teams = new Map(league.teams.map(team => [team.id, team]));
  const players = league.players.filter(player => teams.has(player.teamId));
  const named = [
    players.find(player => /\bCARON\b/i.test(player.name) && /JOHN\s+DEXTER/i.test(player.name)),
    players.find(player => /\bHINAY\b/i.test(player.name) && /\bRYAN\b/i.test(player.name)),
  ].filter((player): player is Player => Boolean(player));
  const others = players.filter(player => !named.some(featured => featured.id === player.id))
    .sort((a, b) => Number(Boolean(b.photo)) - Number(Boolean(a.photo)) || selectionKey(a.id) - selectionKey(b.id) || a.id.localeCompare(b.id));
  const featured = [...named, ...others].slice(0, 3);
  if (!featured.length) return null;

  return <section className="home-player-highlights" aria-labelledby="player-highlights-title">
    <div className="home-player-highlights-heading"><div><span className="eyebrow">FACES OF THE LEAGUE</span><h2 id="player-highlights-title">Player spotlight</h2><p>Meet the players representing our community.</p></div><Link href="/players">Meet all players <ArrowRight size={16} /></Link></div>
    <div className="home-player-highlights-grid">{featured.map(player => {
      const team = teams.get(player.teamId)!;
      const picture = player.photo || team.logo;
      const [surname, ...givenNames] = player.name.split(",");
      return <Link className="home-player-highlight" style={{ "--spotlight-team": team.color || "#687fa4" } as CSSProperties} key={player.id} href={`/players?division=${team.division}&player=${player.id}`} aria-label={`View ${player.name} player profile`}>
        <div className={`home-player-highlight-picture ${player.photo ? "has-portrait" : "has-crest"}`}>
          {team.logo && <img className="home-player-highlight-backdrop" {...imageSources(team.logo, "320px")} alt="" loading="lazy" decoding="async" />}
          <div className="home-player-highlight-badges"><span>{team.division === "Senior" ? "Open" : team.division} division</span>{player.number >= 0 && <b>#{player.number}</b>}</div>
          <div className="home-player-highlight-avatar">{picture ? <img {...imageSources(picture, "128px")} alt={player.photo ? player.name : `${team.name} team crest`} loading="lazy" decoding="async" /> : <UserRound size={48} aria-hidden="true" />}</div>
          {!player.photo && <span className="home-player-highlight-image-label">{team.logo ? "Team crest · Portrait coming soon" : "Portrait coming soon"}</span>}
        </div>
        <div className="home-player-highlight-copy"><p>{team.name}</p><h3><strong>{surname.trim()}</strong>{givenNames.length > 0 && <span>{givenNames.join(",").trim()}</span>}</h3><div className="home-player-highlight-footer"><span>View player profile</span><ArrowRight size={18} /></div></div>
      </Link>;
    })}</div>
  </section>;
}
