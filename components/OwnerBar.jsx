"use client";
import { useState } from "react";

/** Only rendered for the signed-in owner of the page. */
export default function OwnerBar({ slug, hasAgents, freshKey, keyPrefix, needsInstall, privateContributions }) {
  const [copied, setCopied] = useState(false);
  const cmd = `npx statshub ${freshKey || (keyPrefix ? keyPrefix + "…" : "")}`.trim();
  const canCopy = Boolean(freshKey);

  return (
    <div className="border-b border-line bg-panel">
      <div className="mx-auto max-w-[1100px] px-6 py-3 flex flex-wrap items-center gap-x-5 gap-y-3">
        <span className="text-[12px] text-faint">Your page · only you see this bar</span>

        <div className="flex items-center gap-2 min-w-0">
          <code className="text-[12px] text-ink bg-bg border border-line rounded px-2.5 py-1.5 truncate nums">
            {freshKey ? `npx statshub ${freshKey}` : keyPrefix ? `npx statshub ${keyPrefix}…` : "no key yet"}
          </code>
          {canCopy && (
            <button
              onClick={() => { navigator.clipboard?.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
              className="text-[12px] text-muted hover:text-ink transition-colors shrink-0"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>

        {freshKey && (
          <span className="text-[12px] text-faint">Copy it now — it is not shown again.</span>
        )}

        <div className="flex items-center gap-4 ml-auto">
          <form action="/api/key" method="post">
            <button className="text-[12px] text-muted hover:text-ink transition-colors">
              {keyPrefix ? "New key" : "Get key"}
            </button>
          </form>
          <form action="/api/refresh" method="post">
            <button className="text-[12px] text-muted hover:text-ink transition-colors">Refresh GitHub</button>
          </form>
          <form action="/api/auth/logout" method="post">
            <button className="text-[12px] text-faint hover:text-ink transition-colors">Sign out</button>
          </form>
        </div>
      </div>

      {needsInstall && (
        <div className="mx-auto max-w-[1100px] px-6 pb-3">
          <div className="rounded-lg border border-line bg-bg px-4 py-3 text-[12.5px] leading-relaxed">
            <span className="text-ink">Private work is not being counted.</span>{" "}
            <span className="text-muted">
              {"Authorising the app is not enough — GitHub only reveals an account's private repositories to apps "}
              <em>installed</em>
              {privateContributions
                ? ` on it, and you have ${privateContributions.toLocaleString()} private contributions in this window. `
                : " on it. "}
              Install it on your account and on any organisation whose work should count.
            </span>{" "}
            <a href="/api/auth/install" className="text-ink underline underline-offset-2 whitespace-nowrap">
              Install now
            </a>
          </div>
        </div>
      )}

      {!hasAgents && (
        <div className="mx-auto max-w-[1100px] px-6 pb-3 text-[12px] text-muted">
          No agent data yet — run the command above to add tokens, prompts and sessions.
        </div>
      )}
    </div>
  );
}
