import { compact, full } from "@/lib/format";

const META = {
  claude: { color: "var(--color-claude)", note: "input + output, deduped per API request" },
  codex:  { color: "var(--color-codex)",  note: "per-turn deltas, not cumulative totals" },
  cursor: { color: "var(--color-cursor)", note: "Cursor does not expose token counts" },
};

export default function Tools({ tools }) {
  const agents = tools.filter((t) => t.slug !== "github");
  const maxTok = Math.max(1, ...agents.map((t) => t.tokens || 0));
  const maxPrompts = Math.max(1, ...agents.map((t) => t.prompts || 0));

  return (
    <div className="space-y-5">
      {agents.map((t) => {
        const m = META[t.slug] ?? {};
        const noTokens = t.tokensUnavailable;
        return (
          <div key={t.slug}>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span className="flex items-center gap-2 text-[13px] text-ink">
                <i className="h-[8px] w-[8px] rounded-full shrink-0" style={{ background: m.color }} />
                {t.label}
              </span>
              <span className="text-[11px] text-muted nums">
                {full(t.prompts)} prompts
                {t.sessions ? ` · ${full(t.sessions)} sessions` : ""}
              </span>
            </div>

            {/* prompts bar */}
            <div className="h-[6px] rounded-full bg-panel-2 overflow-hidden">
              <div className="h-full rounded-full transition-all"
                   style={{ width: `${((t.prompts || 0) / maxPrompts) * 100}%`, background: m.color, opacity: 0.9 }} />
            </div>

            <div className="flex items-baseline justify-between gap-3 mt-2">
              <span className="text-[11px] text-faint">{m.note}</span>
              <span className="text-[11px] nums text-muted">
                {noTokens ? "—" : `${compact(t.tokens)} tokens`}
              </span>
            </div>
            {!noTokens && (
              <div className="h-[3px] rounded-full bg-panel-2 overflow-hidden mt-1.5">
                <div className="h-full rounded-full"
                     style={{ width: `${((t.tokens || 0) / maxTok) * 100}%`, background: m.color, opacity: 0.45 }} />
              </div>
            )}
            {t.slug === "cursor" && t.linesAccepted > 0 && (
              <div className="text-[11px] text-faint mt-2 nums">
                {full(t.linesAccepted)} AI-written lines accepted
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
