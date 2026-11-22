"use client";
import { divisionLabel } from "@/lib/divisions";
import { hasOfficialResult } from "@/lib/results";
import { isPlayoffDisqualified } from "@/lib/playoff-eligibility";
import { Suspense, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { usePracticeLeague } from "@/lib/practice-session";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  ChevronRight,
  ChevronLeft,
  CircleDot,
  CheckCircle2,
  Home,
  ImageIcon,
  LayoutGrid,
  List,
  MapPin,
  Radio,
  ShieldCheck,
  Search,
  Trophy,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import { Button } from "./ui/button";
import { useGameClock } from "@/lib/clock";
import { api, dateTime, hubUrl } from "@/lib/api";
import type {
  Game,
  League,
  Leader,
  Player,
  Standing,
  Team,
  User,
} from "@/lib/types";
import Schedule from "./schedule";
import LeagueNavigation from "./league-navigation";
import ChampionshipBracket from "./championship-bracket";
import EliminationRules from "./elimination-rules";
import HeroCarousel from "./hero-carousel";
import LoadingShell from "./loading-shell";
import Maintenance from "./maintenance";
import MediaLightbox from "./media-lightbox";
import Playoffs from "./playoffs";
import FanHub from "./fan-hub";
import TeamActions from "./team-actions";
import { fetchPublicLeague, recentLeague } from "@/lib/public-league";
import { backgroundImageSource, imageSources } from "@/lib/images";
import UpcomingGamesStrip from "./upcoming-games-strip";
import Players from "./players";
import HomePlayerHighlights from "./home-player-highlights";

const Admin = dynamic(() => import("./admin"), { loading: LoadingShell });
const Manager = dynamic(() => import("./manager"), { loading: LoadingShell });
const Scorekeeper = dynamic(() => import("./scorekeeper"), { loading: LoadingShell });

function RouteParameters({ onChange }: { onChange: (division: string | null, team: string, player: string) => void }) {
  const path = usePathname();
  const params = useSearchParams();
  const division = params.get("division");
  const team = params.get("team") ?? "";
  const player = params.get("player") ?? "";
  useEffect(() => onChange(division, team, player), [path, division, team, player, onChange]);
  return null;
}

const navigation = [
  { href: "/", label: "Overview", icon: Home },
  { href: "/schedule", label: "Schedule & results", icon: CalendarDays },
  { href: "/live", label: "Live scoreboard", icon: Radio },
  { href: "/standings", label: "Standings & bracket", icon: Trophy },
  { href: "/playoffs", label: "Playoffs", icon: Trophy },
  { href: "/teams", label: "Teams & players", icon: Users },
  { href: "/players", label: "Players & stats", icon: Activity },
  { href: "/statistics", label: "Statistics & awards", icon: Activity },
  { href: "/news", label: "News & media", icon: ImageIcon },
];
export default function LeagueApp() {
  const path = usePathname();
  const [league, setLeague] = useState<League | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [division, setDivision] = useState("Junior");
  const [initialTeam, setInitialTeam] = useState("");
  const [initialPlayer, setInitialPlayer] = useState("");
  const syncRouteParameters = useCallback((nextDivision: string | null, team: string, player: string) => {
    if (nextDivision === "Junior" || nextDivision === "Senior") setDivision(nextDivision);
    setInitialTeam(team);
    setInitialPlayer(player);
  }, []);
  const [season, setSeason] = useState("");
  const reload = useCallback(async () => {
    try {
      const data = await fetchPublicLeague();
      startTransition(() => {
        setLeague(current => current?.revision === data.revision ? current : data);
        setSeason((value) => value || data.seasons[0]?.id || "");
      });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally { setRefreshing(false); }
  }, []);
  const refreshUser = useCallback(
    () =>
      api<User>("/auth/me")
        .then(setUser)
        .catch(() => setUser(null)),
    [],
  );
  useEffect(() => {
    const recent = recentLeague();
    if (recent) {
      setLeague(recent);
      setSeason(value => value || recent.seasons[0]?.id || "");
      setRefreshing(true);
    }
    reload();
    refreshUser();
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
  }, [reload, refreshUser]);
  useEffect(() => {
    const disconnected = () => setOffline(true);
    const connected = () => { setOffline(false); reload(); refreshUser(); };
    setOffline(!navigator.onLine);
    window.addEventListener("offline", disconnected);
    window.addEventListener("online", connected);
    return () => { window.removeEventListener("offline", disconnected); window.removeEventListener("online", connected); };
  }, [reload, refreshUser]);
  useEffect(() => {
    const connection = new HubConnectionBuilder()
      .withUrl(hubUrl, { transport: 1 | 2 | 4 })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Error)
      .build();
    connection.on("LeagueChanged", reload);
    connection.onreconnected(reload);
    connection.start().catch(() => {});
    const refreshVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) reload();
    };
    const interval = setInterval(refreshVisible, 15000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisible);
      connection.stop().catch(() => {});
    };
  }, [reload]);
  const activeSeason = league?.seasons.find((s) => s.id === season);
  const view = useMemo(() => {
    if (!league) return null;
    const teams = league.teams.filter(t => t.seasonId === season);
    const teamIds = new Set(teams.map(t => t.id));
    return {
      ...league,
      seasons: league.seasons.filter((s) => s.id === season),
      teams,
      players: league.players.filter(p => teamIds.has(p.teamId)),
      games: league.games.filter((g) => g.seasonId === season),
    };
  }, [league, season]);
  if (error && !league && !offline) return <Maintenance onRetry={reload} />;
  return (
    <div className="app-shell horizontal-layout full-page-backgrounds" data-page={path}>
      <Suspense fallback={null}><RouteParameters onChange={syncRouteParameters} /></Suspense>
      <div className="league-page-background" aria-hidden="true" />
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <LeagueNavigation user={user} onLogout={() => setUser(null)} />
      {path === "/" && view && <UpcomingGamesStrip league={view} />}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            League hub <ChevronRight size={14} />
            <span>
              {navigation.find((n) => n.href === path)?.label ||
                (path === "/admin"
                  ? "Organizer dashboard"
                  : path === "/manager"
                    ? "My registrations"
                    : path === "/scorekeeper"
                      ? "Scorekeeping desk"
                      : "Account")}
            </span>
          </div>
          <div className="topbar-right">
            {league && league.seasons.length > 1 && (
              <select
                aria-label="Season"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
              >
                {league.seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.year}
                  </option>
                ))}
              </select>
            )}
            <span className="avatar">
              {user ? user.email.slice(0, 2).toUpperCase() : "HHC"}
            </span>
          </div>
        </header>
        <main id="main" key={path} className="main-content" tabIndex={-1} aria-busy={!league && !error}>
          {offline && <div className="connection-notice" role="status"><Radio size={16} /><span>You’re offline. Scores and schedules will refresh when you reconnect.</span></div>}
          {refreshing && !offline && <div className="connection-notice" role="status"><Radio size={16} /><span>Showing recently loaded league data. Refreshing the latest updates…</span></div>}
          {error && !offline && (
            <div className="connection-notice" role="status">
              <span>Connection interrupted. Showing the last loaded league data. Scores and schedules may be outdated. Retrying automatically.</span>
              <Button variant="outline" size="sm" onClick={reload}>
                Retry
              </Button>
            </div>
          )}
          {!league && !error && (
            <LoadingShell />
          )}
          {view &&
            (path === "/" ? (
              <Overview
                league={view}
                division={division}
                setDivision={setDivision}
              />
            ) : path === "/schedule" ? (
              <Schedule
                league={view}
                division={division}
                setDivision={setDivision}
                initialTeam={initialTeam}
              />
            ) : path === "/standings" ? (
              <Standings
                league={view}
                season={season}
                division={division}
                setDivision={setDivision}
              />
            ) : path === "/playoffs" ? (
              <Playoffs league={view} division={division} setDivision={setDivision} />
            ) : path === "/teams" ? (
              <Teams
                league={view}
                division={division}
                setDivision={setDivision}
                initialTeam={initialTeam}
              />
            ) : path === "/players" ? (
              <Players league={view} division={division} setDivision={setDivision} initialPlayer={initialPlayer} />
            ) : path === "/statistics" ? (
              <Statistics
                league={view}
                season={season}
                division={division}
                setDivision={setDivision}
              />
            ) : path === "/news" ? (
              <News league={view} />
            ) : path === "/live" ? (
              <Live league={league!} user={user} />
            ) : path === "/admin" ? (
              <Admin user={user} reload={reload} />
            ) : path === "/manager" ? (
              <Manager user={user} league={view} />
            ) : path === "/scorekeeper" ? (
              <Scorekeeper user={user} league={league!} />
            ) : path === "/login" ? (
              <Login onLogin={refreshUser} user={user} />
            ) : (
              <Empty
                title="Page not found"
                description="Return to the league overview to find your home court."
              />
            ))}
        </main>
        <footer className="footer">
          <span>© {activeSeason?.year || 2026} HHC BASKETBALL LEAGUE</span>
          <span>Powered by <strong>Herrera Technologies</strong></span>
        </footer>
      </div>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function Divisions({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="segmented" aria-label="Division">
      {["Junior", "Senior"].map((d) => (
        <button
          aria-label={divisionLabel(d)}
          aria-pressed={value === d}
          className={value === d ? "selected" : ""}
          key={d}
          onClick={() => onChange(d)}
        >
          {divisionLabel(d)}
          <span>DIVISION</span>
        </button>
      ))}
    </div>
  );
}
export function Empty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <CircleDot size={32} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function TeamMark({
  team,
  size = "normal",
}: {
  team?: Team;
  size?: string;
}) {
  return (
    <span
      className={`team-mark ${size}`}
      style={
        { "--team-color": team?.color || "#ff763b" } as React.CSSProperties
      }
    >
      {team?.logo ? (
        <img {...imageSources(team.logo, size === "large" ? "(max-width: 760px) 50vw, (max-width: 1100px) 33vw, 320px" : "64px")} alt="" loading="lazy" decoding="async" />
      ) : (
        <span>
          {team?.name
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("") || "—"}
        </span>
      )}
    </span>
  );
}
export function GameCard({
  game,
  league,
  hideScores = false,
  showVenue = false,
}: {
  game: Game;
  league: League;
  hideScores?: boolean;
  showVenue?: boolean;
}) {
  const home = league.teams.find((t) => t.id === game.homeId);
  const away = league.teams.find((t) => t.id === game.awayId);
  const scored = ["Live", "Final", "Confirmed"].includes(game.status);
  const season = league.seasons.find((s) => s.id === game.seasonId);
  const court = season?.courts.find((c) => c.id === game.courtId);
  return (
    <Link
      href={`/live?game=${game.id}`}
      className={`game-card ${showVenue ? "schedule-game-card" : ""}`}
    >
      <div className="game-card-top">
        <span>
          {divisionLabel(game.division)}{" "}
          <span className="subtle">
            / {game.stage === "Group" ? `Group ${game.group}` : game.stage}
          </span>
        </span>
        <span
          className={`badge ${game.status === "Live" ? "badge-live" : hasOfficialResult(game) ? "badge-final" : ""}`}
        >
          {hasOfficialResult(game) ? "FINAL" : game.status.toUpperCase()}
        </span>
      </div>
      <div className="match-team">
        <TeamMark team={home} size="small" />
        <strong>{home?.name || "TBD"}</strong>
        <b
          aria-label={hideScores && scored ? "Score hidden" : undefined}
          className={hideScores && scored ? "hidden-score" : ""}
        >
          {scored ? (hideScores ? "••" : game.homeScore) : "—"}
        </b>
      </div>
      <div className="match-team">
        <TeamMark team={away} size="small" />
        <strong>{away?.name || "TBD"}</strong>
        <b
          aria-label={hideScores && scored ? "Score hidden" : undefined}
          className={hideScores && scored ? "hidden-score" : ""}
        >
          {scored ? (hideScores ? "••" : game.awayScore) : "—"}
        </b>
      </div>
      {showVenue && (
        <div className="game-venue">
          <MapPin size={13} />
          <span>{court?.venue || "Venue to be announced"}</span>
        </div>
      )}
      <div className="game-card-bottom">
        <CalendarDays size={13} />
        {game.status === "Live"
          ? `Q${game.quarter} · Live now`
          : <>{dateTime(game.start, season?.timezone || "Asia/Manila")}{game.start && game.durationMinutes && <> – {new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: season?.timezone || "Asia/Manila" }).format(new Date(Date.parse(game.start) + game.durationMinutes * 60000))}</>}</>}
        <span>{court?.name || "Court TBA"}</span>
      </div>
    </Link>
  );
}
function Overview({
  league,
  division,
  setDivision,
}: {
  league: League;
  division: string;
  setDivision: (d: string) => void;
}) {
  const games = league.games.filter((g) => g.division === division);
  const upcoming = league.games
    .filter((g) => g.status === "Scheduled" && g.start && new Date(g.start).getTime() >= Date.now())
    .sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime())
    .slice(0, 3);
  const recent = games.filter(hasOfficialResult).slice(-3);
  const live = league.games.filter((g) => g.status === "Live");
  return (
    <>
      <div className="overview-heading">
        <div>
          <span className="eyebrow">WELCOME TO YOUR HOME COURT</span>
          <h1>
            Game on. <span>Community first.</span>
          </h1>
          <p>Your teams. Your moments. Every basket, all in one place.</p>
        </div>
        <Divisions value={division} onChange={setDivision} />
      </div>
      <HeroCarousel>
        <div className="hero-content">
          <span className="hero-label">
            <span /> {league.seasons[0]?.name || "HHC BASKETBALL LEAGUE"} ·{" "}
            {league.seasons[0]?.year || 2026}
          </span>
          <h2>
            MORE THAN
            <br />A <em>GAME.</em>
          </h2>
          <p>
            Two divisions. {league.teams.length} teams.
            <br />
            One community that lives for basketball.
          </p>
          <div className="hero-actions">
            <Button asChild>
              <Link href="/standings">
                Explore the group brackets <ArrowRight size={17} />
              </Link>
            </Button>
            <Link href="/schedule" className="hero-text-link">
              See the schedule <ArrowDownRight size={17} />
            </Link>
          </div>
        </div>
      </HeroCarousel>
      <HomePlayerHighlights league={league} />
      <FanHub league={league} />
      <div className="metric-grid overview-metrics">
        {[
          {
            label: "Teams in the league",
            value: league.teams.length,
            detail: `${league.teams.filter(team => team.division === "Junior").length} Junior · ${league.teams.filter(team => team.division === "Senior").length} Open`,
            icon: UsersRound,
          },
          {
            label: "Games completed",
            value: league.games.filter(hasOfficialResult).length,
            detail: "Official, confirmed results",
            icon: CheckCircle2,
          },
          {
            label: "Registered players",
            value: league.players.length,
            detail: "Across Junior & Open divisions",
            icon: Users,
          },
          {
            label: "Live right now",
            value: live.length,
            detail: live.length
              ? "Follow the action"
              : upcoming[0]?.start ? `Next tip-off · ${dateTime(upcoming[0].start, league.seasons[0]?.timezone || "Asia/Manila")}` : "Next tip-off coming soon",
            icon: Radio,
          },
        ].map((m) => (
          <article className={`metric ${m.label === "Live right now" && live.length ? "is-live" : ""}`} key={m.label}>
            <div className="metric-top"><span className="metric-label">{m.label}</span><span className="metric-icon" aria-hidden="true"><m.icon size={21} strokeWidth={1.8} /></span></div>
            <strong className="metric-value">{m.value.toLocaleString("en-PH")}</strong>
            <div className="metric-footer"><span className="metric-indicator" aria-hidden="true" /><small>{m.detail}</small></div>
          </article>
        ))}
      </div>
      <nav className="league-shortcuts" aria-label="Explore the league">
        {[
          { href: "/standings", icon: Trophy, label: "The road to the title", detail: "Group brackets & standings" },
          { href: "/teams", icon: Users, label: "Meet your teams", detail: "Team profiles & player rosters" },
          { href: "/schedule", icon: CalendarDays, label: "Find your next game", detail: "Schedule & confirmed results" },
        ].map(item => <Link key={item.href} href={item.href}><span className="shortcut-icon" aria-hidden="true"><item.icon size={25} strokeWidth={1.8} /></span><span className="shortcut-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><span className="shortcut-arrow" aria-hidden="true"><ArrowRight size={17} /></span></Link>)}
      </nav>
      {live.length > 0 && (
        <section>
          <SectionTitle title="On the court now" href="/live" />
          <div className="games-grid">
            {live.slice(0, 3).map((g) => (
              <GameCard key={g.id} game={g} league={league} />
            ))}
          </div>
        </section>
      )}
      <section>
        <SectionTitle
          title="Next on the court"
          subtitle="Junior & Open divisions · Next 3 scheduled games"
          href="/schedule"
        />
        <div className="games-grid">
          {upcoming.map((g) => (
            <GameCard key={g.id} game={g} league={league} />
          ))}
        </div>
        {upcoming.length === 0 && (
          <Empty
            title="The next tip-off is coming"
            description="Scheduled games will appear here once organizers publish the calendar."
          />
        )}
      </section>
      <div className="overview-bottom">
        <section className="panel">
          <SectionTitle
            title="The standings"
            subtitle={`${divisionLabel(division)} · Group A`}
            href="/standings"
          />
          <StandingsTable
            league={league}
            season={league.seasons[0]?.id || ""}
            division={division}
            group="A"
            compact
          />
        </section>
        <section className="panel community-panel">
          <span className="eyebrow">AROUND THE LEAGUE</span>
          <h2>{league.posts[0]?.title || "Our court. Our community."}</h2>
          <p>
            {league.posts[0]?.body ||
              "Stay in the loop with official announcements, highlights, and stories from the league."}
          </p>
          <Link href="/news" className="text-link">
            Catch up on the news <ArrowRight size={16} />
          </Link>
          <div className="community-snapshot">
            <div className="community-snapshot-heading"><span className="community-snapshot-icon"><Trophy size={23} /></span><div><span className="eyebrow">THE CHAMPIONSHIP CHASE</span><h3>Two divisions. One goal.</h3></div></div>
            <div className="community-division-grid">
              {(["Junior", "Senior"] as const).map(value => <Link href={`/standings?division=${value}`} key={value} aria-label={`View ${divisionLabel(value)} standings`}><span>{divisionLabel(value)} division <ArrowRight size={13} /></span><strong>{league.teams.filter(team => team.division === value).length}<small>teams</small></strong><span className="community-qualifiers">{value === "Junior" ? "8 playoff spots · Top 2 + 2 wildcards" : "12 playoff spots · Top 3 per group"}</span></Link>)}
            </div>
            <div className="community-team-preview"><div className="community-team-marks" aria-hidden="true">{league.teams.filter(team => team.division === division).slice(0, 6).map(team => <TeamMark key={team.id} team={team} size="tiny" />)}</div><Link href={`/teams?division=${division}`}>Meet the {divisionLabel(division)} teams <ArrowRight size={14} /></Link></div>
            <Link href={`/playoffs?division=${division}`} className="community-playoffs-link"><span><Trophy size={17} /> Follow the road to the trophy</span><ArrowRight size={17} /></Link>
            <span className="community-signoff">LOCAL TEAMS. BIG HEART.</span>
          </div>
        </section>
      </div>
      {recent.length > 0 && (
        <section>
          <SectionTitle
            title="Final buzzer"
            subtitle="The latest confirmed results"
            href="/schedule"
          />
          <div className="games-grid">
            {recent.map((g) => (
              <GameCard key={g.id} game={g} league={league} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
function SectionTitle({
  title,
  subtitle,
  href,
}: {
  title: string;
  subtitle?: string;
  href?: string;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="text-link">
          View all <ArrowRight size={15} />
        </Link>
      )}
    </div>
  );
}
function Standings({
  league,
  season,
  division,
  setDivision,
}: {
  league: League;
  season: string;
  division: string;
  setDivision: (d: string) => void;
}) {
  const [group, setGroup] = useState("A");
  const groupSizes = league.seasons.find(s => s.id === season)?.groupSizes?.[division] ?? [6, 6];
  const groups = groupSizes.map((_, index) => String.fromCharCode(65 + index));
  const activeGroup = groups.includes(group) ? group : "A";
  const qualifyingPlaces = division === "Senior" && groupSizes.join(",") === "4,4,4,4" ? 3 : division === "Junior" && groupSizes.join(",") === "4,4,4" ? 2 : groups.length === 2 ? 4 : 0;
  return (
    <>
      <PageHeading
        eyebrow="THE ROAD TO THE TITLE"
        title="Standings & bracket"
        description="Follow the group race and every step toward the championship."
      >
        <Divisions value={division} onChange={setDivision} />
      </PageHeading>
      <a className="standings-rules-jump" href="#elimination-format"><ShieldCheck size={16} aria-hidden="true" />How do eliminations work?<ArrowRight size={15} aria-hidden="true" /></a>
      <ChampionshipBracket
        division={divisionLabel(division)}
        teams={league.teams.filter(team => team.seasonId === season && team.division === division)}
        players={league.players}
        groupSizes={groupSizes}
        selectedGroup={activeGroup}
        onSelectGroup={group => {
          setGroup(group);
          requestAnimationFrame(() => document.getElementById("division-standings")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }));
        }}
      />
      <div className="panel division-standings" id="division-standings">
        <div className="section-title">
          <div className="tabs">
            {groups.map((g) => (
              <button
                key={g}
                className={activeGroup === g ? "active" : ""}
                onClick={() => setGroup(g)}
              >
                Group {g}
              </button>
            ))}
          </div>
          <span className="badge">{division === "Junior" && groupSizes.join(",") === "4,4,4" ? "TOP 2 + WILDCARDS" : qualifyingPlaces ? `TOP ${qualifyingPlaces} ADVANCE` : "GROUP STAGE"}</span>
        </div>
        <StandingsTable
          league={league}
          season={season}
          division={division}
          group={activeGroup}
        />
        <p className="table-note">
          {qualifyingPlaces ? <><span className="qualification-dot" /> {division === "Junior" ? `Top ${qualifyingPlaces} per group qualify only with fewer than three confirmed losses. ` : `Top ${qualifyingPlaces} per group qualify. `}{qualifyingPlaces === 3 ? "Group winners receive quarterfinal byes. " : ""}Final seeding follows confirmed results and resolved ties.</> : "Playoff qualification will be announced after the group-stage format is confirmed."}
        </p>
        {division === "Junior" && groupSizes.join(",") === "4,4,4" && <p className="table-note"><strong>Junior wildcards:</strong> The two best third-place teams across Brackets A, B and C qualify, ranked by confirmed wins, point difference, then points scored. Unresolved ties require an organizer decision. Eight teams advance to the quarterfinals.</p>}
        {division === "Junior" && <p className="table-note"><strong>Junior three-loss rule:</strong> Three confirmed group-stage losses mean automatic elimination from playoff contention, including wildcard contention.</p>}
      </div>
      <EliminationRules division={division} season={league.seasons.find(s => s.id === season)} />
    </>
  );
}
function StandingsTable({
  league,
  season,
  division,
  group,
  compact = false,
}: {
  league: League;
  season: string;
  division: string;
  group: string;
  compact?: boolean;
}) {
  const [rows, setRows] = useState<Standing[]>([]);
  const [wildcardRows, setWildcardRows] = useState<Standing[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const sizes = league.seasons.find(s => s.id === season)?.groupSizes?.[division] ?? [6, 6];
  const juniorWildcards = division === "Junior" && sizes.join(",") === "4,4,4";
  const qualifyingPlaces = division === "Senior" && sizes.join(",") === "4,4,4,4" ? 3 : division === "Junior" && sizes.join(",") === "4,4,4" ? 2 : sizes.length === 2 ? 4 : 0;
  const groupSize = league.seasons.find(s => s.id === season)?.groupSizes?.[division]?.[group.charCodeAt(0) - 65] ?? 6;
  const groupGames = league.games.filter(game => game.seasonId === season && game.division === division && game.group === group && game.stage === "Group" && game.status !== "Cancelled");
  const groupComplete = groupGames.length === groupSize * (groupSize - 1) / 2 && groupGames.every(hasOfficialResult);
  const hasResults = league.games.some(game => game.seasonId === season && game.division === division && game.group === group && game.stage === "Group" && hasOfficialResult(game));
  const divisionGroupGames = league.games.filter(game => game.seasonId === season && game.division === division && game.stage === "Group" && game.status !== "Cancelled");
  const divisionComplete = divisionGroupGames.length === 18 && divisionGroupGames.every(hasOfficialResult);
  const rowStatus = (row: Standing, index: number) => {
    if (isPlayoffDisqualified(league.teams.find(team => team.id === row.teamId))) return "DISQUALIFIED";
    if (!hasResults) return "NOT STARTED";
    if (division === "Junior" && row.losses >= 3) return "ELIMINATED";
    if (row.unresolved) return "TIE REVIEW";
    if (qualifyingPlaces > 0 && index < qualifyingPlaces) return groupComplete ? qualifyingPlaces === 3 && index === 0 ? "QF BYE" : "QUALIFIED" : `TOP ${qualifyingPlaces}`;
    if (juniorWildcards && index === 2) {
      if (!divisionComplete) return "WILDCARD RACE";
      if (wildcardRows.some(candidate => candidate.unresolved)) return "TIE REVIEW";
      const rank = wildcardRows.findIndex(candidate => candidate.teamId === row.teamId);
      return rank >= 0 && rank < 2 ? "WILDCARD QUALIFIED" : "ELIMINATED";
    }
    return groupComplete && qualifyingPlaces > 0 ? "ELIMINATED" : "IN THE RACE";
  };
  useEffect(() => {
    if (!season) return;
    let current = true;
    setLoading(true);
    setError("");
    setRows([]);
    setWildcardRows([]);
    Promise.all([
      api<Standing[]>(`/standings/${season}/${division}/${group}`),
      juniorWildcards ? api<Standing[]>(`/standings/${season}/${division}/Wildcards`) : Promise.resolve([] as Standing[]),
    ])
      .then(([r, wildcardRanks]) => {
        if (!current) return;
        setRows(r);
        setWildcardRows(wildcardRanks);
        setError("");
      })
      .catch((e) => { if (current) setError(e.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [season, division, group, league.revision, juniorWildcards]);
  return (
    <>
      {error && <p className="error">{error}</p>}
      <div className={`table-wrap standings-table-wrap ${compact ? "is-compact" : ""}`} aria-busy={loading}>
        <table>
          <caption className="sr-only">{divisionLabel(division)} division, Group {group} standings</caption>
          <thead>
            <tr>
              <th>#</th>
              <th>TEAM</th>
              {!compact && <th>GP</th>}
              <th>W</th>
              <th>L</th>
              {!compact && <><th>PF</th><th>PA</th></>}
              <th>DIFF</th>
              {!compact && <th>STATUS</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.teamId}>
                <td>
                  <span className={`rank ${["QUALIFIED", "WILDCARD QUALIFIED"].includes(rowStatus(row, i)) || rowStatus(row, i).startsWith("TOP ") ? "qualified" : ""}`}>
                    {i + 1}
                  </span>
                </td>
                <td>
                  <Link className="table-team" href={`/teams?division=${division}&team=${row.teamId}#team-roster`}>
                    <TeamMark
                      team={league.teams.find((t) => t.id === row.teamId)}
                      size="tiny"
                    />
                    {row.name}
                  </Link>
                </td>
                {!compact && <td>{row.wins + row.losses}</td>}
                <td className="table-number">{row.wins}</td>
                <td>{row.losses}</td>
                {!compact && <><td>{row.pointsFor}</td><td>{row.pointsAgainst}</td></>}
                <td className={row.difference >= 0 ? "positive" : "subtle"}>
                  {row.difference > 0 ? "+" : ""}
                  {row.difference}
                </td>
                {!compact && (
                  <td>
                    <span
                      className={`badge ${rowStatus(row, i) === "TIE REVIEW" ? "badge-demo" : ["QUALIFIED", "WILDCARD QUALIFIED"].includes(rowStatus(row, i)) || rowStatus(row, i).startsWith("TOP ") ? "badge-qualified" : ""}`}
                    >
                      {rowStatus(row, i)}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && <div className="standings-loading" role="status"><span className="standings-loading-bar" />Loading Group {group} standings…</div>}
      {!compact && !loading && rows.length > 0 && <div className="standings-key"><span><b>GP</b> Played</span><span><b>W / L</b> Wins / losses</span><span><b>PF / PA</b> Points for / against</span><span><b>DIFF</b> Point difference</span></div>}
      {rows.length === 0 && !error && !loading && (
        <Empty
          title="Standings start here"
          description="Approved teams will appear when the league opens."
        />
      )}
    </>
  );
}
function Teams({
  league,
  division,
  setDivision,
  initialTeam = "",
}: {
  league: League;
  division: string;
  setDivision: (d: string) => void;
  initialTeam?: string;
}) {
  const [selected, setSelected] = useState<Team | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("All");
  const [directoryView, setDirectoryView] = useState<"grid" | "list">("grid");
  const teamButtons = useRef(new Map<string, HTMLButtonElement>());
  const rosterRef = useRef<HTMLElement>(null);
  const directoryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { if (localStorage.getItem("hhc-team-directory-view") === "list") setDirectoryView("list"); } catch {}
  }, []);
  function chooseDirectoryView(value: "grid" | "list") {
    setDirectoryView(value);
    try { localStorage.setItem("hhc-team-directory-view", value); } catch {}
  }
  function closeRoster() {
    const button = selected ? teamButtons.current.get(selected.id) : undefined;
    setSelected(null);
    setPlayer(null);
    requestAnimationFrame(() => button?.focus());
  }
  const openedLink = useRef("");
  const divisionTeams = league.teams.filter(team => team.division === division);
  const configuredSizes = league.seasons.find(s => s.id === divisionTeams[0]?.seasonId)?.groupSizes?.[division];
  const slotCount = Math.max(configuredSizes?.reduce((sum, size) => sum + size, 0) ?? 12, divisionTeams.length);
  const slots: (Team | undefined)[] = Array(slotCount).fill(undefined);
  for (const team of divisionTeams.filter(team => team.slot && team.slot >= 1 && team.slot <= slotCount)) slots[team.slot! - 1] = team;
  for (const team of divisionTeams.filter(team => !team.slot || team.slot > slotCount)) {
    const index = slots.findIndex(slot => !slot);
    if (index >= 0) slots[index] = team;
  }
  const search = query.trim().toLocaleLowerCase();
  const filtering = Boolean(search) || groupFilter !== "All";
  const matches = (team: Team) => (groupFilter === "All" || team.group === groupFilter) &&
    [team.name, team.coach, team.assistantCoach ?? "", ...league.players.filter(p => p.teamId === team.id).map(p => p.name)].some(value => value.toLocaleLowerCase().includes(search));
  const matchingTeams = divisionTeams.filter(matches);
  const groups = Array.from(new Set(divisionTeams.map(team => team.group).filter(group => group !== "Unassigned"))).sort();
  useEffect(() => {
    openedLink.current = "";
    setSelected(null);
    setPlayer(null);
    setQuery("");
    setGroupFilter("All");
  }, [division]);
  useEffect(() => {
    const key = `${division}:${initialTeam}`;
    if (!initialTeam || openedLink.current === key) return;
    const team = league.teams.find(team => team.id === initialTeam && team.division === division);
    if (team) { openedLink.current = key; setSelected(team); }
  }, [division, initialTeam, league.teams]);
  useEffect(() => {
    if (!selected) return;
    const frame = requestAnimationFrame(() => {
      rosterRef.current?.focus({ preventScroll: true });
      rosterRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected?.id]);
  return (
    <div className="teams-page" ref={directoryRef} tabIndex={-1}>
      {selected && <button type="button" className="teams-back-to-top" aria-label="Back to top of teams page" title="Back to top" onClick={() => {
        directoryRef.current?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      }}><ArrowUp size={23} strokeWidth={2.2} aria-hidden="true" /></button>}
      {selected?.logo && createPortal(
        <div className="selected-team-background" aria-hidden="true">
          <img key={selected.id} src={backgroundImageSource(selected.logo)} alt="" decoding="async" />
        </div>,
        document.body,
      )}
      <PageHeading
        eyebrow="MEET YOUR COMMUNITY"
        title="Teams & players"
        description="The people behind the jersey. The teams behind every game."
      >
        <Divisions value={division} onChange={setDivision} />
      </PageHeading>
      <div className="team-directory-overview"><div><span className="eyebrow">FIND YOUR TEAM</span><h2>{divisionLabel(division)} division</h2><p>Explore the rosters. Follow your favorites.</p></div><div className="team-directory-counts"><span><b>{divisionTeams.length}</b> Teams</span><span><b>{league.players.filter(player => divisionTeams.some(team => team.id === player.teamId)).length}</b> Players</span><span><b>{groups.length}</b> Groups</span></div></div>
      <div className="team-directory-toolbar">
        <label className="team-search"><Search size={19} aria-hidden="true" /><input aria-label="Search teams, coaches or players" type="search" placeholder="Search teams, coaches or players…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="team-group-filters" role="group" aria-label="Filter teams by group">
          {["All", ...groups].map(group => <button key={group} type="button" aria-pressed={groupFilter === group} onClick={() => setGroupFilter(group)}>{group === "All" ? "All teams" : `Group ${group}`}</button>)}
        </div>
      </div>
      <div className="team-directory-viewbar"><p className="team-search-results" role="status">{matchingTeams.length} {matchingTeams.length === 1 ? "team" : "teams"}{filtering ? " found" : " to discover"}{filtering && <button onClick={() => { setQuery(""); setGroupFilter("All"); }}>Clear filters</button>}</p><div className="team-view-switch" role="group" aria-label="Team directory view"><button type="button" aria-label="Grid view" aria-pressed={directoryView === "grid"} onClick={() => chooseDirectoryView("grid")}><LayoutGrid size={16} />Grid</button><button type="button" aria-label="List view" aria-pressed={directoryView === "list"} onClick={() => chooseDirectoryView("list")}><List size={17} />List</button></div></div>
      <div className={`team-grid ${directoryView === "list" ? "team-list" : ""}`}>
        {slots.map((t, index) => t ? (!matches(t) ? null : (
            <button
              className={`team-profile-card ${selected?.id === t.id ? "selected" : ""}`}
              aria-pressed={selected?.id === t.id}
              onClick={() => {
                setSelected(t);
                setPlayer(null);
              }}
              key={t.id}
              ref={node => { if (node) teamButtons.current.set(t.id, node); else teamButtons.current.delete(t.id); }}
              data-slot={index + 1}
            >
              <span className="team-logo-box">
                <TeamMark team={t} size="large" />
              </span>
              <div className="team-profile-details">
                <span className="team-card-kicker">{t.group === "Unassigned" ? "Group draw pending" : `Group ${t.group}`} <span>·</span> {league.players.filter(p => p.teamId === t.id).length} players</span>
                <h3>{t.name}</h3>
                <p>{t.coach || "Coach to be announced"}</p>
                {t.assistantCoach && <p>Assistant coach: {t.assistantCoach}</p>}
                <span className="text-link">Meet the roster <ArrowRight size={15} /></span>
              </div>
            </button>
          )) : filtering ? null : <div className="team-profile-card team-slot-empty" data-slot={index + 1} key={`empty-${index}`}><span className="team-logo-box"><Users size={40} /></span><div className="team-profile-details"><h3>Available slot</h3><p>Team to be announced</p></div></div>)}
      </div>
      {filtering && matchingTeams.length === 0 && <Empty title="No teams found" description="Try another team, coach or player name, or clear the group filter." />}
      {selected && (
        <section id="team-roster" className="panel roster-panel" ref={rosterRef} tabIndex={-1} aria-label={`${selected.name} roster`}>
          <button className="roster-close" aria-label="Close team roster" onClick={closeRoster}><X size={20} /></button>
          <SectionTitle
            title={selected.name}
            subtitle={`${divisionLabel(selected.division)} · ${selected.group === "Unassigned" ? "Group draw pending" : `Group ${selected.group}`}${selected.coach ? ` · Head coach: ${selected.coach}` : ""}${selected.assistantCoach ? ` · Assistant coach: ${selected.assistantCoach}` : ""}`}
          />
          <TeamActions key={selected.id} team={selected} />
          <div className="roster-grid">
            {league.players
              .filter((p) => p.teamId === selected.id)
              .map((p) => (
                <button
                  key={p.id}
                  className="player-card"
                  onClick={() => setPlayer(p)}
                >
                  {p.photo ? (
                    <img src={p.photo} alt={p.name} />
                  ) : (
                    <span className="player-number">
                      {p.number >= 0 ? p.number.toString().padStart(2, "0") : <Users size={32} />}
                    </span>
                  )}
                  <strong>{p.name}</strong>
                  {p.rosterRole && <span className="roster-role">{p.rosterRole}</span>}
                  <span className="muted">
                    {[p.number >= 0 ? `#${p.number}` : "", p.position].filter(Boolean).join(" · ") || "Player"}
                  </span>
                </button>
              ))}
          </div>
          {!league.players.some(player => player.teamId === selected.id) && <Empty title="Roster coming soon" description="Player details will appear once the team roster is registered and approved." />}
          {player && <PlayerDetail player={player} league={league} />}
          <div className="record-strip">
            {
              league.games
                .filter(
                  (g) =>
                    hasOfficialResult(g) &&
                    (g.homeId === selected.id || g.awayId === selected.id),
                )
                .reduce(
                  (r, g) => {
                    const won =
                      g.homeId === selected.id
                        ? g.homeScore > g.awayScore
                        : g.awayScore > g.homeScore;
                    return {
                      wins: r.wins + (won ? 1 : 0),
                      losses: r.losses + (won ? 0 : 1),
                    };
                  },
                  { wins: 0, losses: 0 },
                ).wins
            }{" "}
            wins ·{" "}
            {
              league.games
                .filter(
                  (g) =>
                    hasOfficialResult(g) &&
                    (g.homeId === selected.id || g.awayId === selected.id),
                )
                .filter((g) =>
                  g.homeId === selected.id
                    ? g.homeScore < g.awayScore
                    : g.awayScore < g.homeScore,
                ).length
            }{" "}
            losses · Confirmed results
          </div>
        </section>
      )}
    </div>
  );
}
function PlayerDetail({ player, league }: { player: Player; league: League }) {
  const appearances = league.games.filter(
    (g) => g.status === "Confirmed" && g.roster.includes(player.id),
  );
  const totals = appearances.reduce(
    (sum, g) => {
      const s = g.stats[player.id];
      if (s)
        Object.keys(sum).forEach(
          (key) => (sum[key as keyof typeof sum] += s[key as keyof typeof sum]),
        );
      return sum;
    },
    { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fouls: 0 },
  );
  return (
    <div className="player-detail">
      <h3>
        {player.name}{player.number >= 0 ? ` · #${player.number}` : ""}
      </h3>
      {player.rosterRole && <p className="roster-role">{player.rosterRole}</p>}
      <p className="muted">
        {appearances.length} games played · Approved roster
      </p>
      <div className="stat-chips">
        {Object.entries(totals).map(([key, value]) => (
          <div key={key}>
            <strong>{value}</strong>
            <span>{key}</span>
          </div>
        ))}
      </div>
      <Link href={`/players?division=${league.teams.find(t => t.id === player.teamId)?.division || "Junior"}&player=${player.id}`} className="text-link">View player profile & game log <ArrowRight size={14} /></Link>
    </div>
  );
}
function Statistics({
  league,
  season,
  division,
  setDivision,
}: {
  league: League;
  season: string;
  division: string;
  setDivision: (d: string) => void;
}) {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [sort, setSort] = useState<keyof Leader>("ppg");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ key: "", page: 1 });
  const tableHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setPagination({ key: "", page: 1 }); }, [season, division, sort]);
  useEffect(() => {
    if (!season) return;
    let current = true;
    setLoading(true);
    setLeaders([]);
    setError("");
    api<Leader[]>(`/leaders/${season}/${division}`)
      .then(data => { if (current) { setLeaders(data); setPagination(previous => ({ ...previous, page: Math.min(previous.page, Math.max(1, Math.ceil(data.length / 20))) })); } })
      .catch((e) => { if (current) setError(e.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [season, division, league.revision]);
  const sorted = [...leaders].sort((a, b) => Number(b[sort]) - Number(a[sort]));
  const pageKey = `${season}:${division}:${sort}`;
  const pageCount = Math.max(1, Math.ceil(sorted.length / 20));
  const currentPage = Math.min(pagination.key === pageKey ? pagination.page : 1, pageCount);
  const offset = (currentPage - 1) * 20;
  const visibleLeaders = sorted.slice(offset, offset + 20);
  const changePage = (page: number) => {
    setPagination({ key: pageKey, page });
    tableHeading.current?.focus({ preventScroll: true });
    tableHeading.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  return (
    <>
      <PageHeading
        eyebrow="THE NUMBERS TELL THE STORY"
        title="Statistics & awards"
        description="Celebrate standout performances, hustle, and the players who make a difference."
      >
        <Divisions value={division} onChange={setDivision} />
      </PageHeading>
      {error && <p className="error">{error}</p>}
      <div className="panel">
        <div className="section-title">
          <h2 ref={tableHeading} tabIndex={-1} className="statistics-table-heading">Player leaders</h2>
          <select
            aria-label="Sort statistics"
            value={sort}
            onChange={(e) => setSort(e.target.value as keyof Leader)}
          >
            {[
              ["ppg", "Points per game"],
              ["points", "Total points"],
              ["rebounds", "Rebounds"],
              ["assists", "Assists"],
              ["steals", "Steals"],
              ["blocks", "Blocks"],
              ["ranking", "MVP ranking"],
            ].map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="table-wrap" aria-busy={loading}>
          <table>
            <caption className="sr-only">Player statistics</caption>
            <thead>
              <tr>
                {[
                  "#",
                  "PLAYER",
                  "GP",
                  "PTS",
                  "PPG",
                  "REB",
                  "AST",
                  "STL",
                  "BLK",
                  "FOULS",
                  "MVP",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleLeaders.map((p, i) => (
                <tr key={p.id}>
                  <td>{offset + i + 1}</td>
                  <td>
                    <Link href={`/players?division=${division}&player=${p.id}`} className="player-stat-link"><strong>{p.name}</strong></Link>
                    <small className="table-sub">
                      {league.teams.find((t) => t.id === p.teamId)?.name} · #
                      {p.number}
                    </small>
                  </td>
                  <td>{p.games}</td>
                  <td>{p.points}</td>
                  <td className="positive">{p.ppg}</td>
                  <td>{p.rebounds}</td>
                  <td>{p.assists}</td>
                  <td>{p.steals}</td>
                  <td>{p.blocks}</td>
                  <td>{p.fouls}</td>
                  <td>{p.eligible ? p.ranking : "—"}</td>
                </tr>
              ))}
              {visibleLeaders.length === 0 && <tr><td colSpan={11}>{loading ? "Loading player statistics…" : error ? "Statistics are currently unavailable." : "No player statistics yet."}</td></tr>}
            </tbody>
          </table>
        </div>
        {!loading && sorted.length > 0 && <nav className="statistics-pagination" aria-label="Player statistics pagination">
          <span role="status" aria-live="polite">Showing <strong>{offset + 1}–{Math.min(offset + 20, sorted.length)}</strong> of {sorted.length} players</span>
          <div className="statistics-pagination-controls">
            <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}><ChevronLeft size={16} aria-hidden="true" />Previous</Button>
            <span>Page <strong>{currentPage}</strong> of {pageCount}</span>
            <Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}>Next<ChevronRight size={16} aria-hidden="true" /></Button>
          </div>
        </nav>}
        <p className="table-note">
          MVP average: PTS + 1.2×REB + 1.5×AST + 3×STL + 3×BLK. Minimum
          participation: half the team’s confirmed games. Rankings are
          suggestions; staff approves awards.
        </p>
      </div>
      <SectionTitle
        title="League honors"
        subtitle="Recognizing a season to remember"
      />
      <div className="award-grid">
        {league.awards
          .filter((a) => a.division === division && a.seasonId === season)
          .map((a) => (
            <div className="panel award-card" key={a.id}>
              <Trophy size={28} />
              <span className="eyebrow">OFFICIAL AWARD</span>
              <h2>{a.type}</h2>
              <p>
                {a.playerIds
                  .map((id) => league.players.find((p) => p.id === id)?.name)
                  .join(" · ") ||
                  league.teams.find((t) => t.id === a.teamId)?.name}
              </p>
            </div>
          ))}
      </div>
      {!league.awards.some(
        (a) => a.division === division && a.seasonId === season,
      ) && (
        <Empty
          title="The honors are still to come"
          description="Official MVP, Mythical Five, and championship awards appear after organizer approval."
        />
      )}
    </>
  );
}
function News({ league }: { league: League }) {
  const [filter, setFilter] = useState("All");
  const [preview, setPreview] = useState<{ src: string; title: string } | null>(null);
  const posts = league.posts.filter(
    (p) => filter === "All" || p.type === filter,
  );
  return (
    <>
      <PageHeading
        eyebrow="AROUND THE LEAGUE"
        title="News & media"
        description="The moments, the stories, and the action beyond the box score."
      />
      <div className="tabs media-tabs">
        {["All", "Announcement", "Highlight", "Gallery", "Stream"].map((f) => (
          <button
            key={f}
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="news-grid">
        {posts.map((p) => (
          <article className={`panel news-card ${p.type === "Announcement" ? "announcement-card" : ""}`} key={p.id}>
            <div className="news-visual">
              {p.images[0] ? (
                p.type === "Announcement" ? <button className="poster-preview-button" onClick={() => setPreview({ src: p.images[0], title: p.title })} aria-label={`Open full poster: ${p.title}`} aria-haspopup="dialog"><img src={p.images[0]} alt={p.title} loading="lazy" /></button> : <img src={p.images[0]} alt={p.title} />
              ) : (
                <>
                  <CircleDot size={72} />
                  <span>{p.type.toUpperCase()}</span>
                </>
              )}
            </div>
            <span className="eyebrow">
              {p.type} · {dateTime(p.createdAt)}
            </span>
            <h2>{p.title}</h2>
            <p>{p.body}</p>
            {p.gameId && (
              <Link className="text-link" href={`/live?game=${p.gameId}`}>
                View game <ArrowRight size={16} />
              </Link>
            )}
            {p.images.length > 0 && (p.type !== "Announcement" || p.images.length > 1) && (
              <div className="gallery">
                {p.images.map((src, i) => (
                  <button onClick={() => setPreview({ src, title: `${p.title} photo ${i + 1}` })} aria-label={`Preview ${p.title} photo ${i + 1}`} aria-haspopup="dialog" key={i}>
                    <img
                      src={src}
                      alt={`${p.title} photo ${i + 1}`}
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
            {p.streamUrl && (
              <iframe
                src={p.streamUrl}
                title={p.title}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )}
          </article>
        ))}
      </div>
      {posts.length === 0 && (
        <Empty
          title="Stay tuned"
          description="Official news and media will appear here."
        />
      )}
      {preview && <MediaLightbox image={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
function Live({ league, user }: { league: League; user: User | null }) {
  const searchParams = useSearchParams();
  const practice = searchParams.get("practice") === "1";
  const { league: trial, ready } = usePracticeLeague();
  if (practice && !user) return <>
    <PageHeading eyebrow="SCOREKEEPING PRACTICE" title="Sign in to view the trial scoreboard" description="Use your league account to access the practice game." />
    <div className="button-row"><Button asChild><Link href="/login">Sign in</Link></Button><Button variant="outline" asChild><Link href="/live">Official live scores</Link></Button></div>
  </>;
  return <>
    {user && <section className="scorekeeper-practice-banner" aria-label="Trial live scoreboard">
      <div><span className="eyebrow">{practice ? "TRIAL LIVE SCORE" : "SCOREKEEPING PRACTICE"}</span><h2>{practice ? "West Wolves vs East Eagles" : "Watch your trial game here"}</h2><p>{practice ? "Updates instantly from the practice desk in this browser, including other tabs. This trial is not broadcast to other devices or counted in official results." : "See your practice scores, clock, fouls and player stats on the live scoreboard."}</p></div>
      <div className="button-row">{practice ? <><Button asChild><Link href="/scorekeeper?practice=1">Open practice desk</Link></Button><Button variant="outline" asChild><Link href="/live">Official games</Link></Button></> : <Button asChild><Link href="/live?practice=1">View trial scoreboard</Link></Button>}</div>
    </section>}
    {(!practice || ready) && <LiveScoreboard key={practice ? "trial" : "official"} league={practice ? trial : league} practice={practice} />}
  </>;
}

function LiveScoreboard({ league, practice = false }: { league: League; practice?: boolean }) {
  const [selected, setSelected] = useState("");
  const [game, setGame] = useState<Game | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [boxTeam, setBoxTeam] = useState("All");
  const availableGames = league.games.filter(g => g.status !== "Cancelled").sort((a, b) => Number(b.status === "Live") - Number(a.status === "Live") || (b.start || "").localeCompare(a.start || ""));
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("game");
    setSelected(current => availableGames.some(g => g.id === current) ? current : availableGames.find(g => g.id === param)?.id || availableGames[0]?.id || "");
  }, [league.games]);
  useEffect(() => {
    if (practice) { setGame(league.games[0]); setSelected(league.games[0].id); setConnected(true); return; }
  }, [practice, league.games]);
  useEffect(() => {
    if (practice) return;
    if (!selected) return;
    let cancelled = false;
    setGame(null);
    setLoading(true);
    setLoadError("");
    setConnected(false);
    setBoxTeam("All");
    const load = () =>
      api<Game>(`/games/${selected}`)
        .then((g) => {
          if (!cancelled) {
            setGame(g);
            setLoadError("");
          }
        })
        .catch(() => { if (!cancelled) setLoadError("Game updates are unavailable. Retrying automatically every 10 seconds."); })
        .finally(() => { if (!cancelled) setLoading(false); });
    load();
    const connection = new HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Error)
      .build();
    connection.on("GameChanged", (g: Game) => {
      if (!cancelled && g.id === selected) { setGame(g); setLoading(false); setLoadError(""); }
    });
    connection.onreconnecting(() => setConnected(false));
    connection.onclose(() => setConnected(false));
    connection.onreconnected(async () => {
      await connection.invoke("Watch", selected);
      if (!cancelled) setConnected(true);
      load();
    });
    connection
      .start()
      .then(async () => {
        await connection.invoke("Watch", selected);
        if (!cancelled) setConnected(true);
      })
      .catch(() => setConnected(false));
    const poll = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      connection.stop().catch(() => {});
    };
  }, [selected, practice]);
  const seconds = useGameClock(game);
  const home = league.teams.find((t) => t.id === game?.homeId);
  const away = league.teams.find((t) => t.id === game?.awayId);
  const scored = game && ["Live", "Final", "Confirmed"].includes(game.status);
  const finished = game && ["Final", "Confirmed"].includes(game.status);
  const scoreMessage = !game ? "" : game.status === "Scheduled" ? "Waiting for tip-off" : game.homeScore === game.awayScore ? "Scores are level" : `${game.homeScore > game.awayScore ? home?.name : away?.name} ${finished ? "win by" : "lead by"} ${Math.abs(game.homeScore - game.awayScore)}`;
  return (
    <div className="live-page">
      <PageHeading
        eyebrow="FOLLOW EVERY BASKET"
        title="Live scoreboard"
        description={practice ? "Trial scoreboard · fictional teams · saved in this browser." : "A courtside view, wherever you are."}
      />
      {availableGames.length > 0 && <div className="filter-bar live-game-picker">
        <label>
          Game
          <select
            aria-label="Choose scoreboard game"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {availableGames.map((g) => (
              <option value={g.id} key={g.id}>
                {divisionLabel(g.division)} ·{" "}
                {league.teams.find((t) => t.id === g.homeId)?.name} vs{" "}
                {league.teams.find((t) => t.id === g.awayId)?.name} · {g.status}
              </option>
            ))}
          </select>
        </label>
        <span role="status" className={`connection ${connected ? "positive" : "subtle"}`}>
          {practice ? "● Trial · updates from your practice desk" : connected
            ? "● Connected live"
            : "● Connecting · automatic refresh every 10s"}
        </span>
      </div>}
      {loadError && <p className="notice error" role="alert">{loadError}</p>}
      {game ? (
        <>
          <div className="scoreboard live-arena" aria-label="Game scoreboard">
            <div className="scoreboard-top">
              <span>
                {divisionLabel(game.division)} ·{" "}
                {game.stage === "Group" ? `Group ${game.group}` : game.stage}
              </span>
              <span
                className={`badge ${game.status === "Live" ? "badge-live" : ""}`}
              >
                {game.status}
              </span>
            </div>
            <div className="scoreboard-match">
              <div>
                <TeamMark team={home} size="large" />
                <h2>{home?.name}</h2>
                {practice ? <span className="scoreboard-team-link">HOME · Practice team</span> : <Link className="scoreboard-team-link" href={`/teams?division=${game.division}&team=${home?.id}#team-roster`}>HOME · View roster <ChevronRight size={12} /></Link>}
              </div>
              <div className="scoreboard-center">
                <div className="big-score">
                  <strong className={scored && game.homeScore > game.awayScore ? "leading" : ""}>{scored ? game.homeScore : "—"}</strong>
                  <span>–</span>
                  <strong className={scored && game.awayScore > game.homeScore ? "leading" : ""}>{scored ? game.awayScore : "—"}</strong>
                </div>
                {game.status === "Live" && <div className="clock">
                  {Math.floor(seconds / 60)
                    .toString()
                    .padStart(2, "0")}
                  :{(seconds % 60).toString().padStart(2, "0")}
                </div>}
                {game.status === "Live" && <span>
                  {game.quarter > 4
                    ? `OVERTIME ${game.quarter - 4}`
                    : `QUARTER ${game.quarter}`}{" "}
                  · {game.clockRunning ? "CLOCK RUNNING" : "CLOCK STOPPED"}
                </span>}
                <p className="scoreboard-margin" aria-live="polite">{scoreMessage}</p>
                {finished && <span>{practice ? "Trial complete · no official result" : hasOfficialResult(game) ? game.status === "Final" ? "Official result · player stats pending" : "Official result" : "Awaiting organizer confirmation"}</span>}
              </div>
              <div>
                <TeamMark team={away} size="large" />
                <h2>{away?.name}</h2>
                {practice ? <span className="scoreboard-team-link">AWAY · Practice team</span> : <Link className="scoreboard-team-link" href={`/teams?division=${game.division}&team=${away?.id}#team-roster`}>AWAY · View roster <ChevronRight size={12} /></Link>}
              </div>
            </div>
            <div className="scoreboard-bottom">
              <span>
                Team fouls <b>{game.homeFouls}</b> · Timeouts used{" "}
                <b>{game.homeTimeouts}</b>
              </span>
              <span>{dateTime(game.start, league.seasons.find(s => s.id === game.seasonId)?.timezone)}</span>
              <span>
                Team fouls <b>{game.awayFouls}</b> · Timeouts used{" "}
                <b>{game.awayTimeouts}</b>
              </span>
            </div>
          </div>
          <section className="panel">
            <SectionTitle title="Quarter results" />
            <div className="quarter-score-grid">
              {game.quarterResults?.map((q) => (
                <div key={q.quarter}>
                  <span>
                    {q.quarter > 4 ? "OT " + (q.quarter - 4) : "Q" + q.quarter}
                  </span>
                  <strong>{q.home}<i>–</i>{q.away}</strong><small>Home · Away</small>
                </div>
              ))}
            </div>
            {!game.quarterResults?.length && (
              <p className="muted">
                Quarter breakdowns appear as scorekeeping events are recorded.
              </p>
            )}
          </section>
          <section className="panel">
            <SectionTitle
              title="Box score"
              subtitle="Live individual performance"
            />
            <div className="box-team-tabs" role="group" aria-label="Filter box score by team">
              {[["All", "Both teams"], [game.homeId, home?.name || "Home"], [game.awayId, away?.name || "Away"]].map(([id, name]) => <button type="button" key={id} aria-pressed={boxTeam === id} onClick={() => setBoxTeam(id)}>{name}</button>)}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      "PLAYER",
                      "TEAM",
                      "PTS",
                      "REB",
                      "AST",
                      "STL",
                      "BLK",
                      "FOULS",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {game.roster.filter(id => boxTeam === "All" || (game.rosterSnapshots?.find(p => p.playerId === id)?.teamId || league.players.find(p => p.id === id)?.teamId) === boxTeam).map((id) => {
                    const p =
                      game.rosterSnapshots?.find((p) => p.playerId === id) ||
                      league.players.find((p) => p.id === id);
                    const s = game.stats[id];
                    return (
                      <tr key={id}>
                        <td>{p?.name || "Registered player"}</td>
                        <td>{p?.teamId === game.homeId ? "Home" : "Away"}</td>
                        {[
                          "points",
                          "rebounds",
                          "assists",
                          "steals",
                          "blocks",
                          "fouls",
                        ].map((key) => (
                          <td key={key}>{s?.[key as keyof typeof s] || 0}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {game.roster.length === 0 && (
              <p className="table-note">
                The approved game roster is captured when scorekeeping begins.
              </p>
            )}
          </section>
        </>
      ) : (
        loading ? <div className="live-loading" role="status">Loading the scoreboard…</div> : <section className="live-waiting" aria-label="Courtside updates"><span className="live-waiting-icon"><Radio size={36} /></span><span className="eyebrow">YOUR COURTSIDE SEAT</span><h2>{availableGames.length ? "Waiting for game details" : "The court is quiet. Stay ready."}</h2><p>{availableGames.length ? "Game details will appear when the connection is restored." : "Live scores, the game clock, and player stats will appear here when scorekeeping begins."}</p><div className="live-waiting-features"><span><Activity size={17} />Live scores</span><span><CircleDot size={17} />Quarter by quarter</span><span><Users size={17} />Player stats</span></div><div className="button-row"><Link href="/schedule" className="button button-primary">View the schedule <ArrowRight size={16} /></Link><Link href="/teams" className="button button-outline">Explore the teams</Link></div></section>
      )}
    </div>
  );
}
function Login({ onLogin, user }: { onLogin: () => void; user: User | null }) {
  const [register, setRegister] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="WELCOME TO THE TEAM"
        title={register ? "Create your account" : "Sign in to the league"}
        description="Team managers, scorekeepers, and organizers share one secure home."
      />
      <div className="panel auth-panel">
        {user ? (
          <>
            <ShieldCheck size={36} />
            <h2>You’re signed in</h2>
            <p>{user.email}</p>
            <Button asChild>
              <Link href="/manager">
                My registrations <ArrowRight size={16} />
              </Link>
            </Button>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const data = new FormData(e.currentTarget);
              try {
                const result = await api<{ message: string }>(
                  register ? "/auth/register" : "/auth/login",
                  { email: data.get("email"), password: data.get("password") },
                );
                setMessage(result.message);
                onLogin();
                if (register) setRegister(false);
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>{register ? "Join as a team manager" : "Back on the court"}</h2>
            <label>
              Email
              <input type="email" name="email" required autoComplete="email" />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                minLength={12}
                required
                autoComplete={register ? "new-password" : "current-password"}
              />
            </label>
            {register && (
              <p className="muted">
                At least 12 characters, including uppercase, lowercase, a
                number, and a symbol.
              </p>
            )}
            <Button disabled={busy} type="submit">
              {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
              <ArrowRight size={16} />
            </Button>
            <button
              className="text-link auth-switch"
              type="button"
              onClick={() => {
                setRegister(!register);
                setMessage("");
              }}
            >
              {register
                ? "Already registered? Sign in"
                : "New team manager? Create an account"}
            </button>
          </form>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
      </div>
    </>
  );
}
