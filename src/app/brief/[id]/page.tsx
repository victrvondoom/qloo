import { notFound } from "next/navigation";
import { BriefView } from "@/components/BriefView";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const brief = await getStore().get((await params).id);
  if (!brief) notFound();
  return <BriefView initial={brief} />;
}
