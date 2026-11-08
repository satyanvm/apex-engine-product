import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeroVisual } from "@/components/hero-visual";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const STEPS = [
  {
    n: "1",
    title: "Connect what you already have",
    body: "Give it an OpenAPI spec or an MCP server. Every operation becomes something a plan is allowed to use, and nothing else is.",
    code: `POST /invoices/{id}/remind\nGET  /invoices?status=overdue\nGET  /accounts/{id}`,
  },
  {
    n: "2",
    title: "Say what should happen",
    body: "A sentence compiles into a graph of typed steps. You watch it happen stage by stage, then read the whole plan before anything runs.",
    code: `"after": ["fetch"],\n"to": "{{outputs.owner.email}}"`,
  },
  {
    n: "3",
    title: "Run it, or put it on a schedule",
    body: "Each step is checkpointed. Add an approval and the run waits for you. Every run keeps its inputs, outputs and failures.",
    code: `fetch    succeeded\ndraft    succeeded\napprove  needs approval`,
  },
];

const GUARANTEES = [
  ["Plans stay inside your tools", "The planner picks from the operations you connected. It can't reach for something you never gave it."],
  ["Checked before it's saved", "Every step type and every data reference is validated. If a plan can't be made valid, you get the reason, not a guess."],
  ["Survives crashes", "A run resumes at the step it was on, and finished steps don't run twice."],
  ["A person in the loop", "Put an approval anywhere. The run holds there until someone says yes or no."],
  ["Credentials stay put", "They're encrypted at rest on the engine and can't be read back, including by this app's browser code."],
];

export default function Landing() {
  return (
    <div className="mx-auto max-w-[1120px] px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/sign-in" className="btn btn-ghost btn-sm">Sign in</Link>
        </div>
      </header>

      <main>
        <section className="grid items-center gap-10 pt-10 pb-20 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-16">
          <div>
            <h1 className="display text-[56px] sm:text-[76px] lg:text-[84px]">
              Describe the work.
              <br />
              <em className="text-accent">Your API</em> does it.
            </h1>
            <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-muted">
              Apex Flows reads your OpenAPI spec or MCP server and turns a plain-English request into a workflow you
              can inspect, approve and run durably.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-up" className="btn btn-primary h-11 px-5 text-[14.5px]">
                Create a workspace <ArrowRight aria-hidden className="size-4" />
              </Link>
              <a href="#how" className="btn btn-ghost h-11 px-5 text-[14.5px]">See how it works</a>
            </div>
          </div>
          <HeroVisual />
        </section>

        <section id="how" className="border-t border-line py-16">
          <p className="eyebrow mb-10">How it works</p>
          <ol className="space-y-12">
            {STEPS.map((s) => (
              <li key={s.n} className="grid gap-4 md:grid-cols-[72px_1fr_1fr] md:gap-8">
                <span className="display text-[52px] text-accent">{s.n}</span>
                <div>
                  <h2 className="display text-[30px]">{s.title}</h2>
                  <p className="mt-2 max-w-[44ch] text-[15px] leading-relaxed text-muted">{s.body}</p>
                </div>
                <pre className="self-start overflow-x-auto rounded-lg border border-line bg-surface p-4 font-mono text-[12.5px] leading-relaxed text-muted">
                  {s.code}
                </pre>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-line py-16">
          <h2 className="display max-w-[20ch] text-[40px] sm:text-[48px]">Automation you can actually read before it runs.</h2>
          <dl className="mt-10 divide-y divide-line border-y border-line">
            {GUARANTEES.map(([term, detail]) => (
              <div key={term} className="grid gap-1 py-4 md:grid-cols-[320px_1fr] md:gap-8">
                <dt className="text-[15px] font-medium">{term}</dt>
                <dd className="text-[15px] leading-relaxed text-muted">{detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="border-t border-line py-20 text-center">
          <h2 className="display text-[44px] sm:text-[56px]">Start with one API.</h2>
          <p className="mx-auto mt-3 max-w-[48ch] text-[15px] text-muted">
            Apex Flows is new. Each workspace has a monthly allowance of compiles and runs, and you can always see how
            much is left.
          </p>
          <Link href="/sign-up" className="btn btn-primary mt-7 h-11 px-5 text-[14.5px]">
            Create a workspace <ArrowRight aria-hidden className="size-4" />
          </Link>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-6 text-[12.5px] text-faint">
        <Logo />
        <span>Built on apex-engine.</span>
      </footer>
    </div>
  );
}
