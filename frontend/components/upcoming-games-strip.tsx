"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { divisionLabel } from "@/lib/divisions";
import { imageSources } from "@/lib/images";
import type { League } from "@/lib/types";

export default function UpcomingGamesStrip({ league }: { league: League }) {
  const track = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState({ back: false, next: false });
  const games = league.games.filter(g => g.status === "Scheduled" && g.start && Date.parse(g.start) >= Date.now())
    .sort((a, b) => Date.parse(a.start!) - Date.parse(b.start!)).slice(0, 12);
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const update = () => setScrollable({ back: element.scrollLeft > 2, next: element.scrollLeft + element.clientWidth < element.scrollWidth - 2 });
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => { observer.disconnect(); element.removeEventListener("scroll", update); };
  }, [league.games]);
  if (!games.length) return null;
  let previousDay = "";
  return <section className="upcoming-strip" aria-label="Upcoming games">
    <div className="upcoming-strip-inner">
      <div className="upcoming-strip-toolbar">
        <h2><span className="upcoming-strip-dot" />UPCOMING GAMES</h2>
        <div><Link href="/schedule">Full schedule <ArrowUpRight size={13} /></Link><button type="button" aria-label="Previous upcoming games" disabled={!scrollable.back} onClick={() => track.current?.scrollBy({ left: -460, behavior: "smooth" })}><ChevronLeft size={16} /></button><button type="button" aria-label="Next upcoming games" disabled={!scrollable.next} onClick={() => track.current?.scrollBy({ left: 460, behavior: "smooth" })}><ChevronRight size={16} /></button></div>
      </div>
      <div ref={track} className="upcoming-strip-track" tabIndex={0} aria-label="Scroll upcoming matchups">
        {games.map(game => {
          const timezone = league.seasons.find(s => s.id === game.seasonId)?.timezone || "Asia/Manila";
          const date = new Date(game.start!);
          const day = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone }).format(date);
          const showDay = previousDay !== day;
          previousDay = day;
          const time = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(date);
          const dateLabel = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: timezone }).format(date);
          return <div className="upcoming-strip-item" key={game.id}>
            {showDay && <div className="upcoming-strip-date"><span>{new Intl.DateTimeFormat("en-PH", { weekday: "short", timeZone: timezone }).format(date)}</span><strong>{new Intl.DateTimeFormat("en-PH", { day: "2-digit", timeZone: timezone }).format(date)}</strong><span>{new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: timezone }).format(date)}</span><small>PHT</small></div>}
            <Link className="upcoming-strip-game" href={`/live?game=${game.id}`} aria-label={`${dateLabel}, ${time}: ${league.teams.find(t => t.id === game.homeId)?.name || "TBD"} vs ${league.teams.find(t => t.id === game.awayId)?.name || "TBD"}, ${divisionLabel(game.division)}`}>
              <div className="upcoming-strip-tipoff"><time dateTime={game.start!}>{time} <span>PHT</span></time><span>{divisionLabel(game.division)}</span></div>
              {[game.homeId, game.awayId].map(id => {
                const team = league.teams.find(t => t.id === id);
                return <div className="upcoming-strip-team" key={id}>{team?.logo ? <img {...imageSources(team.logo, "24px")} alt="" loading="lazy" decoding="async" /> : <span className="upcoming-strip-monogram" aria-hidden="true">{team?.name.slice(0, 2) || "?"}</span>}<strong title={team?.name}>{team?.name || "TBD"}</strong><span aria-hidden="true">—</span></div>;
              })}
              <div className="upcoming-strip-footer"><span>{game.stage === "Group" ? `Group ${game.group}` : game.stage}</span><span>View matchup <ArrowUpRight size={11} /></span></div>
            </Link>
          </div>;
        })}
      </div>
    </div>
  </section>;
}
