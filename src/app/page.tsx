// Server Component: reads and validates rules/ at build time, so the deployed
// page is static and the rule base ships inside it. The profile never leaves
// the browser; the timeline is computed there.
import { TimelineApp } from "@/components/timeline-app";
import { watchItems } from "@/engine/watch";
import { loadRuleBase } from "@/rules/load";
import { validateRuleBase } from "@/rules/validate";

export default function Home() {
  const { sourcesData, docs } = loadRuleBase(process.cwd());
  const { rules, sources, errors } = validateRuleBase(sourcesData, docs);
  if (errors.length > 0) {
    throw new Error(`rules/ failed validation:\n${errors.join("\n")}`);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">statuskeeper</h1>
        <p className="mt-1 text-sm text-muted">
          Your F-1 timeline: where you are, what&apos;s next, and what&apos;s changing. For CMU master&apos;s students.
        </p>
      </header>

      <TimelineApp
        rules={rules}
        watch={watchItems(sources)}
        sourceTitles={Object.fromEntries(sources.map((s) => [s.id, s.title]))}
      />

      <footer className="mt-12 border-t border-border pt-6 text-xs text-muted">
        Not legal advice. Every date comes from a rule file that cites its source;{" "}
        <a
          href="https://github.com/jantai0119/statuskeeper/tree/main/rules"
          className="text-accent underline underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          see the rules
        </a>
        .
      </footer>
    </main>
  );
}
