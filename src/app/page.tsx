import Link from "next/link";
import { BriefForm } from "@/components/BriefForm";

export default function Home() {
  return (
    <div>
      <section style={{ marginBottom: 28 }}>
        <div className="eyebrow">For electricians, lighting designers, decorators and fit-out teams</div>
        <h1>“Warm and modern” isn&apos;t a spec.</h1>
        <p className="lede">
          Clients describe rooms in words that mean different things to different people, and pros find out which meaning they had at the
          revision stage. Tastespec reads what a client loves through Qloo&apos;s taste graph, looks at the real rooms people with that taste
          choose to spend their evenings in, and turns the vague words into a spec you can build, with every line traced to evidence.
        </p>
        <div className="row">
          <Link className="btn" href="/compare">
            Watch two clients say the same words →
          </Link>
          <Link className="btn" href="/method">
            How it works
          </Link>
        </div>
      </section>
      <BriefForm />
    </div>
  );
}
