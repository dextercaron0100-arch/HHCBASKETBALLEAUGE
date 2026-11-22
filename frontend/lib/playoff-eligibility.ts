import type { Team } from "./types";

// Organizer decisions are scoped to the season and team, never a shared name.
const disqualifiedTeams: Record<string, readonly string[]> = {
  "d5b06005-7a52-4b64-a8ce-a719d6f801d9": [
    "e7587bfc-d094-43a2-bdf0-9bb7cca0d55c", // Junior Ibayo — organizer decision, November 22, 2026.
  ],
};

export function isPlayoffDisqualified(team?: Pick<Team, "id" | "seasonId">) {
  return !!team && (disqualifiedTeams[team.seasonId]?.includes(team.id) ?? false);
}
