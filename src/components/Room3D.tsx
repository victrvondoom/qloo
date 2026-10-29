"use client";

import { useEffect, useRef, useState } from "react";
import type { LightSource, RoomVisual } from "@/lib/render";
import type { RoomType } from "@/lib/types";

// The spec, in three dimensions. Same inputs as the 2D drawing (render.ts):
// which sources exist and how bright they are at this dimmer position, their
// colour (kelvin, warming as it dims), beam widths (optics), fixture finish and
// the palette. Lights are real three.js lights; drag to orbit, scroll to zoom.

type V3 = [number, number, number];
type Mat = "textile" | "textile2" | "wood" | "trim" | "metal" | "accent" | "white" | "dark";
interface Piece { size: V3; pos: V3; mat: Mat }
interface Plan {
  furniture: Piece[];
  table: V3[]; // lamp bulb positions
  floor: V3[];
  pendant: V3[];
  down: [number, number][]; // x, z on the ceiling
  wash: V3[]; // spot targets on walls
  art?: V3; // centre on the back wall
}

const W = 6;
const D = 5;
const H = 2.8;
const BACK = -D / 2;

const PLANS: Record<RoomType, Plan> = {
  living_room: {
    furniture: [
      { size: [2.3, 0.45, 0.9], pos: [0, 0.22, -1.85], mat: "textile" },
      { size: [2.3, 0.45, 0.2], pos: [0, 0.65, -2.2], mat: "textile2" },
      { size: [0.25, 0.6, 0.9], pos: [-1.2, 0.3, -1.85], mat: "textile2" },
      { size: [0.25, 0.6, 0.9], pos: [1.2, 0.3, -1.85], mat: "textile2" },
      { size: [1.1, 0.38, 0.6], pos: [0, 0.19, -0.7], mat: "wood" },
      { size: [2.8, 0.01, 1.9], pos: [0, 0.005, -1.1], mat: "accent" },
      { size: [0.45, 0.55, 0.45], pos: [-1.65, 0.27, -1.95], mat: "wood" },
    ],
    table: [[-1.65, 0.95, -1.95]],
    floor: [[1.8, 1.55, -1.95]],
    pendant: [],
    down: [[-1.8, 0.6], [0, 0.6], [1.8, 0.6], [0, -1.2]],
    wash: [[0, 1.6, BACK + 0.01]],
    art: [0, 1.65, BACK + 0.02],
  },
  dining_room: {
    furniture: [
      { size: [2.0, 0.06, 0.95], pos: [0, 0.75, -0.9], mat: "wood" },
      { size: [1.8, 0.72, 0.08], pos: [0, 0.36, -0.9], mat: "wood" },
      ...[-0.6, 0, 0.6].flatMap((x) => [
        { size: [0.45, 0.9, 0.45] as V3, pos: [x, 0.45, -1.6] as V3, mat: "textile" as Mat },
        { size: [0.45, 0.9, 0.45] as V3, pos: [x, 0.45, -0.2] as V3, mat: "textile" as Mat },
      ]),
      { size: [1.6, 0.85, 0.45], pos: [1.9, 0.42, -2.25], mat: "wood" },
    ],
    table: [[2.4, 1.15, -2.25]],
    floor: [],
    pendant: [[0, 1.55, -0.9]],
    down: [[-2, 0.8], [2, 0.8], [0, 1.2]],
    wash: [[1.9, 1.6, BACK + 0.01]],
    art: [1.9, 1.65, BACK + 0.02],
  },
  bedroom: {
    furniture: [
      { size: [1.9, 0.5, 2.1], pos: [0, 0.25, -1.4], mat: "textile" },
      { size: [2.0, 1.1, 0.12], pos: [0, 0.55, -2.44], mat: "textile2" },
      { size: [1.8, 0.12, 1.4], pos: [0, 0.56, -1.05], mat: "white" },
      { size: [0.5, 0.55, 0.45], pos: [-1.3, 0.27, -2.2], mat: "wood" },
      { size: [0.5, 0.55, 0.45], pos: [1.3, 0.27, -2.2], mat: "wood" },
    ],
    table: [[-1.3, 0.95, -2.2], [1.3, 0.95, -2.2]],
    floor: [],
    pendant: [],
    down: [[-2, 0.8], [2, 0.8], [0, 0.6]],
    wash: [[0, 1.9, BACK + 0.01]],
    art: [0, 1.85, BACK + 0.02],
  },
  kitchen: {
    furniture: [
      { size: [4.6, 0.9, 0.62], pos: [0.5, 0.45, -2.19], mat: "trim" },
      { size: [4.6, 0.04, 0.65], pos: [0.5, 0.92, -2.18], mat: "white" },
      { size: [4.6, 0.7, 0.35], pos: [0.5, 1.85, -2.32], mat: "trim" },
      { size: [2.4, 0.9, 1.0], pos: [0.5, 0.45, -0.2], mat: "wood" },
      { size: [2.5, 0.05, 1.1], pos: [0.5, 0.92, -0.2], mat: "white" },
    ],
    table: [],
    floor: [],
    pendant: [[-0.1, 1.75, -0.2], [1.1, 1.75, -0.2]],
    down: [[-2.2, 1.2], [0.5, 1.4], [2.4, 1.2]],
    wash: [[0.5, 1.2, BACK + 0.01]],
  },
  home_office: {
    furniture: [
      { size: [1.6, 0.05, 0.7], pos: [0.3, 0.75, -2.1], mat: "wood" },
      { size: [1.5, 0.72, 0.05], pos: [0.3, 0.36, -2.4], mat: "wood" },
      { size: [0.6, 0.38, 0.04], pos: [0.3, 1.0, -2.3], mat: "dark" },
      { size: [0.55, 0.9, 0.55], pos: [0.3, 0.45, -1.4], mat: "textile" },
      { size: [0.35, 2.0, 1.8], pos: [2.8, 1.0, -1.2], mat: "wood" },
    ],
    table: [[0.95, 1.15, -2.2]],
    floor: [],
    pendant: [],
    down: [[-1.8, 0.4], [0.3, 0.2], [1.8, 0.8]],
    wash: [[2.62, 1.3, -1.2]],
    art: [-1.4, 1.6, BACK + 0.02],
  },
  bathroom: {
    furniture: [
      { size: [1.7, 0.6, 0.8], pos: [-2.0, 0.3, -1.9], mat: "white" },
      { size: [1.4, 0.85, 0.55], pos: [0.9, 0.42, -2.22], mat: "wood" },
      { size: [1.0, 0.9, 0.03], pos: [0.9, 1.65, BACK + 0.02], mat: "white" },
    ],
    table: [[0.25, 1.65, -2.4], [1.55, 1.65, -2.4]],
    floor: [],
    pendant: [],
    down: [[-2, -1.8], [0.9, -1], [0.9, 1]],
    wash: [],
  },
  restaurant: {
    furniture: [
      { size: [6, 0.9, 0.6], pos: [0, 0.45, -2.2], mat: "textile" },
      ...[-1.9, 0, 1.9].flatMap((x) => [
        { size: [0.8, 0.05, 0.8] as V3, pos: [x, 0.75, -1.4] as V3, mat: "wood" as Mat },
        { size: [0.08, 0.72, 0.08] as V3, pos: [x, 0.36, -1.4] as V3, mat: "metal" as Mat },
        { size: [0.45, 0.85, 0.45] as V3, pos: [x, 0.42, -0.7] as V3, mat: "textile2" as Mat },
      ]),
    ],
    table: [[-1.9, 0.85, -1.4], [0, 0.85, -1.4], [1.9, 0.85, -1.4]],
    floor: [],
    pendant: [[-1.9, 1.7, -1.4], [0, 1.7, -1.4], [1.9, 1.7, -1.4]],
    down: [[-1, 0.8], [1, 0.8]],
    wash: [[-1.5, 1.8, BACK + 0.01], [1.5, 1.8, BACK + 0.01]],
    art: [0, 1.85, BACK + 0.02],
  },
  bar: {
    furniture: [
      { size: [4.4, 2.0, 0.35], pos: [0, 1.2, -2.32], mat: "dark" },
      { size: [4.6, 1.05, 0.6], pos: [0, 0.52, -0.6], mat: "wood" },
      { size: [4.8, 0.06, 0.75], pos: [0, 1.07, -0.6], mat: "metal" },
      ...[-1.6, -0.5, 0.6, 1.7].map((x) => ({ size: [0.4, 0.75, 0.4] as V3, pos: [x, 0.37, 0.2] as V3, mat: "textile" as Mat })),
    ],
    table: [],
    floor: [],
    pendant: [[-1.4, 1.75, -0.6], [0, 1.75, -0.6], [1.4, 1.75, -0.6]],
    down: [[-2.5, 1.5], [2.5, 1.5]],
    wash: [[-1.2, 1.4, -2.14], [1.2, 1.4, -2.14]],
  },
  retail: {
    furniture: [
      { size: [4.2, 2.2, 0.4], pos: [0.6, 1.1, -2.3], mat: "trim" },
      { size: [2.0, 0.8, 0.9], pos: [0.2, 0.4, -0.4], mat: "wood" },
      ...[-0.4, 0.2, 0.8].map((x) => ({ size: [0.35, 0.3, 0.3] as V3, pos: [x, 0.95, -0.4] as V3, mat: "accent" as Mat })),
    ],
    table: [],
    floor: [],
    pendant: [],
    down: [[-1.5, 0.8], [1.5, 0.8]],
    wash: [[-0.6, 1.4, -2.09], [0.6, 1.4, -2.09], [1.8, 1.4, -2.09]],
  },
};

const BEAM: Record<RoomVisual["optics"], number> = { accent: 0.22, sparkle: 0.32, grid: 0.4, lowglare: 0.34 };
const of = (v: RoomVisual, k: LightSource["kind"]) => v.sources.find((s) => s.kind === k)?.intensity ?? 0;

export function Room3D({ visual, room, label }: { visual: RoomVisual; room: RoomType; label?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ update: (v: RoomVisual) => void; dispose: () => void } | null>(null);
  const latest = useRef(visual);
  const [failed, setFailed] = useState<string>();

  useEffect(() => {
    latest.current = visual;
    api.current?.update(visual);
  }, [visual]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const el = host.current;
      if (!el || cancelled) return;
      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
      } catch {
        setFailed("3D needs WebGL, which this browser has turned off.");
        return;
      }
      const v0 = latest.current;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.45;
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#0b0a09");
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
      camera.position.set(4.6, 2.9, 5.2);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 1.0, -0.9);
      controls.enableDamping = true;
      controls.minDistance = 3.2;
      controls.maxDistance = 11;
      controls.maxPolarAngle = Math.PI * 0.49;
      controls.minAzimuthAngle = -Math.PI * 0.42;
      controls.maxAzimuthAngle = Math.PI * 0.42;

      const plan = PLANS[room];
      const mats: Record<Mat, import("three").MeshStandardMaterial> = {
        textile: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
        textile2: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
        wood: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
        trim: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
        metal: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.7 }),
        accent: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
        white: new THREE.MeshStandardMaterial({ color: "#efeae1", roughness: 0.5 }),
        dark: new THREE.MeshStandardMaterial({ color: "#1d1d1f", roughness: 0.4 }),
      };
      const wallMat = new THREE.MeshStandardMaterial({ roughness: 0.92, side: THREE.DoubleSide });
      const floorMat = new THREE.MeshStandardMaterial({ roughness: 0.75 });
      const ceilMat = new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.DoubleSide });

      const plane = (w: number, h: number, mat: import("three").Material, pos: V3, rot: V3) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        m.position.set(...pos);
        m.rotation.set(...rot);
        m.receiveShadow = true;
        scene.add(m);
        return m;
      };
      plane(W, D, floorMat, [0, 0, 0], [-Math.PI / 2, 0, 0]);
      plane(W, H, wallMat, [0, H / 2, BACK], [0, 0, 0]);
      plane(D, H, wallMat, [-W / 2, H / 2, 0], [0, Math.PI / 2, 0]);
      plane(D, H, wallMat, [W / 2, H / 2, 0], [0, -Math.PI / 2, 0]);
      plane(W, D, ceilMat, [0, H, 0], [Math.PI / 2, 0, 0]);

      // window on the left wall, with daylight through it
      const glassMat = new THREE.MeshBasicMaterial({ color: "#9cc3e6" });
      plane(1.6, 1.5, glassMat, [-W / 2 + 0.01, 1.45, -0.6], [0, Math.PI / 2, 0]);
      const sun = new THREE.DirectionalLight("#fff2dc", 0);
      sun.position.set(-6, 4, -0.5);
      sun.target.position.set(0, 0, -0.8);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      scene.add(sun, sun.target);
      const hemi = new THREE.HemisphereLight("#c8d6e6", "#2a2018", 0.22);
      scene.add(hemi);

      for (const p of plan.furniture) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(...p.size), mats[p.mat]);
        m.position.set(...p.pos);
        m.castShadow = true;
        m.receiveShadow = true;
        scene.add(m);
      }
      if (plan.art) {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.85, 0.03), mats.metal);
        frame.position.set(...plan.art);
        scene.add(frame);
        const canvas = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.72), mats.accent);
        canvas.position.set(plan.art[0], plan.art[1], plan.art[2] + 0.02);
        scene.add(canvas);
      }

      // fixtures: glowing shades + lights
      const glowMat = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: new THREE.Color("#ffb46b"), emissiveIntensity: 1, roughness: 0.5 });
      const lamp = (pos: V3, r: number) => {
        const shade = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), glowMat);
        shade.position.set(...pos);
        scene.add(shade);
        const light = new THREE.PointLight("#ffb46b", 0, 7, 2);
        light.position.set(pos[0], pos[1], pos[2] + 0.05);
        light.castShadow = true;
        light.shadow.mapSize.set(512, 512);
        scene.add(light);
        return { shade, light };
      };
      const tables = plan.table.map((p) => lamp(p, 0.12));
      const floors = plan.floor.map((p) => {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, p[1]), mats.metal);
        pole.position.set(p[0], p[1] / 2, p[2]);
        scene.add(pole);
        return lamp(p, 0.16);
      });
      const pendants = plan.pendant.map((p) => {
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, H - p[1]), mats.dark);
        cord.position.set(p[0], (H + p[1]) / 2, p[2]);
        scene.add(cord);
        return lamp(p, 0.18);
      });
      const downs = plan.down.map(([x, z]) => {
        const s = new THREE.SpotLight("#ffd0a0", 0, 8, 0.3, 0.5, 2);
        s.position.set(x, H - 0.02, z);
        s.target.position.set(x, 0, z);
        s.castShadow = true;
        s.shadow.mapSize.set(512, 512);
        const trim = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), new THREE.MeshBasicMaterial({ color: "#fff" }));
        trim.position.set(x, H - 0.005, z);
        trim.rotation.x = Math.PI / 2;
        scene.add(s, s.target, trim);
        return { s, trim };
      });
      const washes = plan.wash.map((t) => {
        const s = new THREE.SpotLight("#ffd0a0", 0, 6, 0.55, 0.8, 1.5);
        s.position.set(t[0], H - 0.1, t[2] + 0.9);
        s.target.position.set(...t);
        scene.add(s, s.target);
        return s;
      });
      const cove = new THREE.Mesh(new THREE.BoxGeometry(W, 0.02, 0.04), new THREE.MeshBasicMaterial({ color: "#ffd0a0" }));
      cove.position.set(0, H - 0.08, BACK + 0.03);
      scene.add(cove);
      const coveLights = [-2, 0, 2].map((x) => {
        const l = new THREE.PointLight("#ffd0a0", 0, 4, 2);
        l.position.set(x, H - 0.15, BACK + 0.25);
        scene.add(l);
        return l;
      });
      const ambient = new THREE.AmbientLight("#ffffff", 0.12);
      scene.add(ambient);

      const update = (v: RoomVisual) => {
        const c = new THREE.Color(v.lightRgb);
        mats.textile.color.set(v.palette.textile);
        mats.textile2.color.set(v.palette.textile).offsetHSL(0, 0, -0.06);
        mats.wood.color.set(v.palette.floor).offsetHSL(0, 0, -0.08);
        mats.trim.color.set(v.palette.trim);
        mats.metal.color.set(v.palette.metal);
        mats.accent.color.set(v.palette.accent);
        wallMat.color.set(v.palette.wall);
        floorMat.color.set(v.palette.floor);
        ceilMat.color.set(v.palette.wall).offsetHSL(0, 0, 0.04);
        glassMat.color.set(v.daylight > 0.05 ? "#a9cdeb" : "#0e1520");
        sun.intensity = v.daylight * 3.2;
        hemi.intensity = 0.05 + v.daylight * 0.6;
        ambient.intensity = 0.02 + 0.05 * v.level;
        const lampOn = v.layering !== "concealed";
        const set = (arr: { shade: import("three").Mesh; light: import("three").PointLight }[], i: number, power: number) =>
          arr.forEach(({ shade, light }) => {
            shade.visible = lampOn;
            light.color.copy(c);
            light.intensity = lampOn ? i * power : 0;
            (shade.material as import("three").MeshStandardMaterial).emissive.copy(c);
            (shade.material as import("three").MeshStandardMaterial).emissiveIntensity = lampOn ? 0.15 + 1.6 * i : 0;
          });
        set(tables, of(v, "table_lamp"), 2.2);
        set(floors, of(v, "floor_lamp"), 2.6);
        set(pendants, of(v, "pendant"), 2.4);
        const dl = Math.max(of(v, "downlight"), of(v, "track"));
        downs.forEach(({ s, trim }) => {
          s.color.copy(c);
          s.angle = BEAM[v.optics];
          s.intensity = dl * 9;
          (trim.material as import("three").MeshBasicMaterial).color.copy(dl > 0.02 && v.optics !== "lowglare" ? c : new THREE.Color("#3a3632"));
        });
        washes.forEach((s) => {
          s.color.copy(c);
          s.intensity = of(v, "wallwash") * 7;
        });
        const co = of(v, "cove");
        (cove.material as import("three").MeshBasicMaterial).color.copy(co > 0.02 ? c : new THREE.Color("#2a2622"));
        coveLights.forEach((l) => {
          l.color.copy(c);
          l.intensity = co * 2.2;
        });
      };
      update(v0);

      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
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
      api.current = {
        update,
        dispose: () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          controls.dispose();
          renderer.dispose();
          scene.traverse((o) => {
            const m = o as import("three").Mesh;
            m.geometry?.dispose?.();
          });
          renderer.domElement.remove();
        },
      };
    })().catch((e) => setFailed(`3D view unavailable: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      cancelled = true;
      api.current?.dispose();
      api.current = null;
    };
  }, [room]);

  return (
    <div className="room room3d" ref={host} role="img" aria-label={label ?? `3D ${room.replace("_", " ")} lit from the spec: ${visual.caption}. Drag to orbit.`}>
      {failed ? <div className="cap" style={{ top: "auto", bottom: 12 }}>{failed}</div> : <span className="cap">3D · drag to orbit · {visual.caption}</span>}
    </div>
  );
}
