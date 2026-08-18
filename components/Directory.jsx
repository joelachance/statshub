import Link from "next/link";
import { compact, full } from "@/lib/format";

export default function Directory({ users }) {
  return (
    <main className="mx-auto max-w-[720px] px-6 py-16">
      <h1 className="text-[20px] font-semibold text-ink">Engineering activity</h1>
      <p className="text-[13px] text-muted mt-1 mb-8">{users.length} profiles</p>
      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.slug}>
            <Link href={`/${u.slug}`}
                  className="flex items-center gap-4 rounded-xl border border-line bg-panel px-5 py-4 hover:border-faint transition-colors">
              {u.profile?.avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.profile.avatar} alt="" width={36} height={36} className="rounded-full" />
              )}
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] text-ink truncate">{u.profile?.name || u.slug}</span>
                <span className="block text-[12px] text-faint">@{u.slug}</span>
              </span>
              <span className="text-[11px] text-muted nums text-right shrink-0">
                {compact(u.headline.tokens)} tokens<br />
                {full(u.headline.commits)} commits
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
