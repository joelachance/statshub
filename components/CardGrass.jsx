import { makeScale, toWeeks } from "@/lib/grass";

// The card's grass is a texture, not an instrument: no hover, no legend, just the
// year at a glance. The interactive grid lives in the panel further down the page.
export default function CardGrass({ calendar }) {
  const level = makeScale(calendar);
  const weeks = toWeeks(calendar);

  return (
    <div className="flex gap-[1.5px]">
      {weeks.map((wk, wi) => (
        <div key={wi} className="flex flex-col gap-[1.5px] flex-1 min-w-0">
          {wk.map((c) => (
            <i
              key={c.date}
              className="block w-full aspect-square rounded-[1px]"
              style={{ background: `var(--color-grass-${level(c.score)})` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
