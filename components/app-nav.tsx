"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Plug, Workflow } from "lucide-react";

const ITEMS = [
  { href: "/flows", label: "Flows", icon: Workflow },
  { href: "/runs", label: "Runs", icon: Activity },
  { href: "/tools", label: "Tools", icon: Plug },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 md:flex-col" aria-label="Main">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors ${
              active ? "bg-sunken font-medium text-ink" : "text-muted hover:text-ink"
            }`}
          >
            <Icon aria-hidden className="size-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SignOutButton() {
  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" }).catch(() => {});
    window.location.href = "/";
  }
  return (
    <button type="button" onClick={signOut} className="text-[12.5px] text-muted transition-colors hover:text-ink">
      Sign out
    </button>
  );
}
