import Link from "next/link";
import { envReport } from "@/lib/env";
import { BrandMark } from "@/components/ui/Brand";
import { NavLinks } from "@/components/ui/NavLinks";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

// Render at request time so the data-mode banner always reflects the running configuration.
export const dynamic = "force-dynamic";

function ModeBanner() {
  const env = envReport();
  if (env.qlooMode === "fixture") {
    return (
      <div className="banner warn" role="status">
        <div className="wrap">
          <b>Demo mode · synthetic data.</b> This server isn&apos;t calling Qloo: places, ids and scores come from a fictional test world and every brief is labelled FIXTURE.
        </div>
      </div>
    );
  }
  if (env.qlooMode !== "live") {
    return (
      <div className="banner bad" role="status">
        <div className="wrap">
          <b>Qloo is not configured.</b> {env.issues.join(" ")} New briefs can&apos;t run; saved briefs can still be viewed. Run <code>npm run demo</code> for synthetic data.
        </div>
      </div>
    );
  }
  return null;
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="nav" aria-label="Main">
        <div className="wrap">
          <Link href="/" className="brand" aria-label="Tastespec home">
            <BrandMark />
            <span>
              Taste<b>spec</b>
            </span>
          </Link>
          <NavLinks />
          <span className="spacer" />
          <ThemeToggle />
          <Link href="/app" className="btn primary sm hide-sm" style={{ marginLeft: 8 }}>
            New brief <span className="arrow">→</span>
          </Link>
        </div>
      </nav>
      <ModeBanner />
      {children}
      <footer className="site">
        <div className="wrap cols">
          <div>
            <div className="brand" style={{ fontSize: 18 }}>
              <BrandMark size={18} />
              <span>
                Taste<b>spec</b>
              </span>
            </div>
            <p className="small" style={{ marginTop: 10, maxWidth: 520 }}>
              Taste evidence from the <a href="https://www.qloo.com">Qloo</a> taste graph: aggregate affinities of people with similar tastes, never facts about one person.
              Spec values come from an open, versioned rulebook; light levels are starting points, not calculations. MIT licensed.
            </p>
          </div>
          <div className="small">
            <div className="eyebrow">Product</div>
            <div><Link href="/app">Workspace</Link></div>
            <div><Link href="/compare">Same words, two rooms</Link></div>
            <div><Link href="/projects">Projects</Link></div>
          </div>
          <div className="small">
            <div className="eyebrow">Proof</div>
            <div><Link href="/lab">Proof Lab</Link></div>
            <div><Link href="/method">Method</Link></div>
            <div><Link href="/verify">Verify a bundle</Link></div>
            <div><a href="/api/health">Health</a></div>
          </div>
        </div>
      </footer>
    </>
  );
}
