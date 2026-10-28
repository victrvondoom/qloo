import type { Metadata } from "next";
import { ProofLab } from "@/components/ProofLab";

export const metadata: Metadata = { title: "Proof Lab" };

export default function LabPage() {
  return (
    <main id="main">
      <div className="wrap">
        <ProofLab />
      </div>
    </main>
  );
}
