import { compact, full } from "@/lib/format";

export function Stat({ label, value, exact, sub, accent }) {
  return (
    <div className="relative rounded-xl border border-line bg-panel px-5 py-4 overflow-hidden">
      {accent && (
        <span className="absolute left-0 top-0 h-full w-[2px]" style={{ background: accent }} />
      )}
      <div className="text-[11px] uppercase tracking-[.08em] text-faint">{label}</div>
      <div
        className="mt-2 text-[30px] leading-none font-semibold nums text-ink"
        title={exact != null ? full(exact) : undefined}
      >
        {value}
      </div>
      {sub && <div className="mt-2 text-[11px] text-muted nums">{sub}</div>}
    </div>
  );
}

export function Panel({ title, hint, children, className = "" }) {
  return (
    <section className={`rounded-xl border border-line bg-panel p-5 ${className}`}>
      {title && (
        <div className="mb-4">
          <h2 className="text-[13px] font-medium text-ink">{title}</h2>
          {hint && <p className="text-[12px] text-faint mt-0.5">{hint}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

export { compact };
