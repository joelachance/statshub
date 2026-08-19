import { notFound } from "next/navigation";
import { getUser } from "@/lib/store";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { username } = await params;
  const u = await getUser(username);
  if (!u) return { title: "Not found" };
  const h = u.headline;
  return {
    title: `${u.profile?.name || u.slug} — engineering activity`,
    description: `${h.prompts.toLocaleString()} prompts, ${h.commits.toLocaleString()} commits and ${(h.tokens / 1e6).toFixed(0)}M tokens over the last 12 months.`,
  };
}

export default async function UserPage({ params }) {
  const { username } = await params;
  const stats = await getUser(username);
  if (!stats) notFound();
  return <Dashboard stats={stats} />;
}
