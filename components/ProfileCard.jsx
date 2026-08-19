"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import WaveField from "@/components/WaveField";
import CardGrass from "@/components/CardGrass";
import ToolIcon, { TOOL_ICONS } from "@/components/ToolIcon";
import { compact, full, monthLabel } from "@/lib/format";

// Cursor-driven perspective tilt, after the GSAP demo: pointer position across
// the viewport drives the card's rotationX/rotationY. The content sits at a real
// translateZ inside a preserve-3d card, so the perspective parallaxes it as
// something standing above the face — no counter-translation, which is what made
// it read as recessed. `quickTo` keeps one reusable tween per property, so a
// pointermove flood costs nothing: it retargets the existing tween rather than
// spawning new ones.
const TILT = 12; // degrees at the edges of the viewport
const GLARE = 40; // px the highlight travels

export default function ProfileCard({ stats }) {
  const card = useRef(null);
  const glare = useRef(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ease = "power3";
    const rx = gsap.quickTo(card.current, "rotationX", { ease });
    const ry = gsap.quickTo(card.current, "rotationY", { ease });
    const gx = gsap.quickTo(glare.current, "x", { ease });
    const gy = gsap.quickTo(glare.current, "y", { ease });
    const go = gsap.quickTo(glare.current, "opacity", { ease });

    const { interpolate } = gsap.utils;

    const move = (e) => {
      if (e.pointerType === "touch") return;
      const px = e.clientX / window.innerWidth;
      const py = e.clientY / window.innerHeight;
      rx(interpolate(TILT, -TILT, py));
      ry(interpolate(-TILT, TILT, px));
      gx(interpolate(-GLARE, GLARE, px));
      gy(interpolate(-GLARE, GLARE, py));
      go(1);
    };

    // Settle back to square when the pointer leaves the window entirely.
    const rest = () => {
      rx(0); ry(0); gx(0); gy(0); go(0.45);
    };

    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", rest);

    // Only the listeners are torn down. Killing the quickTo tweens here is
    // unsafe: under StrictMode's double-invoke the cleanup can land after the
    // second effect has built its tweens, leaving a live listener driving dead
    // ones — the card stops tilting. They are collected with the elements.
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", rest);
    };
  }, []);

  const h = stats.headline;
  const p = stats.profile;
  const built = (stats.tools || []).map((t) => t.slug).filter((slug) => TOOL_ICONS[slug]);
  const from = stats.calendar[0]?.date;
  const to = stats.calendar[stats.calendar.length - 1]?.date;

  return (
    <div className="tilt-stage">
      <article ref={card} className="tilt-card">
        {/* The card's own surface: contours, plus a sheen tracking the cursor. */}
        <div className="tilt-face">
          <WaveField />
          <div
            ref={glare}
            className="pointer-events-none absolute left-1/2 top-1/2 h-[150%] w-[150%]
                       -translate-x-1/2 -translate-y-1/2 opacity-45"
            style={{
              background:
                "radial-gradient(closest-side, rgba(255,255,255,.11), rgba(255,255,255,.03) 45%, transparent 72%)",
            }}
          />
        </div>

        <div className="tilt-content">
          <div className="flex flex-1 flex-col px-[26px] pt-[42px]">
            <div className="flex items-center gap-5 pl-[12px]">
              {p.avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.avatar}
                  alt=""
                  width={132}
                  height={132}
                  className="h-[132px] w-[132px] shrink-0 rounded-full ring-1 ring-white/20
                             shadow-[0_16px_40px_-10px_rgba(0,0,0,.95)]"
                />
              )}
              <div className="min-w-0">
                <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-ink">
                  {p.name || p.login}
                </h1>
                {p.login && (
                  <a
                    href={`https://github.com/${p.login}`}
                    className="mt-1 block truncate text-[13px] text-muted transition-colors hover:text-ink"
                  >
                    @{p.login}
                  </a>
                )}
                {p.bio && <p className="mt-2 text-[12px] text-faint">{p.bio}</p>}
              </div>
            </div>

            {built.length > 0 && (
              <div className="mt-auto flex items-center gap-3 pt-8">
                <span className="text-[9.5px] uppercase tracking-[.11em] text-faint">
                  Built with
                </span>
                <span className="flex items-center gap-2.5">
                  {built.map((slug) => (
                    <span key={slug} style={{ color: TOOL_ICONS[slug].color }} className="opacity-85">
                      <ToolIcon tool={slug} size={15} />
                    </span>
                  ))}
                </span>
              </div>
            )}

            <div className="mt-5 grid w-full grid-cols-3 gap-2">
              {[
                ["Tokens", compact(h.tokens), h.tokens],
                ["Prompts", full(h.prompts), h.prompts],
                ["Commits", full(h.commits), h.commits],
              ].map(([label, value, exact]) => (
                <div key={label}>
                  <div
                    className="nums text-[20px] font-semibold leading-none text-ink"
                    title={full(exact)}
                  >
                    {value}
                  </div>
                  <div className="mt-1.5 text-[9.5px] uppercase tracking-[.11em] text-faint">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ---- activity, along the bottom edge ---- */}
          <div className="px-[26px] pb-7 pt-6">
            <div className="mb-2.5 flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-[.11em] text-muted">
                Activity
              </span>
              <span className="nums text-[10px] text-faint">
                {from && to && `${monthLabel(from)} ${from.slice(0, 4)} — ${monthLabel(to)} ${to.slice(0, 4)}`}
                {" · "}
                {full(h.activeDays)} active days
              </span>
            </div>
            <CardGrass calendar={stats.calendar} />
          </div>
        </div>
      </article>
    </div>
  );
}
