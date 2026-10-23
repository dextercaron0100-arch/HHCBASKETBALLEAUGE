"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Building2, CalendarDays, CircleDot, ClipboardList, GitBranch, Home, ImageIcon, LogIn, Menu, MoreHorizontal, Radio, ShieldCheck, Trophy, Users, X } from "lucide-react";
import type { User } from "@/lib/types";
import { api } from "@/lib/api";

const primary = [
  { href: "/", label: "Home", icon: Home },
  { href: "/schedule", label: "Games", icon: CircleDot },
  { href: "/news", label: "News", icon: ImageIcon },
  { href: "/standings", label: "Team standings", icon: Trophy },
  { href: "/playoffs", label: "Playoffs", icon: GitBranch },
  { href: "/teams", label: "Teams", icon: Users },
];

export default function LeagueNavigation({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const container = useRef<HTMLElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const mobileButton = useRef<HTMLButtonElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const staff = user?.roles.some(role => ["Administrator", "Organizer"].includes(role));
  const extra = [
    { href: "/live", label: "Live scoreboard", icon: Radio },
    { href: "/statistics", label: "Statistics & awards", icon: Activity },
    { href: "/schedule", label: "Calendar & results", icon: CalendarDays },
    ...(user ? [{ href: "/manager", label: "My registrations", icon: ClipboardList }] : []),
    ...(staff ? [{ href: "/admin", label: "Organizer dashboard", icon: ShieldCheck }] : []),
    ...(staff || user?.roles.includes("Scorekeeper") ? [{ href: "/scorekeeper", label: "Scorekeeping desk", icon: Radio }] : []),
  ];
  useEffect(() => { setOpen(false); setMobile(false); }, [path]);
  useEffect(() => {
    const scroll = () => setScrolled(window.scrollY > 16);
    scroll();
    window.addEventListener("scroll", scroll, { passive: true });
    return () => window.removeEventListener("scroll", scroll);
  }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) { setOpen(false); setMobile(false); }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (mobile) mobileButton.current?.focus();
        else if (open) moreButton.current?.focus();
        setOpen(false); setMobile(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open, mobile]);
  const signOut = async () => { await api("/auth/logout", {}); onLogout(); setOpen(false); setMobile(false); };
  return (
    <header className={`league-header ${scrolled ? "is-scrolled" : ""}`} ref={container}>
      <div className="league-header-inner">
        <Link className="league-brand" href="/" aria-label="HHC BASKETBALL LEAGUE">
          <Building2 className="league-building" size={40} strokeWidth={1.6} aria-hidden="true" />
          <span className="league-wordmark"><span>HHC</span><strong>BASKETBALL</strong><small>LEAGUE</small></span>
        </Link>
        <nav className="league-desktop-nav" aria-label="Main navigation">
          {primary.map(item => <Link key={item.href} href={item.href} aria-current={path === item.href ? "page" : undefined} className="league-nav-item"><item.icon size={21} strokeWidth={1.7} /><span>{item.label}</span></Link>)}
          <div className="league-more">
            <button ref={moreButton} className={`league-nav-item ${extra.some(item => item.href === path) && !primary.some(item => item.href === path) ? "is-active" : ""}`} onClick={() => setOpen(!open)} onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); requestAnimationFrame(() => container.current?.querySelector<HTMLAnchorElement>(".league-dropdown a")?.focus()); } }} aria-expanded={open} aria-controls="league-more-links"><MoreHorizontal size={23} /><span>More</span></button>
            {open && <div id="league-more-links" className="league-dropdown" onKeyDown={event => {
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("a, button"));
              const index = items.indexOf(document.activeElement as HTMLElement);
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
              items[next]?.focus();
            }}>
              {extra.map(item => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={path === item.href ? "page" : undefined}><item.icon size={18} />{item.label}</Link>)}
              {user && <button onClick={signOut}><LogIn size={18} />Sign out</button>}
            </div>}
          </div>
        </nav>
        <div className="league-header-actions">
          <Link href={user ? "/manager" : "/login"} className="league-login"><span className="league-user-icon"><Users size={16} /></span><span>{user ? "My account" : "Login"}</span></Link>
          <button ref={mobileButton} className="league-menu-toggle" aria-label={mobile ? "Close navigation" : "Open navigation"} aria-expanded={mobile} aria-controls="league-mobile-links" onClick={() => setMobile(!mobile)}>{mobile ? <X /> : <Menu />}</button>
        </div>
      </div>
      {mobile && <nav id="league-mobile-links" className="league-mobile-nav" aria-label="Mobile navigation">
        {[...primary, ...extra.filter(item => !primary.some(main => main.href === item.href))].map(item => <Link key={item.href} href={item.href} onClick={() => setMobile(false)} aria-current={path === item.href ? "page" : undefined}><item.icon size={19} />{item.label}</Link>)}
        {user && <button onClick={signOut}><LogIn size={19} />Sign out</button>}
      </nav>}
    </header>
  );
}
