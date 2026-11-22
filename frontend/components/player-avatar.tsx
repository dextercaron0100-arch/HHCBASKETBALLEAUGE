import { UserRound } from "lucide-react";
import type { Player } from "@/lib/types";
import { imageSources } from "@/lib/images";

export default function PlayerAvatar({ player }: { player: Player }) {
  return <span className="player-directory-avatar">{player.photo
    ? <img {...imageSources(player.photo, "160px")} alt="" loading="lazy" decoding="async" />
    : <><UserRound size={30} aria-hidden="true" /><b>{player.number >= 0 ? `#${String(player.number).padStart(2, "0")}` : ""}</b></>}</span>;
}
