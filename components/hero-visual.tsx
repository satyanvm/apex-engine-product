import { Bot, Check, Hand, Play, Send, Webhook } from "lucide-react";

const STAGES = ["Route", "Map", "Write the graph", "Validate"];

const NODES = [
  { label: "Every Monday", type: "trigger.schedule", icon: Play, col: 1, row: 0, d: 400 },
  { label: "List overdue invoices", type: "api.billing.listInvoices", icon: Webhook, col: 1, row: 1, d: 550 },
  { label: "Look up account owner", type: "api.crm.getAccount", icon: Webhook, col: 0, row: 2, d: 700 },
  { label: "Draft reminder", type: "agent.llm", icon: Bot, col: 2, row: 2, d: 750 },
  { label: "Wait for approval", type: "logic.approval", icon: Hand, col: 1, row: 3, d: 950 },
  { label: "Send reminders", type: "mcp.mail.send", icon: Send, col: 1, row: 4, d: 1100 },
];

// Coordinates in a 100 x 100 box. Five 72px rows centre on y = 10, 30, 50, 70, 90.
const EDGES = [
  { path: "M50 16.7 V23.3", d: 500 },
  { path: "M50 36.7 V40 H25 V43.3", d: 650 },
  { path: "M50 36.7 V40 H75 V43.3", d: 700 },
  { path: "M25 56.7 V60 H50 V63.3", d: 900 },
  { path: "M75 56.7 V60 H50 V63.3", d: 900 },
  { path: "M50 76.7 V83.3", d: 1050 },
];

export function HeroVisual() {
  return (
    <figure className="card overflow-hidden shadow-[0_24px_60px_-40px_rgba(25,23,19,0.45)]">
      <div className="border-b border-line p-5">
        <p className="eyebrow mb-2">You write</p>
        <p className="text-[15px] leading-relaxed">
          Every Monday, find overdue invoices, draft a reminder for each account owner, and send them once I approve.
        </p>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-b border-line bg-sunken/50 px-5 py-3">
        {STAGES.map((stage, i) => (
          <span
            key={stage}
            className="hero-rise inline-flex items-center gap-1 font-mono text-[11px] text-muted"
            style={{ "--d": `${80 + i * 70}ms` } as React.CSSProperties}
          >
            <Check aria-hidden className="size-3 text-ok" />
            {stage}
          </span>
        ))}
      </div>

      <div className="relative p-3 sm:p-4">
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] sm:inset-4 sm:h-[calc(100%-2rem)] sm:w-[calc(100%-2rem)]"
        >
          {EDGES.map((e) => (
            <path
              key={e.path}
              d={e.path}
              fill="none"
              stroke="var(--line-strong)"
              strokeWidth="1.25"
              vectorEffect="non-scaling-stroke"
              className="hero-fade"
              style={{ "--d": `${e.d}ms` } as React.CSSProperties}
            />
          ))}
        </svg>
        <div className="relative grid grid-cols-2 gap-x-3">
          {[0, 1, 2, 3, 4].map((row) => {
            const inRow = NODES.filter((n) => n.row === row);
            return (
              <div key={row} className="col-span-2 grid h-[72px] grid-cols-2 items-center gap-x-3">
                {inRow.map((n) => {
                  const Icon = n.icon;
                  return (
                    <div
                      key={n.label}
                      className={`hero-rise rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 ${
                        n.col === 1 ? "col-span-2 mx-auto w-[58%] min-w-[150px]" : ""
                      }`}
                      style={{ "--d": `${n.d}ms` } as React.CSSProperties}
                    >
                      <p className="flex items-center gap-1.5 text-[12.5px] font-medium">
                        <Icon aria-hidden className="size-3 shrink-0 text-accent" />
                        <span className="truncate">{n.label}</span>
                      </p>
                      <p className="truncate font-mono text-[10px] text-faint">{n.type}</p>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <figcaption className="border-t border-line px-5 py-2.5 text-[11.5px] text-faint">
        Illustration of a compiled plan. Your plans use your own tools.
      </figcaption>
    </figure>
  );
}
