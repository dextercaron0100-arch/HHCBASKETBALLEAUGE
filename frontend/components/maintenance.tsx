import { Building2, Clock3, Wrench } from "lucide-react";

export default function Maintenance({ onRetry }: { onRetry?: () => void }) {
  return <main className="maintenance-page">
    <div className="maintenance-brand"><Building2 size={34} strokeWidth={1.5} /><span>HHC <strong>BASKETBALL LEAGUE</strong></span></div>
    <section className="maintenance-card" aria-labelledby="maintenance-title">
      <span className="maintenance-icon"><Wrench size={34} strokeWidth={1.5} /></span>
      <span className="eyebrow">A SHORT TIMEOUT</span>
      <h1 id="maintenance-title">Under maintenance</h1>
      <p>The HHC Basketball League website is temporarily unavailable. Scores, schedules and team pages will return when service is restored.</p>
      <div className="maintenance-status"><Clock3 size={16} /><span>{onRetry ? "Checking automatically. Please check back soon." : "Please check back soon."}</span></div>
      {onRetry ? <button type="button" onClick={onRetry} className="maintenance-refresh">Check again</button> : <a href="/" className="maintenance-refresh">Check again</a>}
      <span className="maintenance-signoff">Every game. One community.</span>
    </section>
  </main>;
}
