"use client";

import { ErrorNote } from "@/components/ui";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-3">
      <ErrorNote message="This page failed to load. The problem has been logged." />
      <button className="btn btn-ghost" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
