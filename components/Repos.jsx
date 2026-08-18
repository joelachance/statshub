import { full } from "@/lib/format";

export default function Repos({ repos }) {
  if (!repos?.length) return null;
  const max = Math.max(1, ...repos.map((r) => r.commits));
  return (
    <ul className="space-y-2.5">
      {repos.map((r) => (
        <li key={r.name} className="group">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] text-muted truncate group-hover:text-ink transition-colors">
              {r.name}
              {r.private && <span className="ml-1.5 text-[10px] text-faint">private</span>}
            </span>
            <span className="text-[11px] nums text-faint shrink-0">
              {full(r.commits)}
              {r.stars > 0 && <span className="ml-2">★ {full(r.stars)}</span>}
            </span>
          </div>
          <div className="h-[3px] rounded-full bg-panel-2 overflow-hidden mt-1.5">
            <div className="h-full rounded-full"
                 style={{ width: `${(r.commits / max) * 100}%`, background: "var(--color-github)", opacity: 0.5 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
