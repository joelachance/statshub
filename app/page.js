import { redirect } from "next/navigation";
import { listUserSlugs, configured } from "@/lib/store";
import { getSession } from "@/lib/session";
import SignIn from "@/components/SignIn";
import { isGitHubApp } from "@/lib/ghapp";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }) {
  const slug = await getSession();
  if (slug) redirect(`/${slug}`);

  const { error } = await searchParams;
  const count = configured() ? (await listUserSlugs()).length : 0;
  return <SignIn error={error} count={count} configured={configured()} isApp={isGitHubApp()} />;
}
