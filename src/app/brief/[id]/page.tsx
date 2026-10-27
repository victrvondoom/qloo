import { notFound } from "next/navigation";
import { BriefView } from "@/components/BriefView";
import { getStore, publicView } from "@/lib/store";
import { currentOwnerHash, isOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const brief = await getStore().get((await params).id);
  if (!brief) notFound();
  const canEdit = isOwner(brief.ownerHash, await currentOwnerHash());
  return <BriefView initial={publicView(brief)} canEdit={canEdit} />;
}
