import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ProfileCard from "@/components/ProfileCard";
import sample from "./sample.json";

// Staging route for the profile card.
//
// It prefers a real snapshot but falls back to a trimmed fixture, so the card
// can be designed while storage is being reworked. The card itself takes `stats`
// as a prop, so moving it into the dashboard is just passing that page's data in
// — and this route, with its fixture, goes away at that point.
function snapshot() {
  const dir = path.join(process.cwd(), "data", "users");
  try {
    const file = readdirSync(dir).find((f) => f.endsWith(".json"));
    if (file) return JSON.parse(readFileSync(path.join(dir, file), "utf8"));
  } catch {
    /* no local snapshots — fall through to the fixture */
  }
  return sample;
}

export default function CardPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[1120px] items-center justify-center px-6 py-16">
      <ProfileCard stats={snapshot()} />
    </main>
  );
}
