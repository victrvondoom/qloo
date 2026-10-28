import type { Metadata } from "next";
import { ClientBrief } from "@/components/ClientBrief";
import { BrandMark } from "@/components/ui/Brand";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { buildDeepBrief } from "@/lib/deep/build";
import { applyProse, type DeepProse } from "@/lib/deep/prose";
import { clientView } from "@/lib/share";
import { briefs, generations } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your room", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ClientPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const brief = await briefs.byShareToken(token);
  const prose = brief ? await generations.get<DeepProse>(brief.id, "prose") : undefined;
  // Designer-internal parts (open risks, the raw fact sheet) stay with the designer.
  const deep = brief ? applyProse(buildDeepBrief(brief), prose?.value) : undefined;
  return (
    <>
      <header className="nav" style={{ position: "static" }}>
        <div className="wrap">
          <span className="brand" style={{ fontSize: 17 }}>
            <BrandMark size={18} />
            <span className="small muted" style={{ fontFamily: "var(--font-sans)", fontWeight: 500, letterSpacing: 0 }}>
              prepared with Taste<b>spec</b>
            </span>
          </span>
          <span className="spacer" />
          <ThemeToggle />
        </div>
      </header>
      <main id="main">
        <div className="narrow">
          {brief && deep ? (
            <ClientBrief token={token} initialView={clientView(brief)} initialDeep={{ ...deep, risks: [], facts: [] }} />
          ) : (
            <div className="empty">
              <h1 style={{ fontSize: 34 }}>This link isn&apos;t active.</h1>
              <p>It may have been replaced with a new one or switched off. Ask your designer to send it again.</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
