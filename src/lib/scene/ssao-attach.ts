// #1857: the soft shadows (SSAO) load as their own chunk after the first frame, so the island chunk stays smaller.
// The composer draws the board without them until this arrives; the settled board is the same.
import type * as THREE from "three";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";

export function makeSsao(scene: THREE.Scene, camera: THREE.Camera): SSAOPass {
  const ssao = new SSAOPass(scene, camera, 1, 1);
  ssao.kernelRadius = 10;
  ssao.minDistance = 0.001;
  ssao.maxDistance = 0.08;
  return ssao;
}
