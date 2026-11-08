import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow mb-2">404</p>
      <h1 className="display text-[40px]">Nothing here</h1>
      <p className="mt-2 text-muted">This page doesn&apos;t exist, or it belongs to another workspace.</p>
      <Link href="/flows" className="btn btn-ghost mt-5">Back to flows</Link>
    </main>
  );
}
