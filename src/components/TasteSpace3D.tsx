"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface SpacePoint {
  id: string;
  label: string;
  words: string[];
  city: string;
  top: string;
  dataMode: "live" | "fixture";
  warm: number;
  character: number;
  social: number;
}

// Every brief this browser has built, as a point in three readable axes of
// measured taste: warm ↔ cool, characterful ↔ minimal, social ↔ calm.
// Drag to orbit; click a point to open the brief.

function labelSprite(THREE: typeof import("three"), text: string, color = "#c4bbae", size = 0.32) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  ctx.font = "500 44px ui-monospace, Menlo, monospace";
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  c.width = w;
  c.height = 64;
  ctx.font = "500 44px ui-monospace, Menlo, monospace";
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 8, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set((size * w) / 64, size, 1);
  return s;
}

export function TasteSpace3D({ points }: { points: SpacePoint[] }) {
  const host = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [hover, setHover] = useState<{ p: SpacePoint; x: number; y: number }>();
  const [failed, setFailed] = useState<string>();

  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const el = host.current;
      if (!el) return;
      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setFailed("3D needs WebGL.");
        return;
      }
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      camera.position.set(4.2, 3.2, 5.2);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.6;
      const S = 1.6;
      // cube frame + axes
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * S, 2 * S, 2 * S)), new THREE.LineBasicMaterial({ color: "#5a524a", transparent: true, opacity: 0.35 }));
      scene.add(frame);
      const axis = (a: [number, number, number], b: [number, number, number], neg: string, pos: string) => {
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
        scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: "#8a8178" })));
        const n = labelSprite(THREE, neg);
        n.position.set(a[0] * 1.18, a[1] * 1.18, a[2] * 1.18);
        const p = labelSprite(THREE, pos, "#e8a15a");
        p.position.set(b[0] * 1.18, b[1] * 1.18, b[2] * 1.18);
        scene.add(n, p);
      };
      axis([-S, 0, 0], [S, 0, 0], "cool", "warm");
      axis([0, -S, 0], [0, S, 0], "minimal", "characterful");
      axis([0, 0, -S], [0, 0, S], "calm", "social");
      const meshes: { m: import("three").Mesh; p: SpacePoint }[] = [];
      for (const p of points) {
        const mat = new THREE.MeshStandardMaterial({ color: p.dataMode === "live" ? "#e8a15a" : "#c9a27a", emissive: new THREE.Color("#e8873a"), emissiveIntensity: 0.35, roughness: 0.4 });
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 16), mat);
        m.position.set(p.warm * S, p.character * S, p.social * S);
        scene.add(m);
        const stem = new THREE.BufferGeometry().setFromPoints([m.position.clone(), new THREE.Vector3(m.position.x, -S, m.position.z)]);
        scene.add(new THREE.Line(stem, new THREE.LineBasicMaterial({ color: "#8a8178", transparent: true, opacity: 0.35 })));
        const tag = labelSprite(THREE, p.label, "#efe7da", 0.22);
        tag.position.set(m.position.x, m.position.y + 0.2, m.position.z);
        scene.add(tag);
        meshes.push({ m, p });
      }
      scene.add(new THREE.AmbientLight("#ffffff", 0.6));
      const dl = new THREE.DirectionalLight("#ffe2c0", 1.6);
      dl.position.set(3, 5, 4);
      scene.add(dl);
      const ray = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      const pick = (ev: PointerEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(mouse, camera);
        const hit = ray.intersectObjects(meshes.map((x) => x.m))[0];
        return hit ? { item: meshes.find((x) => x.m === hit.object)!, x: ev.clientX - r.left, y: ev.clientY - r.top } : undefined;
      };
      const onMove = (ev: PointerEvent) => {
        const h = pick(ev);
        renderer.domElement.style.cursor = h ? "pointer" : "grab";
        setHover(h ? { p: h.item.p, x: h.x, y: h.y } : undefined);
        controls.autoRotate = !h;
      };
      let downAt = 0;
      const onDown = () => (downAt = Date.now());
      const onUp = (ev: PointerEvent) => {
        if (Date.now() - downAt > 250) return;
        const h = pick(ev);
        if (h) router.push(`/brief/${h.item.p.id}`);
      };
      renderer.domElement.addEventListener("pointermove", onMove);
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);
      const resize = () => {
        renderer.setSize(el.clientWidth, el.clientHeight, false);
        camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      let raf = 0;
      const loop = () => {
        controls.update();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      loop();
      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch((e) => setFailed(String(e)));
    return () => cleanup();
  }, [points, router]);

  return (
    <div className="space3d" ref={host} role="img" aria-label={`3D taste space with ${points.length} briefs`}>
      {failed ? <div className="cap">{failed}</div> : null}
      {hover ? (
        <div className="space-tip" style={{ left: hover.x + 14, top: hover.y + 10 }}>
          <b>{hover.p.label}</b> · “{hover.p.words.join(", ")}” · {hover.p.city}
          <div className="tiny">leans {hover.p.top.toLowerCase()} · click to open</div>
        </div>
      ) : null}
    </div>
  );
}
