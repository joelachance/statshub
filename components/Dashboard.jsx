import Grass from "@/components/Grass";
import PromptChart from "@/components/PromptChart";
import Tools from "@/components/Tools";
import Repos from "@/components/Repos";
import { Stat, Panel } from "@/components/Stat";
import { compact, full, prettyDate } from "@/lib/format";

export default function Dashboard({ stats }) {
  const h = stats.headline;
  const p = stats.profile;

  const generated = new Date(stats.generatedAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  return (
    <main className="mx-auto max-w-[1120px] px-6 py-14">
      {/* ---- header ---- */}
      <header className="flex items-start justify-between gap-x-6 gap-y-4 flex-wrap mb-10">
        <div className="flex items-center gap-4">
          {p.avatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.avatar} alt="" width={52} height={52}
                 className="rounded-full border border-line" />
          )}
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-ink leading-tight">
              {p.name || "Engineering activity"}
            </h1>
            <p className="text-[13px] text-muted mt-0.5">
              {p.login && (
                <a href={`https://github.com/${p.login}`} className="hover:text-ink transition-colors">
                  @{p.login}
                </a>
              )}
              {p.bio && <span className="text-faint"> · {p.bio}</span>}
            </p>
          </div>
        </div>

        <div className="text-left sm:text-right">
          <div className="text-[12px] text-muted">Last 12 months</div>
          <div className="text-[11px] text-faint nums mt-0.5">
            {prettyDate(stats.windowStart)} — {prettyDate(stats.windowEnd)}
          </div>
          <div className="text-[11px] text-faint mt-0.5">synced {generated}</div>
        </div>
      </header>

      {/* ---- headline ---- */}
      <div className="grid gap-3 mb-4 grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Token burn"
          value={compact(h.tokens)}
          exact={h.tokens}
          accent="var(--color-claude)"
          sub={`+${compact(h.cachedTokens)} cached reads`}
        />
        <Stat
          label="Prompts"
          value={full(h.prompts)}
          exact={h.prompts}
          accent="var(--color-codex)"
          sub={`${h.promptsPerPromptDay}/day over ${h.promptDays} days`}
        />
        <Stat
          label="Commits"
          value={full(h.commits)}
          exact={h.commits}
          accent="var(--color-github)"
          sub={`${full(h.commitsAllTime)} all time`}
        />
        <Stat
          label="Pull requests"
          value={full(h.prs)}
          exact={h.prs}
          accent="var(--color-cursor)"
          sub={`${full(h.prsMerged)} merged · ${full(h.prsAllTime)} all time`}
        />
      </div>

      {/* ---- grass ---- */}
      <Panel className="mb-4">
        <Grass calendar={stats.calendar} />
      </Panel>

      {/* ---- secondary ---- */}
      <div className="grid gap-3 mb-4 grid-cols-2 lg:grid-cols-4">
        <Stat label="Current streak" value={`${h.current}d`} sub={`longest ${h.longest}d`} />
        <Stat label="Active days" value={full(h.activeDays)} sub={`of ${stats.windowDays} in window`} />
        <Stat label="Agent sessions" value={full(h.sessions)} exact={h.sessions} sub={`${full(h.repos)} repositories`} />
        <Stat
          label="Busiest day"
          value={full(h.peakDay?.prompts)}
          sub={h.peakDay ? `prompts on ${prettyDate(h.peakDay.date)}` : ""}
        />
      </div>

      {/* ---- chart ---- */}
      <Panel className="mb-4">
        <PromptChart calendar={stats.calendar} average={h.promptsPerPromptDay} />
      </Panel>

      {/* ---- breakdown ---- */}
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Panel title="By tool" hint="Prompt volume and token spend across agents">
          <Tools tools={stats.tools} />
        </Panel>
        <Panel title="Top repositories" hint="Public commit activity in the window">
          <Repos repos={stats.repos} />
        </Panel>
      </div>

      <footer className="mt-10 pt-6 border-t border-line-soft text-[11px] text-faint leading-relaxed">
        <p>
          Aggregated from local Claude Code, Codex and Cursor session logs plus the GitHub API.
          Claude token usage is deduplicated per API request and Codex uses per-turn deltas, so
          totals reflect real spend rather than repeated log entries. Commit and PR counts come
          from authenticated search and include private repositories
          {h.publicCommits ? ` (the public-only counter reports ${full(h.publicCommits)} commits)` : ""}.
          Cursor does not expose token counts.
        </p>
      </footer>
    </main>
  );
}
