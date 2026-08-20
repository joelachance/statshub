import ToolIcon from "@/components/ToolIcon";
import ProfileCard from "@/components/ProfileCard";

const SOURCES = [
  ["claude", "Claude Code"], ["codex", "Codex"], ["cursor", "Cursor"],
  ["opencode", "opencode"], ["pi", "pi"], ["github", "GitHub"],
];

export default function SignIn({ error, count, configured, isApp, card, cardIsLive }) {
  return (
    <main className="mx-auto grid max-w-[1120px] items-center gap-x-16 gap-y-14 px-6 py-16 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:py-24">
      <div>
        <h1 className="text-[30px] font-semibold tracking-tight text-ink">statshub</h1>
        <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-muted">
          One page for everything you built this year — tokens burned, prompts sent, commits
          and pull requests, across every agent you use.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
          {SOURCES.map(([slug, label]) => (
            <span key={slug} className="flex items-center gap-1.5 text-[12px] text-faint">
              <ToolIcon tool={slug} size={13} style={{ color: `var(--color-${slug})` }} />
              {label}
            </span>
          ))}
        </div>

        {error && (
          <p className="mt-8 rounded-lg border border-line bg-panel px-4 py-3 text-[13px] text-ink">
            {error}
          </p>
        )}

        {configured ? (
          <a
            href="/api/auth/github"
            className="mt-9 inline-flex items-center gap-2.5 rounded-lg bg-ink px-5 py-3 text-[14px] font-medium text-bg transition-opacity hover:opacity-90"
          >
            <ToolIcon tool="github" size={16} />
            {isApp ? "Install and sign in with GitHub" : "Sign in with GitHub"}
          </a>
        ) : (
          <p className="mt-9 text-[13px] text-muted">
            Set <code className="text-ink">DATABASE_URL</code> and the GitHub variables to enable sign-in.
          </p>
        )}

        <p className="mt-4 max-w-[46ch] text-[12px] leading-relaxed text-faint">
          {isApp
            ? "Installing lets statshub count your private commits and pull requests as well as public ones. Choose the account and any organisations whose work should count."
            : "Signing in reads your GitHub activity."}{" "}
          Agent stats come from a command you run locally.
        </p>

        {count > 0 && (
          <p className="mt-10 text-[12px] text-faint">
            {count} {count === 1 ? "profile" : "profiles"} published
          </p>
        )}
      </div>

      <div className="tilt-stage">
        <ProfileCard stats={card} />
        <p className="sr-only">
          {cardIsLive ? "A published profile." : "An example profile."}
        </p>
      </div>
    </main>
  );
}
