import type { Metadata } from "next";
import { StudyFlow } from "@/components/StudyFlow";

export const metadata: Metadata = { title: "Study" };

export default function StudyPage() {
  return (
    <main id="main">
      <div className="wrap">
        <div className="eyebrow">Independent evaluation</div>
        <h1>Which specification would you hand over?</h1>
        <p className="lede">
          Our benchmark compares the system with itself, so it can’t say whether people prefer the output. This short, anonymous study can. You’ll see two specifications for a fictional client
          and say which you prefer, without being told where either came from.
        </p>
        <StudyFlow />
      </div>
    </main>
  );
}
