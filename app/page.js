import { redirect } from "next/navigation";
import { allUsers } from "@/lib/users";
import Dashboard from "@/components/Dashboard";
import Directory from "@/components/Directory";

export default function Page() {
  const users = allUsers();
  if (!users.length) {
    return (
      <main className="mx-auto max-w-[640px] px-6 py-24 text-center">
        <h1 className="text-[18px] font-semibold text-ink">No snapshots yet</h1>
        <p className="text-[13px] text-muted mt-2">
          Run <code className="text-ink">npm run sync</code> to generate one.
        </p>
      </main>
    );
  }
  // A single profile is the common case — send / straight to it.
  if (users.length === 1) redirect(`/${users[0].slug}`);
  return <Directory users={users} />;
}
