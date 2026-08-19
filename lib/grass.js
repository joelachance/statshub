/** Quintile-ish thresholds from the data itself, so the grid never washes out. */
export function makeScale(cells) {
  const vals = cells.map((c) => c.score).filter((v) => v > 0).sort((a, b) => a - b);
  if (!vals.length) return () => 0;
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))];
  const t = [q(0.25), q(0.5), q(0.75), q(0.92)];
  return (v) => (v <= 0 ? 0 : v <= t[0] ? 1 : v <= t[1] ? 2 : v <= t[2] ? 3 : 4);
}

/** The calendar is dense and starts on a Sunday, so chunks of 7 are columns. */
export function toWeeks(cells) {
  const w = [];
  for (let i = 0; i < cells.length; i += 7) w.push(cells.slice(i, i + 7));
  return w;
}
