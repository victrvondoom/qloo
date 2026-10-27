import { CompareView } from "@/components/CompareView";
import { getStore } from "@/lib/store";
import type { Brief } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  const store = getStore();
  const [ba, bb] = await Promise.all([a ? store.get(a) : undefined, b ? store.get(b) : undefined]);
  return <CompareView initialA={ba as Brief | undefined} initialB={bb as Brief | undefined} />;
}
