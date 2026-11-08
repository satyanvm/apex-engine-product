import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { currentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (await currentSession()) redirect("/flows");
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-5 py-5 sm:px-8">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <main className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-10">{children}</main>
      </div>
      <aside className="hidden items-end border-l border-line bg-surface p-12 lg:flex">
        <blockquote className="display max-w-[16ch] text-[56px]">
          One sentence in. <em className="text-accent">A plan you can read</em> out.
        </blockquote>
      </aside>
    </div>
  );
}
