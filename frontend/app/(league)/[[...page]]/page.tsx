import { maintenanceMode } from "@/lib/site-status";

export function generateMetadata() {
  return { title: maintenanceMode ? "Under maintenance · HHC Basketball League" : "HHC BASKETBALL LEAGUE · Every game. One community." };
}
export function generateStaticParams() {
  return [[], ["schedule"], ["news"], ["standings"], ["playoffs"], ["teams"], ["players"], ["statistics"], ["live"], ["admin"], ["manager"], ["scorekeeper"], ["login"]].map(page => ({ page }));
}

export default function Page() {
  return null;
}
