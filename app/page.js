import { listUsers, configured } from "@/lib/store";
import Directory from "@/components/Directory";

export const dynamic = "force-dynamic";

function Notice({ title, children }) {
  return (
    <main className="mx-auto max-w-[560px] px-6 py-24 text-center">
      <h1 className="text-[18px] font-semibold text-ink">{title}</h1>
      <p className="text-[13px] text-muted mt-3 leading-relaxed">{children}</p>
    </main>
  );
}

export default async function Page() {
  if (!configured()) {
    return <Notice title="No database configured">
      Set <code className="text-ink">DATABASE_URL</code> to a Neon connection string.
    </Notice>;
  }
  const users = await listUsers();
  if (!users.length) {
    return <Notice title="No profiles yet">
      Run <code className="text-ink">npx statshub</code> to publish one.
    </Notice>;
  }
  return <Directory users={users} />;
}
