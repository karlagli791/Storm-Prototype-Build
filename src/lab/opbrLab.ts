/**
 * opbrLab.ts — pose lab for the One Piece fighters (open /opbr_lab.html with the dev server).
 *
 * Loads one converted model, binds the procedural rig and plays any registered pose clip with a
 * scrubber, so the locomotion and skill animations can be tuned frame by frame without going
 * through a match. Purely a dev tool; the game never imports it.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OPBR_CLIPS, OpbrRig } from '../render/OpbrRig';
import { opbrClipFor } from '../render/OpbrPoses';
import '../render/OpbrMoves';
import { createCelMaterial, addInvertedHull } from '../render/Shaders';
import { OPBR_ROSTER, CHOPPER_SUPPORT } from '../combat/OpbrRoster';
import { CombatState } from '../core/Types';
import type { PoseContext } from '../render/FighterRig';

const CHARS = [...OPBR_ROSTER, CHOPPER_SUPPORT];

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10131a);
scene.add(new THREE.GridHelper(20, 20, 0x30405a, 0x1c2432));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(3, 6, 4);
scene.add(key, new THREE.AmbientLight(0x6a7a9a, 1.1));

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 200);
let camAngle = 0;
let spinning = false;
let height = 1.8;
function placeCamera(): void {
  const d = height * 2.9;
  camera.position.set(Math.sin(camAngle) * d, height * 0.75, Math.cos(camAngle) * d);
  camera.lookAt(0, height * 0.5, 0);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ------------------------------------------------------------------ state
let rig: OpbrRig | null = null;
let body: THREE.Group | null = null;
let skeleton: THREE.SkeletonHelper | null = null;
let playing = true;
let frame = 0;
let clipName = 'idle';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const charSel = $<HTMLSelectElement>('char');
const clipSel = $<HTMLSelectElement>('clips');
const scrub = $<HTMLInputElement>('scrub');
const speed = $<HTMLInputElement>('speed');
const frameLabel = $<HTMLSpanElement>('frame');
const info = $<HTMLDivElement>('info');

for (const d of CHARS) {
  const o = document.createElement('option');
  o.value = d.opbr!.key;
  o.textContent = d.displayName;
  charSel.appendChild(o);
}
function refreshClips(): void {
  clipSel.innerHTML = '';
  for (const name of [...OPBR_CLIPS.keys()].sort()) {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = `${name} (${OPBR_CLIPS.get(name)!.frames}f)`;
    if (name === clipName) o.selected = true;
    clipSel.appendChild(o);
  }
}
refreshClips();

async function load(charKey: string): Promise<void> {
  const def = CHARS.find((c) => c.opbr!.key === charKey)!;
  if (body) {
    scene.remove(body);
    if (skeleton) scene.remove(skeleton);
  }
  const gltf = await new GLTFLoader().loadAsync(`assets/op_${charKey}.glb`);
  const model = gltf.scene;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    m.material = createCelMaterial({ albedo: src?.color ?? new THREE.Color(0xffffff), map: src?.map ?? null, rimColor: 0xffffff, skinning: (m as THREE.SkinnedMesh).isSkinnedMesh });
    m.frustumCulled = false;
    m.castShadow = true;
  });
  addInvertedHull(model, 0.012);
  height = def.opbr!.height;
  model.scale.setScalar(height / 1.12);
  const pivot = new THREE.Group();
  pivot.add(model);
  const r = new OpbrRig();
  r.weaponMode = def.opbr!.weapon === 'hand' ? 'hand' : 'keep';
  r.bind(model, pivot);
  if (def.opbr!.weapon === 'hide') {
    model.traverse((o) => { if ((o as THREE.Mesh).isMesh && /weapon|sword|katana/i.test(o.name || o.parent?.name || '')) o.visible = false; });
  }
  if (def.opbr!.altMesh) {
    const re = new RegExp(def.opbr!.altMesh);
    model.traverse((o) => { if ((o as THREE.Mesh).isMesh && re.test(o.name || o.parent?.name || '')) o.visible = false; });
  }
  scene.add(pivot);
  body = pivot;
  rig = r;
  (window as unknown as Record<string, unknown>).__lab = { rig: r, model, pivot, scene, def };
  const sk = model.getObjectByProperty('type', 'Bone');
  skeleton = sk ? new THREE.SkeletonHelper(model) : null;
  if (skeleton) { skeleton.visible = $<HTMLInputElement>('bones').checked; scene.add(skeleton); }
  info.textContent = `${def.displayName} — ${def.opbr!.style ?? ''} | height ${height} m | skills: ${def.opbr!.skills.map((s) => s.name).join(', ')}`;
  placeCamera();
}

// ------------------------------------------------------------------ controls
charSel.onchange = () => load(charSel.value);
clipSel.onchange = () => { clipName = clipSel.value; frame = 0; rig?.play(clipName, true); };
$('play').onclick = () => { playing = !playing; };
$('step').onclick = () => { playing = false; frame += 1; };
scrub.oninput = () => { playing = false; frame = +scrub.value; };
$('spin').onclick = () => { spinning = !spinning; };
$<HTMLInputElement>('bones').onchange = (e) => { if (skeleton) skeleton.visible = (e.target as HTMLInputElement).checked; };
for (const b of document.querySelectorAll<HTMLButtonElement>('button[data-ang]')) {
  b.onclick = () => { camAngle = (+b.dataset.ang! * Math.PI) / 180; spinning = false; placeCamera(); };
}
addEventListener('keydown', (e) => {
  if (e.code === 'Space') { playing = !playing; e.preventDefault(); }
  if (e.code === 'ArrowRight') { playing = false; frame++; }
  if (e.code === 'ArrowLeft') { playing = false; frame = Math.max(0, frame - 1); }
});

// ------------------------------------------------------------------ loop
const ctx: PoseContext = {
  state: CombatState.IDLE_NEUTRAL, stateFrame: 0, moveName: null, moveClip: null, moveFrame: 0,
  moveTotal: 0, speed: 0, grounded: true, guardActive: false, charging: false, moveDir: 'F',
  hitDir: 'F', falling: false, framesLeft: 0,
};
void opbrClipFor; // the game maps states to clips; the lab drives clips directly

const clock = new THREE.Clock();
function tick(): void {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta()) * (+speed.value / 100);
  if (rig) {
    const clip = OPBR_CLIPS.get(clipName);
    if (clip) {
      if (playing) frame += dt * 60;
      if (frame > clip.frames) frame = clip.loop ? frame % clip.frames : clip.frames;
      scrub.max = String(clip.frames);
      scrub.value = String(Math.floor(frame));
      frameLabel.textContent = `${Math.floor(frame)} / ${clip.frames}`;
      rig.play(clipName);
      rig.setFrame(frame);
      ctx.speed = /run|dash/.test(clipName) ? 9 : 0;
      ctx.state = clipName === 'run' ? CombatState.RUNNING : CombatState.IDLE_NEUTRAL;
      rig.update(ctx, Math.max(1e-4, dt));
    }
  }
  if (spinning) { camAngle += dt * 0.6; placeCamera(); }
  renderer.render(scene, camera);
}
load(CHARS[0].opbr!.key).then(tick);
