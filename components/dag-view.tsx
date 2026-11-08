"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Bot, GitBranch, Globe, Hand, Play, Plug, Repeat, Webhook, Workflow } from "lucide-react";
import { layoutDag } from "@/lib/dag";
import type { DagNode, NodeRunStatus } from "@/lib/engine";

function iconFor(type: string) {
  if (type.startsWith("trigger.schedule")) return Repeat;
  if (type.startsWith("trigger.")) return Play;
  if (type.startsWith("agent.")) return Bot;
  if (type === "logic.approval") return Hand;
  if (type === "logic.loop") return Repeat;
  if (type.startsWith("logic.")) return GitBranch;
  if (type.startsWith("tool.http")) return Globe;
  if (type.startsWith("api.")) return Webhook;
  if (type.startsWith("mcp.")) return Plug;
  return Workflow;
}

const STATUS_RING: Record<NodeRunStatus, string> = {
  pending: "border-line-strong",
  running: "border-run",
  waiting_approval: "border-wait",
  succeeded: "border-ok",
  failed: "border-fail",
  skipped: "border-line border-dashed opacity-60",
};

const STATUS_TEXT: Record<NodeRunStatus, string> = {
  pending: "text-faint",
  running: "text-run",
  waiting_approval: "text-wait",
  succeeded: "text-ok",
  failed: "text-fail",
  skipped: "text-faint",
};

const STATUS_LABEL: Record<NodeRunStatus, string> = {
  pending: "pending",
  running: "running",
  waiting_approval: "needs approval",
  succeeded: "done",
  failed: "failed",
  skipped: "skipped",
};

type StepData = { node: DagNode; status?: NodeRunStatus; selected: boolean; vertical: boolean };

function Step({ data }: NodeProps<Node<StepData>>) {
  const Icon = iconFor(data.node.type);
  const ring = data.status ? STATUS_RING[data.status] : "border-line-strong";
  return (
    <div
      className={`w-[216px] rounded-lg border bg-surface px-3 py-2.5 transition-shadow ${ring} ${
        data.selected ? "ring-2 ring-accent/60" : ""
      }`}
    >
      <Handle type="target" position={data.vertical ? Position.Top : Position.Left} isConnectable={false} />
      <div className="flex items-center gap-2">
        <Icon aria-hidden className="size-3.5 shrink-0 text-accent" />
        <span className="truncate text-[13px] font-medium text-ink">{data.node.name || data.node.key}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10.5px] text-faint">
        <span className="truncate">{data.node.type}</span>
        {data.status && <span className={`shrink-0 ${STATUS_TEXT[data.status]}`}>{STATUS_LABEL[data.status]}</span>}
      </div>
      <Handle type="source" position={data.vertical ? Position.Bottom : Position.Right} isConnectable={false} />
    </div>
  );
}

const nodeTypes = { step: Step };

const NARROW = "(max-width: 640px)";

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = matchMedia(NARROW);
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

export function DagView({
  nodes,
  statuses,
  selectedKey,
  onSelect,
  height = 380,
}: {
  nodes: DagNode[];
  statuses?: Record<string, NodeRunStatus>;
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  height?: number;
}) {
  const vertical = useNarrow();
  const { flowNodes, flowEdges, depth } = useMemo(() => {
    const placed = layoutDag(nodes);
    const keys = new Set(nodes.map((n) => n.key));
    const flowNodes: Node<StepData>[] = placed.map(({ node, col, row }) => ({
      id: node.key,
      type: "step",
      position: vertical ? { x: row * 240, y: col * 100 } : { x: col * 272, y: row * 96 },
      data: { node, status: statuses?.[node.key], selected: selectedKey === node.key, vertical },
      draggable: false,
      connectable: false,
    }));
    const flowEdges: Edge[] = nodes.flatMap((n) =>
      (n.dependsOn ?? [])
        .filter((d) => keys.has(d))
        .map((d) => ({
          id: `${d}->${n.key}`,
          source: d,
          target: n.key,
          animated: statuses?.[d] === "running",
        })),
    );
    return { flowNodes, flowEdges, depth: Math.max(0, ...placed.map((p) => p.col)) + 1 };
  }, [nodes, statuses, selectedKey, vertical]);

  // A left-to-right graph shrinks to nothing on a phone, so phones get it top-down.
  const shown = vertical ? Math.min(620, Math.max(300, depth * 104 + 40)) : height;

  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-surface" style={{ height: shown }}>
      <ReactFlow
        key={vertical ? "vertical" : "horizontal"}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.25}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnScroll={false}
        preventScrolling={false}
        onNodeClick={(_e, n) => onSelect?.(n.id === selectedKey ? null : n.id)}
        onPaneClick={() => onSelect?.(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--line)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
