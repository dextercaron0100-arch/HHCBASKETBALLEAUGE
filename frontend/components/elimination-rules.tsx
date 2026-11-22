import Link from "next/link";
import { ArrowRight, ChevronDown, GitBranch, ShieldCheck, Trophy } from "lucide-react";
import { playoffFormat } from "@/lib/playoff-format";
import type { Season } from "@/lib/types";

export default function EliminationRules({ division, season }: { division: string; season?: Season }) {
  return <section className="elimination-rules" id="elimination-format" aria-labelledby="elimination-rules-title">
    <header><span className="eyebrow">KNOW THE FORMAT</span><h2 id="elimination-rules-title">Elimination rules & playoff qualification</h2><p>How teams advance in the Junior and Open (Senior) divisions.</p></header>
    <div className="elimination-rule-grid">
      {(["Junior", "Senior"] as const).map(value => {
        const format = playoffFormat(value, season?.groupSizes?.[value]);
        const senior = format.senior;
        const configured = season?.groupSizes?.[value];
        const matchesFormat = !configured || configured.join(",") === format.groupSizes.join(",");
        if (!matchesFormat && configured) {
          const total = configured.reduce((sum, size) => sum + size, 0);
          const groupGames = configured.reduce((sum, size) => sum + size * (size - 1) / 2, 0);
          return <article key={value} className={`elimination-rule-card ${division === value ? "is-current" : ""}`} aria-label={`${senior ? "Open Senior" : "Junior"} elimination rules`}>
            <div className="elimination-rule-heading"><span className="elimination-rule-icon"><GitBranch size={23} aria-hidden="true" /></span><div><h3>{senior ? "Open (Senior) division" : "Junior division"}</h3><p>{total} teams · {configured.length} groups</p></div></div>
            <ol className="elimination-rule-steps">
              <li><strong>Group-stage eliminations</strong><p>Groups {configured.map((_, index) => String.fromCharCode(65 + index)).join(", ")}: {configured.map((size, index) => `${size} teams in Group ${String.fromCharCode(65 + index)}`).join(" · ")}. Play each opponent in your own group once. {configured.every(size => size === configured[0]) ? `${configured[0] - 1} games per team, ` : ""}{groupGames} group games in total.</p></li>
              {!senior && <li><strong>Three losses means automatic elimination</strong><p>A Junior team with three confirmed group-stage losses is eliminated from playoff contention, regardless of its provisional rank.</p></li>}
              <li><strong>Playoff qualification pending</strong><p>Qualification places, byes and knockout matchups for this group format will be announced before playoff seeding.</p></li>
            </ol>
            <Link className="elimination-rule-link" href={`/playoffs?division=${value}`}><Trophy size={15} aria-hidden="true" />View playoff status<ArrowRight size={15} aria-hidden="true" /></Link>
          </article>;
        }
        return <article key={value} className={`elimination-rule-card ${division === value ? "is-current" : ""}`} aria-label={`${senior ? "Open Senior" : "Junior"} elimination rules`}>
          <div className="elimination-rule-heading"><span className="elimination-rule-icon"><GitBranch size={23} aria-hidden="true" /></span><div><h3>{senior ? "Open (Senior) division" : "Junior division"}</h3><p>{format.teams} teams · {format.groupSizes.length} groups · {format.qualifiers} playoff places</p></div></div>
          {!matchesFormat && <p className="notice">The format below requires {format.groupSizes.length} groups of {format.groupSizes[0]}. Current group assignments must be finalized before these qualification rules can be applied.</p>}
          <ol className="elimination-rule-steps">
            <li><strong>Group-stage eliminations</strong><p>{senior ? "Four groups (A–D), with four teams each. Play every opponent in your own group once: three games per team, 24 group games in total." : format.juniorWildcards ? "Three groups (A, B and C), with four teams each. Play every opponent in your own group once: three games per team, 18 group games in total." : "Two groups (A and B), with six teams each. Play every opponent in your own group once: five games per team, 30 group games in total."}</p></li>
            {!senior && <li><strong>Three losses means automatic elimination</strong><p>A Junior team is automatically eliminated from playoff contention once it reaches three confirmed group-stage losses, regardless of its provisional rank.</p></li>}
            <li><strong>{senior ? "Top three advance" : format.juniorWildcards ? "Top two per bracket + two wildcards" : "Top four, subject to the three-loss rule"}</strong><p>{senior ? "Ranks 1–3 in each group qualify. Rank 4 is eliminated. Each group winner receives a bye, meaning it skips the first knockout round and goes directly to the quarterfinals." : format.juniorWildcards ? "Bracket A: top two qualify. Bracket B: top two qualify. Bracket C: top two qualify. The two best third-place teams also qualify as wildcards, giving eight playoff teams. All qualifiers must have fewer than three confirmed losses. Fourth place and the remaining third-place team are eliminated." : "A Junior team must finish in ranks 1–4 of its group and have fewer than three confirmed losses to qualify. Ranks 5–6 and every team with three losses are eliminated."}</p></li>
            <li><strong>{senior ? "Round of 12, then quarterfinals" : format.juniorWildcards ? "Wildcard ranking & eight-team quarterfinals" : "Crossover quarterfinals"}</strong><p>{senior ? "The eight second- and third-ranked teams play four crossover matches. Their four winners join the four group winners to form the quarterfinal field of eight." : format.juniorWildcards ? "Compare third-place teams by confirmed wins, overall point difference, then points scored. An unresolved tie requires an organizer decision before seeding. Seeds 1–3 are group winners, seeds 4–6 are runners-up, and seeds 7–8 are the two wildcards; use the same ranking criteria within each tier. All eight teams play in the quarterfinals. No byes." : "The full eight-team draw pairs A1 vs B4, A2 vs B3, B1 vs A4, and B2 vs A3. All qualifiers must satisfy the three-loss rule. If fewer teams qualify, the handling of unfilled playoff places must be confirmed before seeding."}</p></li>
            <li><strong>Semifinals, final & third place</strong><p>Quarterfinal winners advance to the semifinals. Semifinal winners meet for the championship; semifinal losers play for third place.</p></li>
          </ol>
          <details className="elimination-matchups"><summary>Exact matchups & advancement <ChevronDown size={16} aria-hidden="true" /></summary><div>
            <p className="elimination-seed-key">A1 means Group A, rank 1. Other seeds follow the same pattern.</p>
            {senior && <><h4>Round of 12</h4><p>R1: A2 vs B3 · R2: C2 vs D3<br />R3: B2 vs A3 · R4: D2 vs C3</p></>}
            <h4>Quarterfinals</h4><p>{senior ? <>Q1: A1 vs winner of R2<br />Q2: B1 vs winner of R4<br />Q3: C1 vs winner of R1<br />Q4: D1 vs winner of R3</> : format.juniorWildcards ? <>Seeds 1–3: group winners · Seeds 4–6: runners-up · Seeds 7–8: wildcards.<br />Q1: 1 vs 8 · Q2: 2 vs 7<br />Q3: 4 vs 5 · Q4: 3 vs 6</> : <>Q1: A1 vs B4 · Q2: A2 vs B3<br />Q3: B1 vs A4 · Q4: B2 vs A3</>}</p>
            <h4>Semifinals</h4><p><>West: winner of Q1 vs winner of Q3.<br />East: winner of Q2 vs winner of Q4.</></p>
            <p>The West and East winners meet in the championship final.</p>
          </div></details>
          <Link className="elimination-rule-link" href={`/playoffs?division=${value}`}><Trophy size={15} aria-hidden="true" />View {senior ? "Open" : "Junior"} playoff bracket<ArrowRight size={15} aria-hidden="true" /></Link>
        </article>;
      })}
    </div>
    <div className="elimination-shared-rules"><h3><ShieldCheck size={19} aria-hidden="true" />Rules for both divisions</h3><ul>
      <li><strong>Every knockout game is single elimination.</strong> One game decides who advances. Losing ends the title run; semifinal losers still contest third place. There is no twice-to-beat advantage or best-of series.</li>
      <li><strong>Tied games require overtime.</strong> A winner must be determined before a result can be confirmed.</li>
      <li><strong>Only confirmed results count.</strong> All group games must be confirmed, and qualification ties and relevant protests resolved, before playoff seeding becomes official.</li>
    </ul>
    <details className="elimination-matchups"><summary>How tied standings are ranked <ChevronDown size={16} aria-hidden="true" /></summary><div>
      <p><strong>First, rank by total confirmed wins.</strong> If teams have the same wins, apply the division’s tiebreakers below.</p>
      <p><strong>Junior:</strong> head-to-head / wins among the tied teams, then point difference among those teams, points scored among those teams, overall point difference, and overall points scored.</p>
      <p><strong>Open (Senior):</strong> for two tied teams, use their head-to-head result first. For three or more, start with point difference among the tied teams. Next compare points scored among the tied teams, overall point difference, and overall points scored.</p>
      <p>A mini-league uses only games between the tied teams. Point difference means points scored minus points conceded. When a tied set splits, the remaining tied subset is recalculated. If teams are still tied after every criterion, the organizer must record the final seed order before seeding.</p>
    </div></details></div>
  </section>;
}
