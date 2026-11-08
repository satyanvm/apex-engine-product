"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, KeyRound, Plus, Trash2 } from "lucide-react";
import { EmptyState, ErrorNote, Spinner } from "./ui";
import { api } from "@/lib/client";
import type { CatalogNode } from "@/lib/engine";
import { formatDate } from "@/lib/format";

export interface ToolView {
  id: string;
  name: string;
  kind: string;
  baseUrl: string;
  nodeCount: number;
  credentialHeaders: string[];
  createdAt: string;
}

type Kind = "openapi-url" | "openapi-spec" | "mcp";

const KINDS: { id: Kind; label: string }[] = [
  { id: "openapi-url", label: "OpenAPI URL" },
  { id: "openapi-spec", label: "Paste OpenAPI" },
  { id: "mcp", label: "MCP server" },
];

function AddTool({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("openapi-url");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [spec, setSpec] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [headerName, setHeaderName] = useState("Authorization");
  const [headerValue, setHeaderValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/tools", "POST", {
        name,
        kind,
        url,
        spec,
        baseUrl,
        headers: headerValue ? { [headerName.trim()]: headerValue } : {},
      });
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this tool");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mb-6 space-y-4 p-5">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Tool source">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={kind === k.id}
            onClick={() => setKind(k.id)}
            className={`rounded-md px-2.5 py-1 text-[13px] transition-colors ${
              kind === k.id ? "bg-sunken font-medium text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="tool-name" className="eyebrow mb-1.5 block">
          Name
        </label>
        <input id="tool-name" className="field" required placeholder="Billing API" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      {kind === "openapi-spec" ? (
        <div>
          <label htmlFor="tool-spec" className="eyebrow mb-1.5 block">
            OpenAPI JSON
          </label>
          <textarea id="tool-spec" required className="field min-h-40 font-mono text-[12.5px]" value={spec} onChange={(e) => setSpec(e.target.value)} />
        </div>
      ) : (
        <div>
          <label htmlFor="tool-url" className="eyebrow mb-1.5 block">
            {kind === "mcp" ? "Server URL" : "Spec URL"}
          </label>
          <input
            id="tool-url"
            className="field"
            type="url"
            required
            placeholder={kind === "mcp" ? "https://mcp.example.com/mcp" : "https://api.example.com/openapi.json"}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
      )}

      {kind !== "mcp" && (
        <div>
          <label htmlFor="tool-base" className="eyebrow mb-1.5 block">
            Base URL (if the spec doesn&apos;t set one)
          </label>
          <input id="tool-base" className="field" type="url" placeholder="https://api.example.com" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div>
          <label htmlFor="tool-header" className="eyebrow mb-1.5 block">
            Credential header
          </label>
          <input id="tool-header" className="field font-mono text-[13px]" value={headerName} onChange={(e) => setHeaderName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="tool-secret" className="eyebrow mb-1.5 block">
            Value
          </label>
          <input
            id="tool-secret"
            className="field font-mono text-[13px]"
            type="password"
            autoComplete="off"
            placeholder="Bearer sk_..."
            value={headerValue}
            onChange={(e) => setHeaderValue(e.target.value)}
          />
        </div>
      </div>
      <p className="text-[12.5px] text-muted">Credentials go straight to the engine, encrypted at rest, and can&apos;t be read back.</p>

      {error && <ErrorNote message={error} />}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy && <Spinner />}
          {busy ? "Importing" : "Add tool"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ToolRow({ tool }: { tool: ToolView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState<CatalogNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [header, setHeader] = useState(tool.credentialHeaders[0] ?? "Authorization");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !nodes) {
      setLoading(true);
      setError(null);
      try {
        const res = await api<{ nodes: CatalogNode[] }>(`/api/tools/${tool.id}`);
        setNodes(res.nodes);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load operations");
      } finally {
        setLoading(false);
      }
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${tool.name}? Flows can't use it afterwards.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/tools/${tool.id}`, "DELETE");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove this tool");
      setBusy(false);
    }
  }

  async function saveCredential(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/tools/${tool.id}/credentials`, "PUT", { headers: { [header.trim()]: value } });
      setEditing(false);
      setValue("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the credential");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={toggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <ChevronRight aria-hidden className={`size-3.5 shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-medium">{tool.name}</span>
            <span className="block truncate font-mono text-[11.5px] text-faint">
              {tool.kind} · {tool.nodeCount} operations{tool.baseUrl ? ` · ${tool.baseUrl}` : ""}
            </span>
          </span>
        </button>
        <span className="font-mono text-[11.5px] text-muted">
          {tool.credentialHeaders.length ? tool.credentialHeaders.join(", ") : "no credential"}
        </span>
        <div className="flex gap-1.5">
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(!editing)}>
            <KeyRound aria-hidden className="size-3" />
            Credential
          </button>
          <button className="btn btn-danger btn-sm" onClick={remove} disabled={busy} aria-label={`Remove ${tool.name}`}>
            <Trash2 aria-hidden className="size-3" />
          </button>
        </div>
      </div>
      {editing && (
        <form onSubmit={saveCredential} className="mt-3 flex flex-wrap gap-2 pl-6.5">
          <input aria-label="Header name" className="field w-44 font-mono text-[12.5px]" value={header} onChange={(e) => setHeader(e.target.value)} />
          <input
            aria-label="Header value"
            className="field min-w-48 flex-1 font-mono text-[12.5px]"
            type="password"
            autoComplete="off"
            placeholder="New value"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button className="btn btn-primary btn-sm h-[38px]" disabled={busy}>
            Save
          </button>
        </form>
      )}
      {error && (
        <div className="mt-3 pl-6.5">
          <ErrorNote message={error} />
        </div>
      )}
      {open && (
        <div className="mt-3 pl-6.5">
          {loading && (
            <p className="flex items-center gap-2 text-[12.5px] text-muted">
              <Spinner className="size-3" /> Loading operations
            </p>
          )}
          {nodes && nodes.length === 0 && <p className="text-[12.5px] text-muted">The engine found no operations in this tool.</p>}
          {nodes && nodes.length > 0 && (
            <ul className="max-h-72 space-y-1.5 overflow-auto">
              {nodes.map((n) => (
                <li key={n.id} className="text-[13px]">
                  <span className="font-medium">{n.label}</span>
                  <span className="ml-2 font-mono text-[11px] text-faint">{n.id}</span>
                  {n.description && <p className="text-[12.5px] text-muted">{n.description}</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11.5px] text-faint">Added {formatDate(tool.createdAt)}</p>
        </div>
      )}
    </li>
  );
}

export function ToolsClient({ tools }: { tools: ToolView[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      {!adding && tools.length > 0 && (
        <div className="mb-4 flex justify-end">
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus aria-hidden className="size-3.5" /> Add tool
          </button>
        </div>
      )}
      {adding && <AddTool onDone={() => setAdding(false)} />}
      {tools.length === 0 && !adding && (
        <EmptyState
          title="Connect your first tool"
          action={
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Plus aria-hidden className="size-3.5" /> Add tool
            </button>
          }
        >
          Point Apex Flows at an OpenAPI spec or MCP server. Plans can only use the operations you connect here.
        </EmptyState>
      )}
      {tools.length > 0 && (
        <ul className="card divide-y divide-line">
          {tools.map((t) => (
            <ToolRow key={t.id} tool={t} />
          ))}
        </ul>
      )}
    </>
  );
}
