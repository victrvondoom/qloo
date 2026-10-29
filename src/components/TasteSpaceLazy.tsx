"use client";

import dynamic from "next/dynamic";
import type { SpacePoint } from "./TasteSpace3D";

const Space = dynamic(() => import("./TasteSpace3D").then((m) => m.TasteSpace3D), { ssr: false, loading: () => <div className="space3d" /> });

export function TasteSpaceLazy({ points }: { points: SpacePoint[] }) {
  return <Space points={points} />;
}
