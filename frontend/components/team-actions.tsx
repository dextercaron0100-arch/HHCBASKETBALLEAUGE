"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, Check, Share2, Star } from "lucide-react";
import type { Team } from "@/lib/types";
import { useFollowedTeams } from "@/lib/followed-teams";
import { teamLink } from "./fan-hub";

export default function TeamActions({ team }: { team: Team }) {
  const { ids, ready, persistent, toggle } = useFollowedTeams();
  const [message, setMessage] = useState("");
  const [manualLink, setManualLink] = useState("");
  const following = ids.includes(team.id);
  const share = async () => {
    const url = new URL(teamLink(team), window.location.origin).href;
    setManualLink(""); setMessage("");
    if (navigator.share) {
      try { await navigator.share({ title: `${team.name} · HHC Basketball League`, url }); return; }
      catch (error) { if ((error as Error).name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); setMessage("Team link copied. Send it to your friends."); }
    catch { setManualLink(url); setMessage("Copy this team link to share the roster."); }
  };
  return <div className="team-actions-wrap"><div className="team-actions">
    <button disabled={!ready} aria-pressed={following} onClick={() => { toggle(team.id); setMessage(""); }}><Star size={17} fill={following ? "currentColor" : "none"} />{following ? "Following team" : "Follow team"}{following && <Check size={14} />}</button>
    <Link href={`/schedule?division=${team.division}&team=${team.id}`}><CalendarDays size={17} />Team schedule</Link>
    <button onClick={share}><Share2 size={17} />Share team</button>
  </div><p className="team-actions-note" role="status">{message || (following ? persistent ? "Following on this device. Your team now appears on the home page." : "Following for this visit. Browser storage is unavailable." : "Follow this team to see its record and next game on your home page.")}</p>{manualLink && <input aria-label="Team link to copy" readOnly value={manualLink} onFocus={event => event.target.select()} />}</div>;
}
