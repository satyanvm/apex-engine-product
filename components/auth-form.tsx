"use client";

import { useState } from "react";
import Link from "next/link";
import { ErrorNote, Spinner } from "./ui";
import { api } from "@/lib/client";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const signUp = mode === "sign-up";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/auth/${mode}`, "POST", signUp ? { name, email, password } : { email, password });
      window.location.href = "/flows";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {signUp && (
        <div>
          <label htmlFor="name" className="eyebrow mb-1.5 block">Name</label>
          <input id="name" className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      )}
      <div>
        <label htmlFor="email" className="eyebrow mb-1.5 block">Email</label>
        <input id="email" className="field" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label htmlFor="password" className="eyebrow mb-1.5 block">Password</label>
        <input
          id="password"
          className="field"
          type="password"
          required
          minLength={signUp ? 10 : undefined}
          autoComplete={signUp ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {signUp && <p className="mt-1 text-[12px] text-muted">At least 10 characters.</p>}
      </div>
      {error && <ErrorNote message={error} />}
      <button className="btn btn-primary w-full" disabled={busy}>
        {busy && <Spinner />}
        {signUp ? "Create workspace" : "Sign in"}
      </button>
      <p className="text-center text-[13px] text-muted">
        {signUp ? "Already have an account? " : "New here? "}
        <Link className="text-ink underline underline-offset-2 hover:text-accent" href={signUp ? "/sign-in" : "/sign-up"}>
          {signUp ? "Sign in" : "Create a workspace"}
        </Link>
      </p>
    </form>
  );
}
