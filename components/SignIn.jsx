import ToolIcon from "@/components/ToolIcon";

const SOURCES = [
  ["claude", "Claude Code"], ["codex", "Codex"], ["cursor", "Cursor"],
  ["opencode", "opencode"], ["pi", "pi"], ["github", "GitHub"],
];

export default function SignIn({ error, count, configured, isApp }) {
  return (
    <main className="mx-auto max-w-[520px] px-6 py-24">
      <h1 className="text-[26px] font-semibold text-ink tracking-tight">statshub</h1>
      <p className="text-[14px] text-muted mt-3 leading-relaxed">
        One page for everything you built this year — tokens burned, prompts sent, commits
        and pull requests, across every agent you use.
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-7">
        {SOURCES.map(([slug, label]) => (
          <span key={slug} className="flex items-center gap-1.5 text-[12px] text-faint">
            <ToolIcon tool={slug} size={13} style={{ color: `var(--color-${slug})` }} />
            {label}
          </span>
        ))}
      </div>

      {error && (
        <p className="mt-7 rounded-lg border border-line bg-panel px-4 py-3 text-[13px] text-ink">
          {error}
        </p>
      )}

      {configured ? (
        <a
          href="/api/auth/github"
          className="mt-8 inline-flex items-center gap-2.5 rounded-lg bg-ink px-5 py-3 text-[14px] font-medium text-bg hover:opacity-90 transition-opacity"
        >
          <ToolIcon tool="github" size={16} />
          {isApp ? "Install and sign in with GitHub" : "Sign in with GitHub"}
        </a>
      ) : (
        <p className="mt-8 text-[13px] text-muted">
          Set <code className="text-ink">DATABASE_URL</code> and the GitHub OAuth variables to enable sign-in.
        </p>
      )}

      <p className="text-[12px] text-faint mt-4">
        {isApp
          ? "Installing lets statshub count your private commits and pull requests as well as public ones. Choose the account and any organisations whose work should count."
          : "Signing in reads your GitHub activity."}{" "}
        Agent stats come from a command you run locally.
      </p>

      {count > 0 && <p className="text-[12px] text-faint mt-10">{count} {count === 1 ? "profile" : "profiles"} published</p>}
    </main>
  );
}
