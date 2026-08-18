import { compact, prettyDate } from "@/lib/format";

const W = 1000, H = 132, PAD = 4;

export default function PromptChart({ calendar, average }) {
  const days = calendar;
  const max = Math.max(1, ...days.map((d) => d.prompts));
  const bw = W / days.length;

  // 7-day trailing mean, so the shape reads through the daily spikiness.
  const roll = days.map((_, i) => {
    const from = Math.max(0, i - 6);
    const win = days.slice(from, i + 1);
    return win.reduce((n, d) => n + d.prompts, 0) / win.length;
  });

  const y = (v) => H - PAD - (v / max) * (H - PAD * 2);
  const line = roll.map((v, i) => `${i === 0 ? "M" : "L"}${(i * bw + bw / 2).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const peak = days.reduce((m, d) => (d.prompts > m.prompts ? d : m), days[0]);

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-3">
        <div>
          <h2 className="text-[13px] font-medium text-ink">Prompts per day</h2>
          <p className="text-[12px] text-faint mt-0.5">
            Daily volume with a 7-day trailing average
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[20px] font-semibold nums text-ink leading-none">{average}</div>
          <div className="text-[11px] text-faint mt-1">avg / prompting day</div>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[132px]" preserveAspectRatio="none" role="img"
           aria-label={`Prompts per day. Peak ${peak.prompts} on ${peak.date}.`}>
        <defs>
          <linearGradient id="barG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#47d364" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#47d364" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        {days.map((d, i) => {
          if (!d.prompts) return null;
          const h = Math.max(1, (d.prompts / max) * (H - PAD * 2));
          return (
            <rect key={d.date} x={i * bw} y={H - PAD - h} width={Math.max(0.8, bw - 0.6)} height={h}
                  fill="url(#barG)" rx={0.5} />
          );
        })}
        <path d={line} fill="none" stroke="#8a9099" strokeWidth="1.25" strokeOpacity="0.9"
              vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="flex justify-between text-[10px] text-faint mt-2 nums">
        <span>{prettyDate(days[0].date)}</span>
        <span className="text-muted">peak {peak.prompts} on {prettyDate(peak.date)}</span>
        <span>{prettyDate(days[days.length - 1].date)}</span>
      </div>
    </div>
  );
}
