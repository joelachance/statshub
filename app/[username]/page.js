import { notFound } from "next/navigation";
import { allUsers, getUser } from "@/lib/users";
import Dashboard from "@/components/Dashboard";

// Every synced user becomes a static page at build time.
export function generateStaticParams() {
  return allUsers().map((u) => ({ username: u.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }) {
  const { username } = await params;
  const u = getUser(username);
  if (!u) return {};
  const name = u.profile?.name || u.slug;
  return {
    title: `${name} — engineering activity`,
    description: `${u.headline.prompts.toLocaleString()} prompts, ${u.headline.commits.toLocaleString()} commits and ${(u.headline.tokens / 1e6).toFixed(0)}M tokens over the last 12 months.`,
  };
}

export default async function UserPage({ params }) {
  const { username } = await params;
  const stats = getUser(username);
  if (!stats) notFound();
  return <Dashboard stats={stats} />;
}
