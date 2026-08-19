"use client";

import { useMemo, useState } from "react";
import { compact, full, monthLabel, prettyDate } from "@/lib/format";

const TOOLS = [
  ["claude", "Claude Code", "var(--color-claude)"],
  ["codex", "Codex", "var(--color-codex)"],
  ["cursor", "Cursor", "var(--color-cursor)"],
  ["opencode", "opencode", "var(--color-opencode)"],
  ["pi", "pi", "var(--color-pi)"],
];

/** Quintile-ish thresholds from the data itself, so the grid never washes out. */
function useScale(cells) {
  return useMemo(() => {
    const vals = cells.map((c) => c.score).filter((v) => v > 0).sort((a, b) => a - b);
    if (!vals.length) return () => 0;
    const q = (p) => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))];
    const t = [q(0.25), q(0.5), q(0.75), q(0.92)];
    return (v) => (v <= 0 ? 0 : v <= t[0] ? 1 : v <= t[1] ? 2 : v <= t[2] ? 3 : 4);
  }, [cells]);
}

export default function Grass({ calendar }) {
  const [hover, setHover] = useState(null);
  const level = useScale(calendar);

  // Calendar is dense and starts on a Sunday, so straight chunks of 7 are columns.
  const weeks = useMemo(() => {
    const w = [];
    for (let i = 0; i < calendar.length; i += 7) w.push(calendar.slice(i, i + 7));
    return w;
  }, [calendar]);

  // One label per month, placed on the week where that month first appears.
  const months = useMemo(() => {
    const out = []; let last = null;
    weeks.forEach((wk, i) => {
      const first = wk[0]; if (!first) return;
      const m = first.date.slice(0, 7);
      if (m !== last && i < weeks.length - 1) { out.push({ i, label: monthLabel(first.date) }); last = m; }
    });
    return out.filter((m, i) => i === 0 || m.i - out[i - 1].i >= 3);
  }, [weeks]);

  const shown = hover ?? null;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-[13px] font-medium tracking-wide text-ink">Activity</h2>
          <p className="text-[12px] text-faint mt-0.5">
            Prompts and commits per day, all tools combined
          </p>
        </div>
        <div className="min-h-[34px] text-right">
          {shown ? (
            <div className="animate-[fadeIn_.12s_ease-out]">
              <div className="text-[12px] text-ink nums">{prettyDate(shown.date)}</div>
              <div className="text-[11px] text-muted nums mt-0.5">
                {shown.prompts ? `${full(shown.prompts)} prompts` : "no prompts"}
                {shown.contributions ? ` · ${full(shown.contributions)} contributions` : ""}
                {shown.tokens ? ` · ${compact(shown.tokens)} tokens` : ""}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-faint">Hover a day</div>
          )}
        </div>
      </div>

      {/* Weeks are flex-1 columns with square cells, so the grid fills whatever
          width it is given and still scrolls horizontally on narrow screens. */}
      <div className="overflow-x-auto pb-1 -mx-1 px-1">
        <div className="min-w-[660px]">
          {/* month ruler, aligned to the track that starts after the gutter */}
          <div className="flex">
            <div className="w-[18px] shrink-0" />
            <div className="relative flex-1 h-4">
              {months.map((m) => (
                <span key={m.i} className="absolute top-0 text-[10px] text-faint whitespace-nowrap"
                      style={{ left: `${(m.i / weeks.length) * 100}%` }}>
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex">
            {/* weekday gutter */}
            <div className="flex flex-col gap-[3px] w-[18px] shrink-0 pr-[6px]">
              {["", "M", "", "W", "", "F", ""].map((d, i) => (
                <span key={i} className="aspect-square text-[9px] leading-none flex items-center text-faint">{d}</span>
              ))}
            </div>

            <div className="flex gap-[3px] flex-1">
              {weeks.map((wk, wi) => (
                <div key={wi} className="flex flex-col gap-[3px] flex-1 min-w-0">
                  {wk.map((c) => {
                    const l = level(c.score);
                    const on = shown?.date === c.date;
                    return (
                      <button
                        key={c.date}
                        type="button"
                        aria-label={`${c.date}: ${c.prompts} prompts, ${c.contributions} contributions`}
                        onMouseEnter={() => setHover(c)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(c)}
                        onBlur={() => setHover(null)}
                        className="w-full aspect-square rounded-[2px] outline-none transition-transform duration-100"
                        style={{
                          background: `var(--color-grass-${l})`,
                          boxShadow: on ? "0 0 0 1.5px var(--color-ink)" : "inset 0 0 0 1px rgba(255,255,255,.035)",
                          transform: on ? "scale(1.3)" : "none",
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
        <div className="flex items-center gap-3 text-[10px] text-faint">
          {TOOLS.map(([slug, label, color]) => (
            <span key={slug} className="flex items-center gap-1.5">
              <i className="h-[7px] w-[7px] rounded-full" style={{ background: color }} />
              {label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <i className="h-[7px] w-[7px] rounded-full" style={{ background: "var(--color-github)" }} />
            GitHub
          </span>
        </div>
        <div className="flex items-center gap-[3px] text-[10px] text-faint">
          <span className="mr-1">Less</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <i key={l} className="h-[10px] w-[10px] rounded-[2px]" style={{ background: `var(--color-grass-${l})` }} />
          ))}
          <span className="ml-1">More</span>
        </div>
      </div>

      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
    </div>
  );
}
