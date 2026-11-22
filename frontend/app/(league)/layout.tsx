import type { ReactNode } from "react";
import LeagueApp from "@/components/league-app";
import Maintenance from "@/components/maintenance";
import { maintenanceMode } from "@/lib/site-status";

export default function LeagueLayout({ children }: { children: ReactNode }) {
  if (maintenanceMode) return <Maintenance />;
  return <><LeagueApp />{children}</>;
}
