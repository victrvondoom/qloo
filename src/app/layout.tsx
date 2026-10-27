import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { envReport } from "@/lib/env";
import "./globals.css";

// Render at request time so the data-mode banner always reflects the running configuration.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tastespec",
  description:
    "Clients say “warm and modern”. Tastespec finds out what they mean from what they love, using Qloo's taste graph, and turns it into a spec a pro can build, with every line traced to evidence.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

function ModeBanner() {
  const env = envReport();
  if (env.qlooMode === "fixture") {
    return (
      <div className="banner warn" role="status">
        <div className="wrap">
          <b>FIXTURE mode: synthetic data.</b> This deployment is not calling Qloo. Places, ids and scores are fictional and labelled as such on every brief.
        </div>
      </div>
    );
  }
  if (env.qlooMode !== "live") {
    return (
      <div className="banner bad" role="status">
        <div className="wrap">
          <b>Qloo is not configured.</b> {env.issues.join(" ")} New briefs can&apos;t run; saved briefs can still be viewed.
        </div>
      </div>
    );
  }
  return null;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip">Skip to content</a>
        <nav className="nav" aria-label="Main">
          <div className="wrap">
            <Link href="/" className="brand">
              Taste<span>spec</span>
            </Link>
            <Link href="/" className="link">New brief</Link>
            <Link href="/lab" className="link">Proof Lab</Link>
            <Link href="/compare" className="link">Same words test</Link>
            <Link href="/projects" className="link">Projects</Link>
            <Link href="/verify" className="link">Verify</Link>
            <Link href="/method" className="link">Method</Link>
          </div>
        </nav>
        <ModeBanner />
        <main id="main">
          <div className="wrap">{children}</div>
        </main>
        <footer>
          <div className="wrap">
            Taste evidence from the <a href="https://www.qloo.com">Qloo</a> taste graph. Qloo results describe aggregate affinities of
            people with similar tastes, not facts about any individual. Spec values come from an open, versioned rulebook; light levels are
            starting points, not calculations. MIT licensed.
          </div>
        </footer>
      </body>
    </html>
  );
}
