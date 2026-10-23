"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import Link from "next/link";
import { CalendarDays, RefreshCw, ShieldCheck } from "lucide-react";
import { useGameClock } from "@/lib/clock";
import { api, hubUrl } from "@/lib/api";
import type { Game, League, User } from "@/lib/types";
import { Empty, PageHeading, TeamMark } from "./league-app";
import { Button } from "./ui/button";
export default function Scorekeeper({
  user,
  league,
}: {
  user: User | null;
  league: League;
}) {
  const [games, setGames] = useState<Game[]>([]);
  const [selected, setSelected] = useState("");
  const [game, setGame] = useState<Game | null>(null);
  const [player, setPlayer] = useState("");
  const [message, setMessage] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [control, setControl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [clock, setClock] = useState("0");
  const client = useRef("");
  const allowed = user?.roles.some((r) =>
    ["Administrator", "Organizer", "Scorekeeper"].includes(r),
  );
  useEffect(() => {
    client.current = crypto.randomUUID();
  }, []);
  const load = useCallback(
    () => {
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
    [],
  );
  useEffect(() => {
    if (allowed) load();
  }, [allowed, load, league.revision, user?.id]);
  useEffect(() => {
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
      if (!disposed) { setGame(current); setConnected(true); setConnecting(false); }
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
      if (!disposed && current.id === selected) setGame(current);
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
  }, [selected, allowed]);
  useEffect(() => {
    if (!selected || !control || !connected) return;
    const timer = setInterval(
      () =>
        api<Game>(`/games/${selected}/lease`, { clientId: client.current })
          .then(setGame)
          .catch((e) => {
            setControl(false);
            setMessage(e.message);
          }),
      20000,
    );
    return () => clearInterval(timer);
  }, [selected, control, connected]);
  const send = async (kind: string, amount = 0, side = "") => {
    if (!game || !connected || !navigator.onLine || !control || busy) return;
    setBusy(true);
    try {
      const result = await api<Game>(`/games/${game.id}/score`, {
        commandId: crypto.randomUUID(),
        version: game.version,
        clientId: client.current,
        kind,
        playerId: player,
        side,
        amount,
        reason,
      });
      setGame(result);
      setMessage("Recorded.");
      setReason("");
      await load();
    } catch (e) {
      setMessage((e as Error).message);
      api<Game>(`/games/${game.id}`).then(setGame);
    } finally {
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
  return (
    <>
      <PageHeading
        eyebrow="TABLE OFFICIALS"
        title="Scorekeeping desk"
        description="One controller. A shared live scoreboard. Every change recorded."
      />
      {loadError && <div className="notice error" role="alert">Unable to load assigned games. {loadError} <Button variant="outline" size="sm" onClick={load}>Retry</Button></div>}
      {games.length > 0 && <div className="filter-bar">
        <label>
          Assigned game
          <select
            aria-label="Assigned game"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
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
          {!selected ? "Choose a game to connect" : connected ? "● Connected" : connecting ? "● Connecting to scoreboard…" : "● Connection lost · scoring disabled. Retrying…"}
        </span>
        <Button
          disabled={!connected || !game || busy || game.status === "Confirmed"}
          onClick={async () => {
            setBusy(true);
            try {
              setGame(
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
                Fouls {game.homeFouls} · Timeouts {game.homeTimeouts}
              </span>
              <span>
                Fouls {game.awayFouls} · Timeouts {game.awayTimeouts}
              </span>
            </div>
          </div>
          <div className="admin-two-column">
            <section className="panel">
              <h2>Player statistics</h2>
              <label>
                Player
                <select
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
            </section>
            <section className="panel">
              <h2>Game controls</h2>
              <div className="button-row">
                <Button
                  disabled={disabled || game.status !== "Scheduled"}
                  onClick={() => send("start")}
                >
                  Start game & capture roster
                </Button>
                <Button
                  variant="outline"
                  disabled={disabled || game.status !== "Live"}
                  onClick={() => send("finish")}
                >
                  Finish game
                </Button>
              </div>
              <p className="muted">
                Final results require organizer confirmation. Regulation must
                finish at zero; a tie requires overtime.
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
