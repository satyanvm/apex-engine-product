import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { NodeRunStatus, RunStatus } from "@/lib/engine";

export function Spinner({ className = "size-3.5" }: { className?: string }) {
  return <Loader2 aria-hidden className={`spin ${className}`} />;
}

export function ErrorNote({ message, problems }: { message: string; problems?: string[] }) {
  return (
    <div role="alert" className="flex gap-2.5 rounded-md border border-fail/30 bg-fail-tint px-3 py-2.5 text-[13px] text-fail">
      <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0">
        <p className="break-words">{message}</p>
        {problems && problems.length > 0 && (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 font-mono text-[12px]">
            {problems.map((p) => (
              <li key={p} className="break-words">{p}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[10px] border border-dashed border-line-strong px-6 py-14 text-center">
      <h2 className="display text-[26px]">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-[13.5px] text-muted">{children}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="display break-words text-[34px] sm:text-[40px]">{title}</h1>
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}
    </header>
  );
}

const STATUS: Record<RunStatus | NodeRunStatus, { label: string; cls: string; live?: boolean }> = {
  queued: { label: "Queued", cls: "text-muted bg-sunken" },
  pending: { label: "Pending", cls: "text-muted bg-sunken" },
  running: { label: "Running", cls: "text-run bg-run-tint", live: true },
  waiting_approval: { label: "Needs approval", cls: "text-wait bg-wait-tint", live: true },
  succeeded: { label: "Succeeded", cls: "text-ok bg-ok-tint" },
  failed: { label: "Failed", cls: "text-fail bg-fail-tint" },
  cancelled: { label: "Cancelled", cls: "text-muted bg-sunken" },
  skipped: { label: "Skipped", cls: "text-faint bg-sunken" },
};

export function StatusPill({ status }: { status: RunStatus | NodeRunStatus }) {
  const s = STATUS[status] ?? { label: status, cls: "text-muted bg-sunken" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] whitespace-nowrap ${s.cls}`}>
      <span aria-hidden className={`size-1.5 rounded-full bg-current ${s.live ? "pulse-dot" : ""}`} />
      {s.label}
    </span>
  );
}

export function CodeBlock({ value }: { value: string }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-md bg-sunken p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words">
      {value}
    </pre>
  );
}
