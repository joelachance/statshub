import { notFound } from "next/navigation";
import { getUser, listUsers, usingBlob } from "@/lib/store";
import Dashboard from "@/components/Dashboard";

export const revalidate = 60;
// File mode prerenders the known set; hosted mode accepts profiles that were
// published after the last build.
export const dynamicParams = true;

export async function generateStaticParams() {
  if (usingBlob()) return [];
  return (await listUsers()).map((u) => ({ username: u.slug }));
}

export async function generateMetadata({ params }) {
  const { username } = await params;
  const u = await getUser(username);
  if (!u) return { title: "Not found" };
  const name = u.profile?.name || u.slug;
  const h = u.headline;
  return {
    title: `${name} — engineering activity`,
    description: `${h.prompts.toLocaleString()} prompts, ${h.commits.toLocaleString()} commits and ${(h.tokens / 1e6).toFixed(0)}M tokens over the last 12 months.`,
  };
}

export default async function UserPage({ params }) {
  const { username } = await params;
  const stats = await getUser(username);
  if (!stats) notFound();
  return <Dashboard stats={stats} />;
}
