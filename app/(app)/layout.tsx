import type { ReactNode } from "react";
import { AppNav, SignOutButton } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { monthName } from "@/lib/format";
import { getUsage } from "@/lib/quota";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const ratio = limit > 0 ? Math.min(used / limit, 1) : 1;
  return (
    <div>
      <div className="flex justify-between font-mono text-[11px] text-muted">
        <span>{label}</span>
        <span>
          {used} / {limit}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-sunken">
        <div
          className={`h-full rounded-full ${ratio >= 1 ? "bg-fail" : ratio >= 0.8 ? "bg-wait" : "bg-ink"}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const usage = await getUsage(session.workspaceId);
  return (
    <div className="md:grid md:min-h-dvh md:grid-cols-[224px_1fr]">
      <aside className="flex flex-col gap-3 border-b border-line px-4 py-3 md:sticky md:top-0 md:h-dvh md:gap-6 md:border-r md:border-b-0 md:px-3 md:py-5">
        <div className="flex items-center justify-between md:px-2">
          <Logo href="/flows" />
          <div className="md:hidden">
            <ThemeToggle />
          </div>
        </div>
        <AppNav />
        <div className="hidden flex-1 md:block" />
        <div className="hidden space-y-3 md:block md:px-2">
          <p className="eyebrow">{monthName(usage.month)} usage</p>
          <Meter label="compiles" used={usage.compiles} limit={usage.compileLimit} />
          <Meter label="runs" used={usage.runs} limit={usage.runLimit} />
        </div>
        <div className="hidden items-center justify-between border-t border-line pt-3 md:flex md:px-2">
          <div className="min-w-0">
            <p className="truncate text-[12.5px]">{session.email}</p>
            <SignOutButton />
          </div>
          <ThemeToggle />
        </div>
      </aside>
      <main className="min-w-0 px-4 py-7 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-[980px]">{children}</div>
        <div className="mt-10 space-y-3 border-t border-line pt-4 md:hidden">
          <Meter label="compiles" used={usage.compiles} limit={usage.compileLimit} />
          <Meter label="runs" used={usage.runs} limit={usage.runLimit} />
          <SignOutButton />
        </div>
      </main>
    </div>
  );
}
