import { Check, Circle, X } from "lucide-react";
import { Spinner } from "./ui";

export type StageRow = {
  stage: string;
  status: "pending" | "start" | "done" | "failed";
  detail?: string;
};

const LABEL: Record<string, string> = {
  route: "Route",
  map: "Map",
  reduce: "Write the graph",
  validate: "Validate",
  repair: "Repair",
};

const HINT: Record<string, string> = {
  route: "Finding which of your tools are relevant",
  map: "Choosing the operations that could do this",
  reduce: "Authoring every step and how data flows",
  validate: "Checking steps, references and cycles",
  repair: "Fixing what validation rejected",
};

export function StageList({ rows }: { rows: StageRow[] }) {
  return (
    <ol className="space-y-2" aria-live="polite">
      {rows.map((row, i) => (
        <li key={`${row.stage}-${i}`} className="flex items-start gap-2.5">
          <span className="mt-[3px] flex size-4 shrink-0 items-center justify-center">
            {row.status === "pending" && <Circle aria-hidden className="size-2.5 text-line-strong" />}
            {row.status === "start" && <Spinner className="size-3.5 text-accent" />}
            {row.status === "done" && <Check aria-hidden className="size-3.5 text-ok" />}
            {row.status === "failed" && <X aria-hidden className="size-3.5 text-fail" />}
          </span>
          <div className="min-w-0">
            <p className={`text-[13px] ${row.status === "pending" ? "text-faint" : "font-medium text-ink"}`}>
              {LABEL[row.stage] ?? row.stage}
            </p>
            <p className="font-mono text-[11.5px] break-words text-muted">{row.detail || HINT[row.stage]}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
