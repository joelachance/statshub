import { notFound } from "next/navigation";
import { getUserBySlug, getHalves } from "@/lib/store";
import { getSession } from "@/lib/session";
import { buildSnapshot } from "@/lib/snapshot.mjs";
import Dashboard from "@/components/Dashboard";
import OwnerBar from "@/components/OwnerBar";
import { isGitHubApp } from "@/lib/ghapp";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { username } = await params;
  const user = await getUserBySlug(username);
  if (!user) return { title: "Not found" };
  const { agents, github } = await getHalves(user.slug);
  const h = buildSnapshot({ user, agents, gh: github }).headline;
  return {
    title: `${user.name || user.slug} — engineering activity`,
    description: `${h.prompts.toLocaleString()} prompts, ${h.commits.toLocaleString()} commits and ${(h.tokens / 1e6).toFixed(0)}M tokens over the last 12 months.`,
  };
}

export default async function UserPage({ params, searchParams }) {
  const { username } = await params;
  const user = await getUserBySlug(username);
  if (!user) notFound();

  const { agents, github } = await getHalves(user.slug);
  const stats = buildSnapshot({ user, agents, gh: github });
  const isOwner = (await getSession()) === user.slug;
  const { key } = await searchParams;

  return (
    <>
      {isOwner && (
        <OwnerBar
          slug={user.slug}
          hasAgents={stats.has.agents}
          freshKey={key}
          keyPrefix={user.key_prefix}
          needsInstall={isGitHubApp() && !user.gh_installations}
          privateContributions={stats.headline.privateContributions}
        />
      )}
      <Dashboard stats={stats} />
    </>
  );
}
