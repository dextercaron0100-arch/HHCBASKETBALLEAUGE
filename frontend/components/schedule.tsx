"use client";
import Link from "next/link";
import { divisionLabel } from "@/lib/divisions";

import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Radio,
  RotateCcw,
} from "lucide-react";
import type { League } from "@/lib/types";
import { Empty, GameCard, PageHeading } from "./league-app";

function dateKey(value: string | Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
function shiftDay(day: string, amount: number) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
function formatDay(day: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-PH", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}
function Toggle({
  label,
  checked,
  onChange,
  children,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="schedule-toggle"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      {children}
      <span
        className={`toggle-track ${checked ? "on" : ""}`}
        aria-hidden="true"
      >
        <span />
      </span>
    </button>
  );
}

export default function Schedule({
  league,
  setDivision,
  initialTeam = "",
}: {
  league: League;
  division: string;
  setDivision: (division: string) => void;
  initialTeam?: string;
}) {
  const timezone = league.seasons[0]?.timezone || "Asia/Manila";
  const today = dateKey(new Date(), timezone);
  const [division, chooseDivision] = useState("All");
  const [group, setGroup] = useState("");
  const [team, setTeam] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("All");
  const [hideScores, setHideScores] = useState(false);
  const [liveOnly, setLiveOnly] = useState(false);
  const [windowStart, setWindowStart] = useState(() => shiftDay(today, -5));
  const dateRail = useRef<HTMLDivElement>(null);
  const availableGroups = [...new Set(league.teams.filter(team => division === "All" || team.division === division).map(team => team.group).filter(group => group !== "Unassigned"))].sort();
  useEffect(() => {
    const requestedTeam = league.teams.find(team => team.id === initialTeam);
    setTeam(requestedTeam?.id || "");
    if (requestedTeam) chooseDivision(requestedTeam.division);
    setDate("");
    setWindowStart(shiftDay(today, -5));
  }, [league.seasons[0]?.id, timezone, initialTeam]);
  useEffect(() => {
    const target =
      dateRail.current?.querySelector(".selected") ||
      dateRail.current?.querySelector(".is-today");
    target?.scrollIntoView({
      behavior: "instant",
      block: "nearest",
      inline: "center",
    });
  }, [windowStart, date]);

  const matching = league.games.filter(
    (g) =>
      (division === "All" || g.division === division) &&
      (!group || g.group === group) &&
      (!team || g.homeId === team || g.awayId === team),
  );
  const liveCount = matching.filter((g) => g.status === "Live").length;
  const filtered = matching.filter(
    (g) =>
      (status === "All" || g.status === status) &&
      (!liveOnly || g.status === "Live"),
  );
  const days = Array.from({ length: 10 }, (_, index) =>
    shiftDay(windowStart, index),
  );
  const counts = new Map<string, number>();
  for (const game of filtered)
    if (game.start) {
      const key = dateKey(game.start, timezone);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  const games = filtered
    .filter((g) => !date || (g.start && dateKey(g.start, timezone) === date))
    .sort((a, b) => (a.start || "z").localeCompare(b.start || "z"));
  const grouped = new Map<string, typeof games>();
  for (const game of games) {
    const key = game.start ? dateKey(game.start, timezone) : "unscheduled";
    grouped.set(key, [...(grouped.get(key) || []), game]);
  }
  const nextDate = [...counts.keys()]
    .filter((day) => day > (date || today))
    .sort()[0];
  const chooseDate = (value: string) => {
    setDate(value);
    if (value && (value < days[0] || value > days[9]))
      setWindowStart(shiftDay(value, -5));
  };
  const reset = () => {
    chooseDivision("All");
    setGroup("");
    setTeam("");
    setDate("");
    setStatus("All");
    setLiveOnly(false);
    setWindowStart(shiftDay(today, -5));
  };
  const filteredCount =
    Number(division !== "All") +
    Number(Boolean(group)) +
    Number(Boolean(team)) +
    Number(Boolean(date)) +
    Number(status !== "All") +
    Number(liveOnly);

  return (
    <>
      <PageHeading
        eyebrow="THE GAME PLAN"
        title="Schedule & results"
        description="Every matchup. Every final buzzer. Find your next game."
      >
        <div className="schedule-season">
          <CalendarDays size={17} />
          <div>
            <strong>{league.seasons[0]?.name || "HHC BASKETBALL LEAGUE"}</strong>
            <span>
              {league.seasons[0]?.year} season · {timezone}
            </span>
          </div>
        </div>
      </PageHeading>
      <section className="schedule-browser" aria-label="Game calendar">
        <div className="schedule-browser-top">
          <div
            className="schedule-division-tabs"
            aria-label="Filter games by division"
          >
            {["All", "Junior", "Senior"].map((value) => (
              <button
                key={divisionLabel(value)}
                aria-pressed={division === value}
                onClick={() => {
                  chooseDivision(value);
                  setGroup("");
                  setTeam("");
                  if (value !== "All") setDivision(value);
                }}
                className={division === value ? "active" : ""}
              >
                {value === "All" ? "All games" : divisionLabel(value)}
                <span>
                  {
                    league.games.filter(
                      (g) => value === "All" || g.division === value,
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
          <span className="schedule-range">
            {formatDay(days[0], { month: "short", day: "numeric" })} –{" "}
            {formatDay(days[9], {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
        <div className="schedule-date-nav">
          <button
            className="date-page-arrow"
            aria-label="Previous dates"
            onClick={() => setWindowStart((day) => shiftDay(day, -7))}
          >
            <ChevronLeft size={21} />
          </button>
          <div className="schedule-date-rail" ref={dateRail}>
            {days.map((day) => {
              const count = counts.get(day) || 0;
              return (
                <button
                  key={day}
                  className={`schedule-date ${date === day ? "selected" : ""} ${day === today ? "is-today" : ""}`}
                  aria-pressed={date === day}
                  aria-label={`${formatDay(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}, ${count} games`}
                  onClick={() => setDate(day)}
                >
                  <span className="date-weekday">
                    {formatDay(day, { weekday: "short" })}
                  </span>
                  <strong>{day.slice(-2)}</strong>
                  <span className="date-month">
                    {formatDay(day, { month: "short" })}
                  </span>
                  <span
                    className={`date-game-dot ${count ? "has-games" : ""}`}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
          <button
            className="date-page-arrow"
            aria-label="Next dates"
            onClick={() => setWindowStart((day) => shiftDay(day, 7))}
          >
            <ChevronRight size={21} />
          </button>
        </div>
        <div className="schedule-calendar-footer">
          <div className="date-shortcuts">
            <button
              className={!date ? "active" : ""}
              aria-pressed={!date}
              onClick={() => setDate("")}
            >
              All dates
            </button>
            <button
              className={date === today ? "active" : ""}
              aria-pressed={date === today}
              onClick={() => {
                setDate(today);
                setWindowStart(shiftDay(today, -5));
              }}
            >
              Today
            </button>
          </div>
          <div className="schedule-toggles">
            <Toggle
              label="Hide scores"
              checked={hideScores}
              onChange={setHideScores}
            >
              <EyeOff size={16} />
              <span>Hide scores</span>
            </Toggle>
            <Toggle
              label="Live only"
              checked={liveOnly}
              onChange={(value) => {
                setLiveOnly(value);
                if (value) setStatus("All");
              }}
            >
              <Radio size={16} />
              <span>
                Live <b>({liveCount})</b>
              </span>
            </Toggle>
          </div>
        </div>
      </section>
      <div className="schedule-filter-row">
        <label>
          Team
          <select
            aria-label="Team"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          >
            <option value="">All teams</option>
            {league.teams
              .filter((t) => division === "All" || t.division === division)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {divisionLabel(t.division)}
                </option>
              ))}
          </select>
        </label>
        <label>
          Group
          <select
            aria-label="Group"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="">All groups & playoffs</option>
            {availableGroups.map(group => <option key={group} value={group}>Group {group}</option>)}
          </select>
        </label>
        <label>
          Status
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setLiveOnly(false);
            }}
          >
            {[
              { value: "All", label: "All statuses" },
              { value: "Scheduled", label: "Upcoming" },
              { value: "Live", label: "Live" },
              { value: "Final", label: "Awaiting confirmation" },
              { value: "Confirmed", label: "Final results" },
            ].map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Jump to date
          <input
            aria-label="Jump to date"
            type="date"
            value={date}
            onChange={(e) => chooseDate(e.target.value)}
          />
        </label>
        <button
          className="schedule-reset"
          disabled={!filteredCount}
          onClick={reset}
        >
          <RotateCcw size={14} /> Reset filters
        </button>
      </div>
      <div className="schedule-results-heading">
        <div>
          <h2>
            {date
              ? formatDay(date, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
              : liveOnly
                ? "Live on the court"
                : "All matchups"}
          </h2>
          <p aria-live="polite">
            {games.length} {games.length === 1 ? "game" : "games"} ·{" "}
            {division === "All" ? "Both divisions" : `${divisionLabel(division)} division`}
            {hideScores ? " · Scores hidden" : ""}
          </p>
        </div>
        <span className="schedule-timezone">All times in {timezone}</span>
      </div>
      {games.length ? (
        <div className="schedule-result-groups">
          {[...grouped].map(([day, matches]) => (
            <section className="schedule-day-group" key={day}>
              <div className="schedule-day-heading">
                <span>
                  <CalendarDays size={15} />
                  {day === "unscheduled"
                    ? "Time to be announced"
                    : formatDay(day, {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      })}
                  {day === today && <b>Today</b>}
                </span>
                <small>
                  {matches.length} {matches.length === 1 ? "game" : "games"}
                </small>
              </div>
              <div className="games-grid">
                {matches.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    league={league}
                    hideScores={hideScores}
                    showVenue
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="schedule-no-games">
          <Empty
            title={
              !league.games.length ? "The schedule is on its way" : liveOnly
                ? "No games are live right now"
                : date
                  ? "No games on this date"
                  : "No games match these filters"
            }
            description={
              !league.games.length ? "Official fixtures will appear here once released by the organizers. Follow your team to keep its next game close." : liveOnly
                ? "Check back at tip-off, or explore upcoming matchups."
                : "Try another day, team, or division to find your game."
            }
          />
          <div className="button-row">
            {nextDate && !liveOnly && (
              <button
                className="button button-primary"
                onClick={() => chooseDate(nextDate)}
              >
                Next game day ·{" "}
                {formatDay(nextDate, { month: "short", day: "numeric" })}
                <ChevronRight size={16} />
              </button>
            )}
            {!league.games.length ? <><Link className="button button-primary" href="/teams">Find your team <ChevronRight size={16} /></Link><Link className="button button-outline" href="/playoffs">Explore the playoffs</Link></> : <button className="button button-outline" onClick={reset}>
              View all games
            </button>}
          </div>
        </div>
      )}
    </>
  );
}
