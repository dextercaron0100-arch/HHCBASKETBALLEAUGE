"use client";

import { useEffect, useState, type ReactNode } from "react";
import { imageSources } from "@/lib/images";

const slides = [
  { image: "/images/hero/basketball-court.jpg", label: "Every basket tells a story", position: "center 48%" },
  { image: "/images/hero/basketball-action.jpg", label: "From your home court to the big moment", position: "center 62%" },
  { image: "/images/hero/basketball-arena.jpg", label: "One game. One community.", position: "center 55%" },
];

export default function HeroCarousel({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => setPaused(motion.matches);
    const visibility = () => setHidden(document.hidden);
    preference(); visibility();
    motion.addEventListener("change", preference);
    document.addEventListener("visibilitychange", visibility);
    return () => { motion.removeEventListener("change", preference); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  const stopped = paused || hovered || focused || hidden;
  useEffect(() => {
    if (stopped) return;
    const timer = window.setTimeout(() => setActive(value => (value + 1) % slides.length), 5000);
    return () => window.clearTimeout(timer);
  }, [active, stopped]);
  return (
    <section className="hero hero-slideshow" aria-label="Basketball highlights" aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
      <div className="hero-photos" aria-hidden="true">
        {slides.map((slide, index) => <img key={slide.image} {...imageSources(slide.image, "100vw")} alt="" width={1600} height={1067} decoding="async" fetchPriority={index === 0 ? "high" : "auto"} className={`hero-photo ${index === active ? "is-visible" : ""}`} style={{ objectPosition: slide.position }} />)}
      </div>
      <div className="hero-shade" aria-hidden="true" />
      <div key={`${active}-${stopped}`} className={`hero-progress ${stopped ? "is-paused" : ""}`} aria-hidden="true"><span /></div>
      {children}
      <div className="hero-slider-footer">
        <div className="hero-photo-caption" aria-live={stopped ? "polite" : "off"}><span className="hero-slide-number">0{active + 1} / 0{slides.length}</span><span>{slides[active].label}</span></div>
        <button className="hero-accessible-toggle" onClick={() => setPaused(value => !value)} aria-label={paused ? "Play hero slideshow" : "Pause hero slideshow"}>{paused ? "Play slideshow" : "Pause slideshow"}</button>
      </div>
    </section>
  );
}
