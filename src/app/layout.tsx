import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tastespec",
  description:
    "Clients say “warm and modern”. Tastespec finds out what they mean from what they love, using Qloo's taste graph, and turns it into a spec a pro can build, with every line traced to evidence.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

function ModeBanner() {
  if (process.env.QLOO_MODE === "fixture") {
    return (
      <div className="banner warn">
        <div className="wrap">
          <b>Simulated data.</b> This deployment runs on a synthetic fixture, not Qloo. Venues and scores are fictional.
        </div>
      </div>
    );
  }
  if (!process.env.QLOO_API_KEY) {
    return (
      <div className="banner bad">
        <div className="wrap">
          <b>No Qloo key configured.</b> Set <code>QLOO_API_KEY</code> to run briefs. Saved briefs can still be viewed.
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
        <nav className="nav">
          <div className="wrap">
            <Link href="/" className="brand">
              Taste<span>spec</span>
            </Link>
            <Link href="/" className="link">New brief</Link>
            <Link href="/compare" className="link">Same words test</Link>
            <Link href="/projects" className="link">Projects</Link>
            <Link href="/verify" className="link">Verify</Link>
            <Link href="/method" className="link">Method</Link>
          </div>
        </nav>
        <ModeBanner />
        <main>
          <div className="wrap">{children}</div>
        </main>
        <footer>
          <div className="wrap">
            Taste evidence from the <a href="https://www.qloo.com">Qloo</a> taste graph. Qloo results describe aggregate affinities of
            people with similar tastes, not facts about any individual. Spec values come from open rulebooks; light levels are starting
            points, not calculations. MIT licensed.
          </div>
        </footer>
      </body>
    </html>
  );
}
