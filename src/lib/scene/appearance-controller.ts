import type * as THREE from "three";
import { boot } from "@/lib/lazy";
import { hashStr } from "@/lib/utils";
import type { Dock, Shore } from "@/lib/scene/harbor-jelly";
import type { LandAppearance, LandHex, LandLook, VisibilityContext } from "@/lib/scene/land-appearance";

// #759, desk answer A on #1341 (2026-11-12): the land look's build-and-swap, moved out of the island renderer's chunk so the
// renderer stays inside its growth allowance. It is its own chunk, loaded by the renderer beside whichever look is asked for
// (jelly-board.ts and classic-board.ts export only `create`), not a static import of the looks: the browser keeps a failed
// module fetch for the life of the page, so a dependency that failed once would fail every fresh-query retry of the look's
// entry. As its own entry it retries under its own fresh query (lazy.ts). A failed import of either is the renderer's, which
// keeps the retry and the error state, unchanged.
// The contract is the approved one (docs/design/classic-board.md "Builders and ownership"): build off screen, compile, then
// swap whole in one frame; a newer request or a dispose (the generation) drops the candidate; the shore follows the board.

// What `grow` reads and writes of the renderer. The renderer passes itself; these are its own members, not copies.
export interface AppearanceHost {
  readonly stopped: boolean;
  readonly lite: boolean;
  readonly titleMode: boolean;
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: { readBuffer: THREE.WebGLRenderTarget };
  readonly scene: THREE.Scene;
  readonly living: THREE.Group;
  readonly land: THREE.Group;
  readonly walk: unknown;
  readonly wayfarer: THREE.Object3D;
  readonly robberTarget: THREE.Vector3;
  slabs: (THREE.InstancedMesh & { material: THREE.Material }) | null;
  appearance: LandAppearance | null;
  landState: { displayed: LandLook | null; loading: boolean; error: string | null };
  readonly lastState: { hexes: { id: string; terrain: string }[]; robberHex: string | null } | null;
  readonly caps: Map<string, { emissiveIntensity: number }>;
  readonly jellyT: number;
  readonly view: VisibilityContext["view"];
  readonly orbit: { getAzimuthalAngle(): number };
  readonly tokens: THREE.Object3D[];
  readonly glyphDrop: number;
  seeLand: () => void;
  cam(): THREE.Camera;
  poseTokens(): void;
  robberSpot(hex: never): void;
  readonly lastLand: string | null;
  readonly coast: unknown;
  readonly docks: Dock[];
  reportLand(): void;
  whenDrawn(done: () => void): void;
  swapShore(shore: Shore): void;
  terrainStats(): unknown;
  wake(): void;
}

export type GrowRequest = {
  key: string;
  hexes: readonly LandHex[];
  look: LandLook;
  alive: () => boolean;
};

// The jelly shore (docs/design/harbor-jelly-prompt.md; the owner signed it off 2026-10-16) on every full board; ?harbor=0 or
// emberisle-harbor = "plain" in storage keeps the plain beach and docks. Its own chunk, loaded once the hexes have swapped in.
const HARBOR_JELLY = (() => {
  try {
    return new URLSearchParams(location.search).get("harbor") !== "0" && localStorage.getItem("emberisle-harbor") !== "plain";
  } catch {
    return true;
  }
})();
let shoreFailed = false;

// A look has swapped in. The first one on a board brings the shore, which follows the canonical board, independently from
// look requests; a shore that fails to load or build leaves the plain beach (said once a page).
function shown(host: AppearanceHost, key: string, first: boolean, alive: () => boolean) {
  host.whenDrawn(() => (boot.scenes = true));
  if (HARBOR_JELLY && !host.lite && first) {
    void import("@/lib/scene/harbor-jelly").then(({ buildShore }) => {
      // A newer board (the generation) or a dispose drops this shore, even when the newer board has the same hexes.
      if (!alive() || host.lastLand !== key) return;
      host.swapShore(buildShore(host.coast as never, host.docks, hashStr(`${key}|shore`)));
    }).catch((error: unknown) => {
      if (!shoreFailed) console.warn("The jelly shore did not load; the plain beach stays.", error);
      shoreFailed = true;
    }).finally(() => host.whenDrawn(() => (boot.shore = true)));
  } else host.whenDrawn(() => (boot.shore = true));
  (window as unknown as { __terrain: unknown }).__terrain = host.terrainStats();
  host.wake();
  performance.mark("props-end");
}

// The camera and the tokens as this frame sees them, by value.
const visibility = (host: AppearanceHost): VisibilityContext => ({
  view: host.view,
  camera: { ...host.cam().position },
  azimuth: host.view === "diorama" ? host.orbit.getAzimuthalAngle() : 0,
  tokens: host.tokens.map((token) => ({ ...token.position, glyphBottom: token.position.y - host.glyphDrop })),
});

// The renderer's current signals, given to a look before it shows: token pose and visibility, the wayfarer's hex, the glows.
function prepare(host: AppearanceHost, appearance: LandAppearance) {
  host.poseTokens();
  appearance.setVisibilityContext(visibility(host));
  const hex = host.lastState?.hexes.find((h) => h.id === host.lastState?.robberHex);
  appearance.robber(hex && hex.terrain !== "waste" ? hex.id : null);
  for (const [id, cap] of host.caps) appearance.glow(id, cap.emissiveIntensity);
  appearance.update(host.jellyT, true, true);
  return hex;
}

export type CreateLook = (hexes: readonly LandHex[], key: string, pause: () => Promise<boolean>, lite: boolean, holdAge: () => boolean) => Promise<LandAppearance | null> | LandAppearance | null;

// Builds the look, compiles its shaders where the browser can do it in parallel, and swaps it in whole. Rejects (after
// disposing its own candidate) if the build fails; the renderer then retries.
export async function growWith(create: CreateLook, host: AppearanceHost, { key, hexes, look, alive }: GrowRequest) {
  const pause = () => new Promise<boolean>((resolve) => setTimeout(() => resolve(alive()), 0));
  let candidate: LandAppearance | null = null;
  try {
    candidate = await create(hexes, key, pause, host.lite, () => host.titleMode);
    if (!candidate) return;
    if (!alive()) return candidate.dispose();
    prepare(host, candidate);
    // Its shaders compile before it swaps in, not in the first frame that draws it; without parallel compile that would only
    // move the same stall earlier, so there it is skipped. Compiled in place, into the composer's own target.
    if (host.renderer.extensions.has("KHR_parallel_shader_compile")) {
      host.living.add(candidate.group);
      const was = host.renderer.getRenderTarget();
      let done: Promise<unknown>;
      try {
        host.renderer.setRenderTarget(host.composer.readBuffer);
        done = host.renderer.compileAsync(host.scene, host.cam());
      } finally {
        host.renderer.setRenderTarget(was);
        host.living.remove(candidate.group);
      }
      await done;
    }
    if (!alive()) return candidate.dispose();
    // Visibility and game signals may have changed while shaders compiled.
    const hex = prepare(host, candidate);
    const previous = host.appearance;
    host.seeLand = () => host.appearance?.setVisibilityContext(visibility(host));
    host.living.add(candidate.group);
    if (previous) host.living.remove(previous.group);
    host.appearance = candidate;
    host.landState.displayed = look;
    host.landState.loading = false;
    host.landState.error = null;
    if (host.slabs) {
      host.land.remove(host.slabs);
      host.slabs.dispose();
      host.slabs.material.dispose();
      host.slabs = null;
    }
    previous?.dispose();
    if (hex) {
      host.robberSpot(hex as never);
      if (!host.walk) host.wayfarer.position.copy(host.robberTarget);
    }
    host.reportLand();
    shown(host, key, !previous, alive);
  } catch (error) {
    if (candidate && candidate !== host.appearance) candidate.dispose();
    throw error;
  }
}
