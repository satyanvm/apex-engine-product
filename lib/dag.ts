import type { DagNode } from "./engine";

export interface PlacedNode {
  node: DagNode;
  col: number;
  row: number;
}

/** Column is longest-path depth from a root; rows stack in declaration order. */
export function layoutDag(nodes: DagNode[]): PlacedNode[] {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const depth = new Map<string, number>();

  const visit = (key: string, seen: Set<string>): number => {
    const known = depth.get(key);
    if (known !== undefined) return known;
    if (seen.has(key)) return 0;
    seen.add(key);
    const deps = (byKey.get(key)?.dependsOn ?? []).filter((d) => byKey.has(d));
    const value = deps.length ? 1 + Math.max(...deps.map((d) => visit(d, seen))) : 0;
    seen.delete(key);
    depth.set(key, value);
    return value;
  };

  const rows = new Map<number, number>();
  return nodes.map((node) => {
    const col = visit(node.key, new Set());
    const row = rows.get(col) ?? 0;
    rows.set(col, row + 1);
    return { node, col, row };
  });
}

export function nodeKind(type: string): "trigger" | "agent" | "tool" | "logic" | "api" | "mcp" | "other" {
  const prefix = type.split(".")[0];
  return prefix === "trigger" || prefix === "agent" || prefix === "tool" || prefix === "logic" || prefix === "api" || prefix === "mcp"
    ? prefix
    : "other";
}

const CRON_FIELD = /^[\d*/,\-A-Za-z]+$/;

export function isCron(value: string): boolean {
  const parts = value.trim().split(/\s+/);
  return parts.length === 5 && parts.every((p) => CRON_FIELD.test(p));
}
