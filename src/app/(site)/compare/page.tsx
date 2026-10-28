import { CompareView } from "@/components/CompareView";
import { briefs } from "@/lib/store";
import type { Brief } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  const [ba, bb] = await Promise.all([a ? briefs.get(a) : undefined, b ? briefs.get(b) : undefined]);
  return (
    <main id="main">
      <div className="wrap">
        <CompareView initialA={ba as Brief | undefined} initialB={bb as Brief | undefined} />
      </div>
    </main>
  );
}
