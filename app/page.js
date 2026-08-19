import { redirect } from "next/navigation";
import { listUsers, usingBlob } from "@/lib/store";
import Directory from "@/components/Directory";

// In hosted mode new profiles appear without a redeploy.
export const revalidate = 60;

export default async function Page() {
  const users = await listUsers();

  if (!users.length) {
    return (
      <main className="mx-auto max-w-[560px] px-6 py-24 text-center">
        <h1 className="text-[18px] font-semibold text-ink">No profiles yet</h1>
        <p className="text-[13px] text-muted mt-3 leading-relaxed">
          Run <code className="text-ink">npx statshub login</code> then{" "}
          <code className="text-ink">npx statshub sync</code> to publish one.
        </p>
      </main>
    );
  }
  // A single profile is the common case — send / straight to it.
  if (users.length === 1 && !usingBlob()) redirect(`/${users[0].slug}`);
  return <Directory users={users} />;
}
