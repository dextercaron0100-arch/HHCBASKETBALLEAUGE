"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, RefreshCw, ShieldCheck } from "lucide-react";
import { useGameClock } from "@/lib/clock";
import { api, hubUrl } from "@/lib/api";
import type { Game, GameLineup, League, User } from "@/lib/types";
import { Empty, PageHeading, TeamMark } from "./league-app";
import { Button } from "./ui/button";
import { applyPracticeCommand, createPracticeLeague } from "@/lib/practice-scoring";
import { savePracticeLeague, usePracticeLeague } from "@/lib/practice-session";
import CommitteeScoresheet from "./committee-scoresheet";
import GameLineupSetup from "./game-lineup";
export default function Scorekeeper({
  user,
  league,
}: {
  user: User | null;
  league: League;
}) {
  const searchParams = useSearchParams();
  const [practiceEnabled, setPractice] = useState(searchParams.get("practice") === "1");
  const practice = Boolean(user) && practiceEnabled;
  const { league: trial, ready } = usePracticeLeague();
  const [reset, setReset] = useState(0);
  return <>
    {user && <section className={`scorekeeper-practice-banner ${practice ? "is-practicing" : ""}`} aria-label="Scorekeeping practice">
      <div><span className="eyebrow">{practice ? "PRACTICE MODE" : "NEW TO THE SCORING DESK?"}</span><h2>{practice ? "Your trial game" : "Try a practice game"}</h2><p>{practice ? "Fictional teams. Your trial is saved in this browser and updates the trial live scoreboard. Official games are unaffected." : "Learn the controls with two sample teams before game day."}</p></div>
      <div className="button-row">{practice ? <><Button asChild><Link href="/live?practice=1" target="_blank" rel="noopener noreferrer">View trial scoreboard</Link></Button><Button variant="outline" onClick={() => { savePracticeLeague(createPracticeLeague()); setReset(value => value + 1); }}>Reset practice</Button><Button variant="outline" onClick={() => setPractice(false)}>Exit practice</Button></> : <Button onClick={() => setPractice(true)}>Start practice game</Button>}</div>
    </section>}
    {practice && <aside className="scorekeeper-practice-guide"><strong>Try it in order</strong><ol><li>Acquire control, mark attendance and starters, save the lineup, then start the game.</li><li>Select a player and add points or stats.</li><li>Start / pause the clock and try a timeout.</li><li>To skip ahead, enter a correction reason, set the clock to 0, then choose Next quarter.</li></ol></aside>}
    {(!practice || ready) && <ScorekeepingDesk key={`${practice}-${reset}`} user={user} league={practice ? trial : league} practice={practice} />}
  </>;
}

function ScorekeepingDesk({ user, league, practice }: { user: User | null; league: League; practice: boolean }) {
  const [games, setGames] = useState<Game[]>(practice ? league.games : []);
  const [selected, setSelected] = useState(practice ? league.games[0].id : "");
  const [game, setGame] = useState<Game | null>(practice ? league.games[0] : null);
  const [player, setPlayer] = useState("");
  const [message, setMessage] = useState("");
  const [commandError, setCommandError] = useState("");
  const [connected, setConnected] = useState(practice);
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(!practice);
  const [loadError, setLoadError] = useState("");
  const [control, setControl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [clock, setClock] = useState("0");
  const [pointsQuarter, setPointsQuarter] = useState("");
  useEffect(() => { setPointsQuarter(""); }, [selected]);
  const client = useRef("");
  const commandPending = useRef(false);
  const activeSelection = useRef(selected);
  useEffect(() => { activeSelection.current = selected; }, [selected]);
  const receiveGame = useCallback((incoming: Game) => {
    if (incoming.id !== activeSelection.current) return;
    setGame(current => current?.id === incoming.id && current.version > incoming.version ? current : incoming);
  }, []);
  useEffect(() => {
    if (practice) { setGame(league.games[0]); setGames(league.games); }
  }, [practice, league.games]);
  const allowed = practice || user?.roles.some((r) =>
    ["Administrator", "Organizer", "Scorekeeper"].includes(r),
  );
  useEffect(() => {
    client.current = crypto.randomUUID();
  }, []);
  const load = useCallback(
    () => {
      if (practice) return Promise.resolve();
      setLoading(true);
      setLoadError("");
      return api<Game[]>("/scoring")
        .then((gs) => {
          setGames(gs);
          setSelected(
            (id) =>
              gs.some(g => g.id === id) ? id : gs.find((g) => g.status === "Live")?.id || gs[0]?.id || "",
          );
        })
        .catch((e) => setLoadError(e.message))
        .finally(() => setLoading(false));
    },
    [practice],
  );
  useEffect(() => {
    if (allowed) load();
  }, [allowed, load, league.revision, user?.id]);
  useEffect(() => {
    if (practice) return;
    setGame(null);
    setControl(false);
    setConnected(false);
    setConnecting(Boolean(selected && allowed));
    if (!selected || !allowed) return;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connection = new HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Error)
      .build();
    const snapshot = async () => {
      await connection.invoke("Watch", selected);
      const current = await api<Game>(`/games/${selected}`);
      if (!disposed) { receiveGame(current); setConnected(true); setConnecting(false); }
    };
    const connect = async () => {
      if (disposed) return;
      setConnecting(true);
      try {
        if (connection.state === HubConnectionState.Disconnected) await connection.start();
        if (connection.state !== HubConnectionState.Connected) throw new Error("Reconnecting");
        await snapshot();
      } catch {
        if (!disposed) { setConnected(false); setConnecting(false); retry = setTimeout(connect, 3000); }
      }
    };
    connection.on("GameChanged", (current: Game) => {
      if (!disposed && current.id === selected) receiveGame(current);
    });
    connection.onreconnecting(() => {
      if (!disposed) { setConnected(false); setConnecting(true); setControl(false); }
    });
    connection.onclose(() => {
      if (!disposed) { setConnected(false); setConnecting(false); setControl(false); clearTimeout(retry); retry = setTimeout(connect, 3000); }
    });
    connection.onreconnected(() => { snapshot().catch(() => { if (!disposed) { setConnected(false); setConnecting(false); clearTimeout(retry); retry = setTimeout(connect, 3000); } }); });
    const offline = () => {
      setConnected(false); setConnecting(false); setControl(false);
    };
    const online = () => { clearTimeout(retry); connect(); };
    connect();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      disposed = true;
      clearTimeout(retry);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      connection.stop().catch(() => {});
    };
  }, [selected, allowed, practice, receiveGame]);
  useEffect(() => {
    if (practice || !selected || !control || !connected) return;
    let disposed = false;
    const timer = setInterval(
      () =>
        api<Game>(`/games/${selected}/lease`, { clientId: client.current })
          .then(current => { if (!disposed) receiveGame(current); })
          .catch((e) => {
            if (disposed) return;
            setControl(false);
            setMessage(e.message);
          }),
      20000,
    );
    return () => { disposed = true; clearInterval(timer); };
  }, [selected, control, connected, practice, receiveGame]);
  const send = async (kind: string, amount = 0, side = "", playerId = player, incomingPlayerId = "", lineup?: GameLineup, overrideReason?: string) => {
    if (!game || !connected || (!practice && !navigator.onLine) || !control || busy || commandPending.current) return false;
    const entryQuarter = kind === "points" && pointsQuarter ? Number(pointsQuarter) : undefined;
    const eventReason = overrideReason ?? [reason.trim(), entryQuarter != null ? `Manual score entry for ${entryQuarter <= 4 ? `Q${entryQuarter}` : `OT${entryQuarter - 4}`}` : ""].filter(Boolean).join(" · ");
    setCommandError("");
    if (practice) {
      try {
        const result = applyPracticeCommand(game, league, kind, amount, playerId, side, eventReason, incomingPlayerId, lineup, entryQuarter);
        setGame(result);
        setGames([result]);
        savePracticeLeague({ ...league, games: [result] });
        setReason("");
        setMessage(kind === "finish" || kind === "overrideFinish" ? "Practice game finished! Reset practice to try again. No official result was saved." : "Practice event recorded. Trial live scoreboard updated.");
        return true;
      } catch (error) { setMessage((error as Error).message); setCommandError((error as Error).message); return false; }
    }
    commandPending.current = true;
    setBusy(true);
    try {
      const result = await api<Game>(`/games/${game.id}/score`, {
        commandId: crypto.randomUUID(),
        version: game.version,
        clientId: client.current,
        kind,
        playerId,
        incomingPlayerId,
        ...lineup,
        side,
        amount,
        reason: eventReason,
        quarter: entryQuarter,
      });
      receiveGame(result);
      setMessage(kind === "overrideFinish" ? result.status === "Confirmed" ? "Game confirmed. Standings and player statistics updated." : "Game finished, awaiting confirmation. Review player point totals in League management." : "Recorded.");
      if (result.status === "Confirmed") setControl(false);
      setReason("");
      await load();
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      setCommandError((e as Error).message);
      api<Game>(`/games/${game.id}`).then(receiveGame).catch(() => {});
      return false;
    } finally {
      commandPending.current = false;
      setBusy(false);
    }
  };
  const seconds = useGameClock(game);
  if (!allowed)
    return (
      <Empty
        title="Scorekeeper access required"
        description="An organizer must assign you to a game before you can control its scoreboard."
      />
    );
  const disabled = !connected || !control || busy;
  const home = league.teams.find((t) => t.id === game?.homeId);
  const away = league.teams.find((t) => t.id === game?.awayId);
  const seasonRules = league.seasons.find(s => s.id === game?.seasonId);
  const timeoutPeriod = game && game.quarter > 4 && seasonRules?.overtimeTimeoutLimit != null ? "this overtime" : seasonRules?.timeoutPeriod === "Half" ? "this half" : "this game";
  const timeoutLimit = game && game.quarter > 4 ? seasonRules?.overtimeTimeoutLimit ?? seasonRules?.timeoutLimit : seasonRules?.timeoutLimit;
  return (
    <>
      <PageHeading
        eyebrow="TABLE OFFICIALS"
        title="Scorekeeping desk"
        description={practice ? "Practice the same controls with a fictional game. Nothing is published." : "One controller. A shared live scoreboard. Every change recorded."}
      />
      {loadError && <div className="notice error" role="alert">Unable to load assigned games. {loadError} <Button variant="outline" size="sm" onClick={load}>Retry</Button></div>}
      {games.length > 0 && <div className="filter-bar">
        <label>
          Assigned game
          <select
            aria-label="Assigned game"
            disabled={busy}
            value={selected}
            onChange={(e) => {
              activeSelection.current = e.target.value;
              setSelected(e.target.value);
              setGame(null);
              setMessage("");
              setCommandError("");
              setPlayer("");
            }}
          >
            {!selected && <option value="">Choose an assigned game</option>}
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {league.teams.find((t) => t.id === g.homeId)?.name} vs{" "}
                {league.teams.find((t) => t.id === g.awayId)?.name} · {g.status}
              </option>
            ))}
          </select>
        </label>
        <span className={connected ? "positive" : connecting || !selected ? "muted" : "error"} role="status">
          {practice ? "● Practice · local only" : !selected ? "Choose a game to connect" : connected ? "● Connected" : connecting ? "● Connecting to scoreboard…" : "● Connection lost · scoring disabled. Retrying…"}
        </span>
        <Button
          disabled={!connected || !game || busy || game.status === "Confirmed"}
          onClick={async () => {
            if (practice) { setControl(true); setMessage("Practice control acquired. Select present players and starters, then save the lineup."); return; }
            setBusy(true);
            try {
              receiveGame(
                await api<Game>(`/games/${selected}/lease`, {
                  clientId: client.current,
                }),
              );
              setControl(true);
              setMessage(
                "You have control. The lease renews every 20 seconds.",
              );
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {control ? "Control acquired" : "Acquire control"}
        </Button>
      </div>}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {game ? (
        <>
          <div className="scoreboard scorekeeper-board">
            <div className="scoreboard-top">
              <span>
                {game.status} · Version {game.version}
              </span>
              <span>{control ? "YOUR CONTROL" : "VIEW ONLY"}</span>
            </div>
            <div className="scoreboard-match">
              <div>
                <TeamMark team={home} />
                <h2>{home?.name}</h2>
                <strong>{game.homeScore}</strong>
              </div>
              <div className="scoreboard-center">
                <div className="clock">
                  {Math.floor(seconds / 60)
                    .toString()
                    .padStart(2, "0")}
                  :{(seconds % 60).toString().padStart(2, "0")}
                </div>
                <span>QUARTER {game.quarter}</span>
                <div className="button-row">
                  <Button
                    disabled={disabled || game.status !== "Live"}
                    onClick={() => send("clock", game.clockRunning ? 0 : 1)}
                  >
                    {game.clockRunning ? "Pause clock" : "Start clock"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={disabled || game.status !== "Live"}
                    onClick={() => send("quarter")}
                  >
                    Next quarter
                  </Button>
                </div>
              </div>
              <div>
                <TeamMark team={away} />
                <h2>{away?.name}</h2>
                <strong>{game.awayScore}</strong>
              </div>
            </div>
            <div className="scoreboard-bottom">
              <span>
                Fouls {game.homeFouls} · Timeouts {timeoutPeriod}: {game.homeTimeouts}{timeoutLimit != null ? ` / ${timeoutLimit}` : ""}
              </span>
              <span>
                Fouls {game.awayFouls} · Timeouts {timeoutPeriod}: {game.awayTimeouts}{timeoutLimit != null ? ` / ${timeoutLimit}` : ""}
              </span>
            </div>
          </div>
          {game.status === "Scheduled" && <GameLineupSetup key={`${game.id}-${game.version}`} game={game} league={league} disabled={disabled} error={commandError} onSave={lineup => { void send("lineup", 0, "", "", "", lineup); }} onStart={() => { void send("start"); }} />}
          <CommitteeScoresheet key={game.id} game={game} league={league} disabled={disabled} selectedPlayer={player} onSelect={setPlayer} pointsQuarter={pointsQuarter} onPointsQuarterChange={setPointsQuarter} practice={practice} canOverrideFinish={practice || Boolean(user?.roles.some(role => ["Administrator", "Organizer"].includes(role)))} onOverrideFinish={reason => send("overrideFinish", 0, "", "", "", undefined, reason)} onRecord={(kind, amount, playerId, incomingPlayerId) => { setPlayer(playerId); void send(kind, amount, "", playerId, incomingPlayerId); }} />
          <div className="admin-two-column">
            <section className="panel">
              <h2>Player statistics</h2>
              {pointsQuarter && <p className="notice">Points additions and reductions apply to {Number(pointsQuarter) <= 4 ? `Q${pointsQuarter}` : `OT${Number(pointsQuarter) - 4}`}. Change Points quarter in the scoresheet to return to live entry.</p>}
              <label>
                Player
                <select
                  aria-label="Player"
                  value={player}
                  onChange={(e) => setPlayer(e.target.value)}
                >
                  <option value="">Choose a roster player</option>
                  {game.roster.map((id) => {
                    const p = league.players.find((p) => p.id === id);
                    return (
                      <option key={id} value={id}>
                        {p?.teamId === game.homeId ? "Home" : "Away"} · #
                        {p?.number} {p?.name}
                      </option>
                    );
                  })}
                </select>
              </label>
              <div className="score-buttons">
                {[1, 2, 3].map((points) => (
                  <Button
                    key={points}
                    disabled={disabled || !player || game.status !== "Live"}
                    onClick={() => send("points", points)}
                  >
                    +{points} PTS
                  </Button>
                ))}
              </div>
              <div className="stat-controls">
                {["rebounds", "assists", "steals", "blocks", "fouls"].map(
                  (kind) => (
                    <div key={kind}>
                      <span>{kind}</span>
                      <Button
                        variant="outline"
                        disabled={disabled || !player || game.status !== "Live"}
                        onClick={() => send(kind, 1)}
                      >
                        +1
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={
                          disabled ||
                          !player ||
                          !reason ||
                          game.status !== "Live"
                        }
                        onClick={() => send(kind, -1)}
                      >
                        −1
                      </Button>
                    </div>
                  ),
                )}
              </div>
              <label>
                Correction reason
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Required for reductions and clock corrections"
                />
              </label>
              <div className="button-row">
                {[1, 2, 3].map((n) => (
                  <Button
                    key={n}
                    variant="outline"
                    disabled={
                      disabled || !player || !reason || game.status !== "Live"
                    }
                    onClick={() => send("points", -n)}
                  >
                    −{n} PTS
                  </Button>
                ))}
              </div>
              {practice && player && game.stats[player] && <p className="notice" role="status">Selected player: {game.stats[player].points} PTS · {game.stats[player].rebounds} REB · {game.stats[player].assists} AST · {game.stats[player].steals} STL · {game.stats[player].blocks} BLK · {game.stats[player].fouls} fouls</p>}
            </section>
            <section className="panel">
              <h2>Game controls</h2>
              <div className="button-row">
                <Button
                  variant="outline"
                  disabled={disabled || game.status !== "Live"}
                  onClick={() => send("finish")}
                >
                  Finish game
                </Button>
              </div>
              <p className="muted">
                {practice ? "This is a trial only; there is no organizer confirmation or published result. " : "Final results require organizer confirmation. "}Regulation must finish at zero; a tie requires overtime.
              </p>
              <h3>Timeouts</h3>
              <div className="button-row">
                <Button
                  variant="outline"
                  disabled={disabled || game.status !== "Live"}
                  onClick={() => send("timeout", 1, "home")}
                >
                  Home timeout
                </Button>
                <Button
                  variant="outline"
                  disabled={disabled || game.status !== "Live"}
                  onClick={() => send("timeout", 1, "away")}
                >
                  Away timeout
                </Button>
              </div>
              <h3>Clock correction</h3>
              <label>
                Remaining seconds
                <input
                  type="number"
                  min="0"
                  value={clock}
                  onChange={(e) => setClock(e.target.value)}
                />
              </label>
              <Button
                variant="outline"
                disabled={disabled || !reason || game.status !== "Live"}
                onClick={() => send("setClock", Number(clock))}
              >
                Set clock with reason
              </Button>
            </section>
          </div>
        </>
      ) : games.length > 0 ? (
        <Empty title="Preparing your scoreboard" description="Waiting for a connection and a fresh game snapshot. Scoring stays disabled until ready." />
      ) : loading ? (
        <div className="scorekeeper-loading" role="status">Loading assigned games…</div>
      ) : !loadError ? (
        <section className="scorekeeper-empty">
          <span className="scorekeeper-empty-icon"><CalendarDays size={30} /></span>
          <h2>No assigned games yet</h2>
          <p>{user?.roles.some(role => ["Administrator", "Organizer"].includes(role)) ? "Create a season, approve teams, and schedule games in the organizer dashboard. Then assign scorekeepers to get started." : "Your organizer will assign games to your account. Check back here when your next game is ready."}</p>
          <div className="button-row">
            {user?.roles.some(role => ["Administrator", "Organizer"].includes(role)) && <Button asChild><Link href="/admin"><ShieldCheck size={16} />Open organizer dashboard</Link></Button>}
            <Button variant="outline" onClick={load}><RefreshCw size={16} />Refresh games</Button>
          </div>
        </section>
      ) : null}
    </>
  );
}
