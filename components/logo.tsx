import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-baseline gap-1.5">
      <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 translate-y-[1px] text-accent" fill="currentColor">
        <path d="M8 1 15 15H1Z" />
      </svg>
      <span className="display text-[21px]">Apex Flows</span>
    </Link>
  );
}
