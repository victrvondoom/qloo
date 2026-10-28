import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BriefWorkspace } from "@/components/brief/BriefWorkspace";
import { briefs, publicView } from "@/lib/store";
import { currentOwnerHash, isOwner } from "@/lib/owner";
import { llmAvailable, llmModel } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const brief = await briefs.get((await params).id);
  return { title: brief ? `${brief.input.clientLabel} · “${brief.input.words.join(", ")}”` : "Brief", robots: { index: false } };
}

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const brief = await briefs.get((await params).id);
  if (!brief) notFound();
  const canEdit = isOwner(brief.ownerHash, await currentOwnerHash());
  const view = canEdit ? { ...publicView(brief), input: brief.input } : publicView(brief);
  return (
    <main id="main">
      <div className="wrap">
        <BriefWorkspace initial={view} canEdit={canEdit} shared={canEdit ? await briefs.isShared(brief.id) : false} llm={llmAvailable() ? llmModel() : null} />
      </div>
    </main>
  );
}
