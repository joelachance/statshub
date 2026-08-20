import { redirect } from "next/navigation";
import { listUserSlugs, showcaseProfile, configured } from "@/lib/store";
import { getSession } from "@/lib/session";
import { buildSnapshot } from "@/lib/snapshot.mjs";
import { isGitHubApp } from "@/lib/ghapp";
import SignIn from "@/components/SignIn";
import sample from "@/lib/sample-card.json";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }) {
  const slug = await getSession();
  if (slug) redirect(`/${slug}`);

  const { error } = await searchParams;
  const count = configured() ? (await listUserSlugs()).length : 0;

  // Show a real card when someone has published one, so the landing page is
  // the product rather than a mock-up of it.
  const row = configured() ? await showcaseProfile() : null;
  const card = row
    ? buildSnapshot({ user: row, agents: row.agents, gh: row.github })
    : sample;

  return (
    <SignIn
      error={error}
      count={count}
      configured={configured()}
      isApp={isGitHubApp()}
      card={card}
      cardIsLive={Boolean(row)}
    />
  );
}
