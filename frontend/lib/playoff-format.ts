export type PlayoffSlot = {
  key: string; label: string; number: number; x: number; y: number; home: string; away: string;
};

export function playoffFormat(division: string) {
  const senior = division === "Senior";
  const step = senior ? 328 : 368;
  const quarterX = senior ? 16 + step : 16;
  const semiX = quarterX + step;
  const finalX = semiX + step;
  const qStart = senior ? 29 : 31;
  const quarter = [
    { key: "Q1", home: senior ? "A1 · Group A winner · bye" : "A1 · Group A rank 1", away: senior ? "Winner of Game 26" : "B4 · Group B rank 4" },
    { key: "Q3", home: senior ? "C1 · Group C winner · bye" : "B1 · Group B rank 1", away: senior ? "Winner of Game 25" : "A4 · Group A rank 4" },
    { key: "Q2", home: senior ? "B1 · Group B winner · bye" : "A2 · Group A rank 2", away: senior ? "Winner of Game 28" : "B3 · Group B rank 3" },
    { key: "Q4", home: senior ? "D1 · Group D winner · bye" : "B2 · Group B rank 2", away: senior ? "Winner of Game 27" : "A3 · Group A rank 3" },
  ].map((slot, i) => ({ ...slot, label: `Quarterfinal ${slot.key.slice(1)}`, number: qStart + Number(slot.key.slice(1)) - 1, x: quarterX, y: 72 + i * 176 }));
  const semiStart = senior ? 33 : 35;
  const slots: PlayoffSlot[] = [
    ...quarter,
    { key: "S1", label: "Semifinal 1", number: semiStart, x: semiX, y: 160, home: `Winner of Game ${qStart}`, away: `Winner of Game ${qStart + 2}` },
    { key: "S2", label: "Semifinal 2", number: semiStart + 1, x: semiX, y: 512, home: `Winner of Game ${qStart + 1}`, away: `Winner of Game ${qStart + 3}` },
    { key: "F", label: "Championship", number: semiStart + 3, x: finalX, y: 336, home: `Winner of Game ${semiStart}`, away: `Winner of Game ${semiStart + 1}` },
    { key: "T", label: "Third place", number: semiStart + 2, x: finalX, y: 600, home: `Loser of Game ${semiStart}`, away: `Loser of Game ${semiStart + 1}` },
  ];
  const connections = [["Q1", "S1"], ["Q3", "S1"], ["Q2", "S2"], ["Q4", "S2"], ["S1", "F"], ["S2", "F"]];
  if (senior) {
    const entries = [
      { key: "R1", y: 248, home: "A2 · Group A rank 2", away: "B3 · Group B rank 3" },
      { key: "R2", y: 72, home: "C2 · Group C rank 2", away: "D3 · Group D rank 3" },
      { key: "R3", y: 600, home: "B2 · Group B rank 2", away: "A3 · Group A rank 3" },
      { key: "R4", y: 424, home: "D2 · Group D rank 2", away: "C3 · Group C rank 3" },
    ];
    for (const [index, entry] of entries.entries()) slots.push({ ...entry, label: `Round of 12 · Match ${index + 1}`, number: 25 + index, x: 16 });
    connections.unshift(["R2", "Q1"], ["R1", "Q3"], ["R4", "Q2"], ["R3", "Q4"]);
  }
  return {
    senior, slots, connections, width: finalX + 296,
    rounds: [...(senior ? [{ label: "Round of 12", x: 16 }] : []), { label: "Quarterfinals", x: quarterX }, { label: "Semifinals", x: semiX }, { label: "Championship", x: finalX }],
    teams: senior ? 16 : 12, groupSizes: senior ? [4, 4, 4, 4] : [6, 6], qualifiers: senior ? 12 : 8, totalGames: senior ? 36 : 38,
  };
}
