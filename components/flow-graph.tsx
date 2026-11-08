"use client";

import { useState } from "react";
import { DagView } from "./dag-view";
import { CodeBlock } from "./ui";
import type { DagNode } from "@/lib/engine";
import { pretty } from "@/lib/format";

export function FlowGraph({ nodes }: { nodes: DagNode[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const node = nodes.find((n) => n.key === selected);
  return (
    <div className="space-y-3">
      <DagView nodes={nodes} selectedKey={selected} onSelect={setSelected} height={400} />
      {node ? (
        <div className="card p-4">
          <p className="text-[14px] font-medium">{node.name || node.key}</p>
          <p className="mt-0.5 mb-3 font-mono text-[11.5px] text-faint">
            {node.key} · {node.type}
            {node.dependsOn?.length ? ` · after ${node.dependsOn.join(", ")}` : ""}
          </p>
          <CodeBlock value={pretty(node.config)} />
        </div>
      ) : (
        <p className="text-[12.5px] text-faint">Select a step to see its configuration.</p>
      )}
    </div>
  );
}
