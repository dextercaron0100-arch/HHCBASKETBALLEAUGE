export type PostseasonWeek = {
  title: string;
  days: {
    date: string;
    summary?: string | null;
    entries: {
      time: string;
      stage: string;
      matchup: string;
      gameId?: string | null;
      highlighted?: boolean;
      division?: string | null;
      bracketKey?: string | null;
    }[];
  }[];
};
export type Season = {
  id: string;
  name: string;
  year: number;
  registrationOpen: boolean;
  timezone: string;
  courts: { id: string; venue: string; name: string }[];
  quarterSeconds: number;
  overtimeSeconds: number;
  ageCutoff?: string;
  juniorMin?: number;
  juniorMax?: number;
  seniorMin?: number;
  seniorMax?: number;
  foulLimit?: number;
  timeoutLimit?: number;
  timeoutPeriod?: "Game" | "Half";
  overtimeTimeoutLimit?: number | null;
  restMinutes?: number;
  slotMinutes?: number;
  days?: number[];
  sessions?: { startHour: number; endHour: number; startMinute?: number; endMinute?: number }[];
  closures?: { courtId: string; start: string; end: string }[];
  tieDecisions?: Record<string, string[]>;
  groupSizes?: Record<string, number[]>;
  postseasonSchedule?: PostseasonWeek[];
  semifinalBestOf?: number;
  finalBestOf?: number;
};
export type Team = {
  slot?: number;
  id: string;
  seasonId: string;
  division: string;
  group: string;
  name: string;
  coach: string;
  assistantCoach?: string;
  logo: string;
  color: string;
  status?: string;
  managerId?: string;
};
export type Player = {
  id: string;
  teamId: string;
  name: string;
  number: number;
  position: string;
  jerseySize?: string;
  rosterRole?: string;
  photo: string;
  birthDate?: string;
  evidence?: string;
  status?: string;
};
export type Stats = {
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  fouls: number;
};
export type GameLineup = { presentPlayerIds: string[]; starterPlayerIds: string[] };
export type MatchupCardGame = Pick<Game,
  "id" | "seasonId" | "division" | "group" | "stage" | "homeId" | "awayId" |
  "start" | "durationMinutes" | "courtId" | "status" | "homeScore" | "awayScore" |
  "quarter" | "resultApproved"
> & {
  planned?: boolean;
  homeLabel?: string;
  awayLabel?: string;
  conditional?: boolean;
};
export type Game = {
  id: string;
  seasonId: string;
  division: string;
  group: string;
  stage: string;
  bracketKey: string;
  number?: number;
  homeId: string;
  awayId: string;
  start: string | null;
  durationMinutes?: number | null;
  courtId: string;
  status: string;
  homeScore: number;
  resultApproved?: boolean;
  awayScore: number;
  quarter: number;
  clockSeconds: number;
  clockRunning: boolean;
  clockAt: string;
  version: number;
  roster: string[];
  onCourt?: string[];
  startingFive?: string[];
  stats: Record<string, Stats>;
  homeFouls: number;
  awayFouls: number;
  homeTimeouts: number;
  awayTimeouts: number;
  scorekeeperId: string;
  officialIds: string[];
  serverTime?: string;
  rosterSnapshots?: {
    playerId: string;
    teamId: string;
    name: string;
    number: number;
    position: string;
  }[];
  quarterResults?: { quarter: number; home: number; away: number }[];
  // Local practice history; official quarter totals come from server scoring events.
  pointEvents?: { playerId: string; quarter: number; amount: number }[];
};
export type Post = {
  id: string;
  title: string;
  body: string;
  type: string;
  gameId: string;
  images: string[];
  streamUrl: string;
  published: boolean;
  createdAt: string;
};
export type Award = {
  id: string;
  seasonId: string;
  division: string;
  type: string;
  playerIds: string[];
  teamId: string;
  approvedBy: string;
};
export type League = {
  revision: number;
  demo: boolean;
  seasons: Season[];
  teams: Team[];
  players: Player[];
  games: Game[];
  posts: Post[];
  awards: Award[];
};
export type Standing = {
  teamId: string;
  name: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  difference: number;
  unresolved: boolean;
  tieKey: string;
};
export type Leader = {
  id: string;
  teamId: string;
  name: string;
  number: number;
  position: string;
  games: number;
  teamGames: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  fouls: number;
  ppg: number;
  ranking: number;
  eligible: boolean;
};
export type User = { id: string; email: string; roles: string[] };
export type Finance = {
  id: string;
  seasonId: string;
  teamId: string;
  type: string;
  amount: number;
  description: string;
  date: string;
};
export type Discipline = {
  id: string;
  playerId: string;
  gameId: string;
  type: string;
  reason: string;
  from: string | null;
  until: string | null;
  gameIds: string[];
  resolved: boolean;
};
export type Official = {
  id: string;
  name: string;
  role: string;
  userId: string;
};
export type Preview = {
  id: string;
  revision: number;
  calendar: Season;
  placements: { gameId: string; start: string; courtId: string }[];
  unscheduled: string[];
  affected: string[];
};
export type Amendment = {
  id: string;
  playerId: string;
  proposed: Player;
  submittedBy: string;
  status: string;
};
export type AdminState = League & {
  finance: Finance[];
  discipline: Discipline[];
  officials: Official[];
  audit: {
    id: string;
    actor: string;
    action: string;
    target: string;
    reason: string;
    at: string;
    details: string;
  }[];
  previews: Preview[];
  amendments: Amendment[];
};
