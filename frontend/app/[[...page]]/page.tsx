import LeagueApp from "@/components/league-app";
import Maintenance from "@/components/maintenance";
import { maintenanceMode } from "@/lib/site-status";

export function generateMetadata() {
  return { title: maintenanceMode ? "Under maintenance · HHC Basketball League" : "HHC BASKETBALL LEAGUE · Every game. One community." };
}
export default async function Page({ searchParams }: {
  searchParams: Promise<{ division?: string | string[]; team?: string | string[] }>;
}) {
  if (maintenanceMode) return <Maintenance />;
  const params = await searchParams;
  return <LeagueApp initialDivision={params.division === "Senior" ? "Senior" : "Junior"} initialTeam={typeof params.team === "string" ? params.team : ""} />;
}
