import type { Metadata } from "next";
import { HeroFilm } from "@/components/HeroFilm";
import { demoPair } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Film", robots: { index: false } };

/** The landing film, full-screen and from the start: what scripts/record-film.mjs records. */
export default async function FilmPage() {
  const demo = await demoPair();
  return (
    <main id="main" style={{ background: "#15130f", minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <HeroFilm demo={demo} kiosk />
    </main>
  );
}
