/**
 * FighterRig.ts — Visual rig for a fighter.
 *
 * Provides a socket table (bone dummy markers: chest, head, hands, feet, palm effect dummy,
 * blade base/tip) that the hitbox manager queries in world space. Two backends:
 *   1. Procedural mannequin (always available): articulated capsule body posed per combat state.
 *   2. GLB (2nrt.glb / 2ssk.glb in public/assets): if present, loaded via GLTFLoader, cel-shaded,
 *      sockets resolved by bone-name heuristics, and clips played through an AnimationMixer.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CharacterDef, CombatState, HitDir } from '../core/Types';
import { bindingFor, ClipSpec } from '../combat/StormStates';
import { SOCKET } from '../combat/CharacterDefs';
import { addInvertedHull, createCelMaterial, setRamp } from './Shaders';
import { OpbrRig } from './OpbrRig';
import { opbrClipFor } from './OpbrPoses';

export interface PoseContext {
  state: CombatState;
  stateFrame: number;
  moveName: string | null;
  /** Animation clip name for the current move (CC2 code such as 2nrtcma00), used by the GLB backend. */
  moveClip: string | null;
  moveFrame: number;
  moveTotal: number;
  speed: number;
  grounded: boolean;
  guardActive: boolean;
  charging: boolean;
  moveDir: HitDir;
  hitDir: HitDir;
  throwDir?: HitDir | null;
  /** Jump / roll direction relative to the target. */
  jumpDir?: HitDir | null;
  /** Awakened clip infix in force ('awa' / 'aws') or null. */
  awInfix?: string | null;
  falling: boolean;
  airDash?: boolean;
  jumpCount?: number;
  awakened?: boolean;
  framesLeft: number;
}

/** Shared CC2 common-animation bank (1cmnbod1): loaded once, retargeted per character. */
let cmnBankPromise: Promise<THREE.AnimationClip[]> | null = null;
const bankCache = new Map<string, Promise<THREE.AnimationClip[]>>();
/** Clip set of another character's GLB (e.g. Indra borrows 2ssk). Cached per path. */
function loadAnimBank(path: string): Promise<THREE.AnimationClip[]> {
  let p = bankCache.get(path);
  if (!p) {
    p = new GLTFLoader().loadAsync(path).then((g) => g.animations).catch(() => []);
    bankCache.set(path, p);
  }
  return p;
}

function loadCommonBank(path = 'assets/cmn_anims.glb'): Promise<THREE.AnimationClip[]> {
  if (!cmnBankPromise) {
    cmnBankPromise = (async () => {
      try {
        const head = await fetch(path, { method: 'HEAD' });
        if (!head.ok || (head.headers.get('content-type') ?? '').includes('text/html')) return [];
        const gltf = await new GLTFLoader().loadAsync(path);
        return gltf.animations;
      } catch (err) {
        console.warn('[FighterRig] common animation bank unavailable', err);
        return [];
      }
    })();
  }
  return cmnBankPromise;
}
/** Ramp texture shared by all rigs (set from main once loaded). */
export const RIG_RAMP: { texture: THREE.Texture | null; row: number } = { texture: null, row: 44 };

export class FighterRig {
  readonly root = new THREE.Group();
  readonly sockets = new Map<string, THREE.Object3D>();
  readonly mannequin = new THREE.Group();
  glbRoot: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private clips = new Map<string, THREE.AnimationClip>();
  private activeAction: THREE.AnimationAction | null = null;
  private activeSpec: ClipSpec | null = null;
  private activeState: string | null = null;
  private boneNames = new Set<string>();
  private time = 0;
  private parts: Record<string, THREE.Object3D> = {};
  private bladeGroup: THREE.Group | null = null;
  public usingGlb = false;
  /** One Piece fighters are animated procedurally instead of from clips (see OpbrRig). */
  opbr: OpbrRig | null = null;
  /** Transformation meshes (hidden unless the state that uses them is active). */
  private altMeshes: THREE.Object3D[] = [];

  /** Show or hide the transformation meshes (Gear 4, mochi weapons). */
  setAltMeshes(on: boolean): void {
    for (const m of this.altMeshes) m.visible = on;
  }

  constructor(private def: CharacterDef) {
    this.buildMannequin();
    this.root.add(this.mannequin);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: FighterRig.makeShadowTex(), transparent: true, depthWrite: false, opacity: 0.9 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.shadow.renderOrder = 3;
    this.root.add(this.shadow);
    // Shadow catcher: invisible plane that only shows the sun's shadow map (the body silhouette).
    this.catcher = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.ShadowMaterial({ opacity: 0.42, transparent: true, depthWrite: false }));
    this.catcher.rotation.x = -Math.PI / 2;
    this.catcher.position.y = 0.03;
    this.catcher.receiveShadow = true;
    this.catcher.renderOrder = 4;
    this.root.add(this.catcher);
  }

  // ------------------------------------------------------------ procedural rig
  private buildMannequin(): void {
    const d = this.def;
    const body = createCelMaterial({ albedo: d.color, rimColor: 0xffffff });
    const accent = createCelMaterial({ albedo: d.accentColor, rimColor: 0xffffff });
    const skin = createCelMaterial({ albedo: d.skinColor, rimColor: 0xfff1e0 });
    const hair = createCelMaterial({ albedo: d.hairColor, rimColor: 0xffffff });

    const hips = new THREE.Group();
    hips.position.y = 0.95;
    this.mannequin.add(hips);
    this.parts.hips = hips;

    // Torso
    const torsoGeo = new THREE.CapsuleGeometry(0.28, 0.55, 6, 12);
    const torso = new THREE.Mesh(torsoGeo, body);
    torso.position.y = 0.42;
    hips.add(torso);
    this.parts.torso = torso;

    // Belt / pelvis
    const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.12, 4, 12), accent);
    pelvis.position.y = 0.0;
    hips.add(pelvis);

    // Head
    const neck = new THREE.Group();
    neck.position.y = 0.82;
    hips.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 14), skin);
    head.position.y = 0.2;
    neck.add(head);
    const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.265, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    hairMesh.position.y = 0.24;
    hairMesh.rotation.x = -0.25;
    neck.add(hairMesh);
    // Headband
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.03, 6, 20), accent);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.22;
    neck.add(band);
    this.parts.neck = neck;

    // Arms
    const makeArm = (side: number) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.36 * side, 0.68, 0);
      hips.add(shoulder);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 4, 10), body);
      upper.position.y = -0.2;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.38;
      shoulder.add(elbow);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.28, 4, 10), skin);
      fore.position.y = -0.18;
      elbow.add(fore);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), skin);
      hand.position.y = -0.36;
      elbow.add(hand);
      return { shoulder, elbow, hand };
    };
    const rArm = makeArm(1);
    const lArm = makeArm(-1);
    this.parts.rShoulder = rArm.shoulder;
    this.parts.lShoulder = lArm.shoulder;
    this.parts.rElbow = rArm.elbow;
    this.parts.lElbow = lArm.elbow;

    // Legs
    const makeLeg = (side: number) => {
      const hip = new THREE.Group();
      hip.position.set(0.16 * side, -0.05, 0);
      hips.add(hip);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.34, 4, 10), body);
      thigh.position.y = -0.22;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.45;
      hip.add(knee);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.32, 4, 10), body);
      shin.position.y = -0.2;
      knee.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.3), accent);
      foot.position.set(0, -0.42, 0.06);
      knee.add(foot);
      return { hip, knee, foot };
    };
    const rLeg = makeLeg(1);
    const lLeg = makeLeg(-1);
    this.parts.rHip = rLeg.hip;
    this.parts.lHip = lLeg.hip;
    this.parts.rKnee = rLeg.knee;
    this.parts.lKnee = lLeg.knee;

    // Blade (Sasuke): parented to the right hand socket
    if (d.hasBlade) {
      const bladeGroup = new THREE.Group();
      bladeGroup.position.y = -0.36;
      rArm.elbow.add(bladeGroup);
      const bladeMat = createCelMaterial({ albedo: 0xd8dde8, rimColor: 0xffffff });
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.1, 0.09), bladeMat);
      blade.position.y = -0.55;
      bladeGroup.add(blade);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.16), accent);
      bladeGroup.add(guard);
      const bladeBase = new THREE.Object3D();
      bladeBase.position.y = -0.05;
      bladeGroup.add(bladeBase);
      const bladeTip = new THREE.Object3D();
      bladeTip.position.y = -1.1;
      bladeGroup.add(bladeTip);
      this.sockets.set(SOCKET.BLADE_BASE, bladeBase);
      this.sockets.set(SOCKET.BLADE_TIP, bladeTip);
      this.bladeGroup = bladeGroup;
    }

    // Sockets
    const rootSocket = new THREE.Object3D();
    rootSocket.position.y = 0.9;
    this.mannequin.add(rootSocket);
    this.sockets.set(SOCKET.ROOT, rootSocket);
    const chestSocket = new THREE.Object3D();
    chestSocket.position.y = 0.5;
    hips.add(chestSocket);
    this.sockets.set(SOCKET.CHEST, chestSocket);
    const headSocket = new THREE.Object3D();
    headSocket.position.y = 0.2;
    neck.add(headSocket);
    this.sockets.set(SOCKET.HEAD, headSocket);
    const rHand = new THREE.Object3D();
    rHand.position.y = -0.4;
    rArm.elbow.add(rHand);
    this.sockets.set(SOCKET.R_HAND, rHand);
    const lHand = new THREE.Object3D();
    lHand.position.y = -0.4;
    lArm.elbow.add(lHand);
    this.sockets.set(SOCKET.L_HAND, lHand);
    const rPalm = new THREE.Object3D();
    rPalm.position.set(0, -0.55, 0.15);
    rArm.elbow.add(rPalm);
    this.sockets.set(SOCKET.R_PALM_EFF, rPalm);
    const rFoot = new THREE.Object3D();
    rFoot.position.set(0, -0.45, 0.12);
    rLeg.knee.add(rFoot);
    this.sockets.set(SOCKET.R_FOOT, rFoot);
    const lFoot = new THREE.Object3D();
    lFoot.position.set(0, -0.45, 0.12);
    lLeg.knee.add(lFoot);
    this.sockets.set(SOCKET.L_FOOT, lFoot);
    if (!d.hasBlade) {
      // Non-blade characters alias blade sockets to hands so any shared move data still resolves.
      this.sockets.set(SOCKET.BLADE_BASE, rHand);
      this.sockets.set(SOCKET.BLADE_TIP, rHand);
    }

    addInvertedHull(this.mannequin, 0.028);
  }

  // ------------------------------------------------------------------- GLB
  /** Attempts to load the GLB; on success swaps the mannequin out. Silent fallback on failure. */
  async tryLoadGlb(): Promise<boolean> {
    if (!this.def.glbPath) return false;
    try {
      const head = await fetch(this.def.glbPath, { method: 'HEAD' });
      if (!head.ok) return false;
      const ct = head.headers.get('content-type') ?? '';
      if (ct.includes('text/html')) return false; // Vite SPA fallback
    } catch {
      return false;
    }
    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(this.def.glbPath);
      const scene = gltf.scene;
      const opbr = this.def.opbr;
      // One Piece rips are normalised at import time (head bone at y = 1), so they scale by the
      // character's real height instead of being squashed into the CC2 1.85 m box.
      const s = opbr ? opbr.height / 1.12 : (() => {
        const box = new THREE.Box3().setFromObject(scene);
        const size = new THREE.Vector3();
        box.getSize(size);
        const k = size.y > 1e-3 ? 1.85 / size.y : 1;
        scene.position.y = -box.min.y * k;
        return k;
      })();
      scene.scale.setScalar(s);

      // Cel-shade every mesh
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
          const map = (src && (src as THREE.MeshStandardMaterial).map) || null;
          const color = src && (src as THREE.MeshStandardMaterial).color ? (src as THREE.MeshStandardMaterial).color : new THREE.Color(this.def.color);
          m.material = createCelMaterial({ albedo: color, map, rimColor: 0xffffff, skinning: (m as THREE.SkinnedMesh).isSkinnedMesh });
          m.frustumCulled = false;
          m.renderOrder = 10; // after stage shadow sheets (see ArenaEnvironment)
          m.castShadow = true;
        }
      });
      addInvertedHull(scene, 0.012);

      // Resolve sockets by bone name heuristics
      const find = (patterns: RegExp[]): THREE.Object3D | null => {
        let hit: THREE.Object3D | null = null;
        scene.traverse((o) => {
          if (hit) return;
          const n = o.name.toLowerCase();
          for (const p of patterns) if (p.test(n)) { hit = o; return; }
        });
        return hit;
      };
      const bind = (socket: string, patterns: RegExp[], fallback: string) => {
        const b = find(patterns);
        if (b) this.sockets.set(socket, b);
        else this.sockets.set(socket, this.sockets.get(fallback) ?? scene);
      };
      // CC2 rigs name bones "<code>00t0 r hand", "<code>00t0 l foot", "<code>00t0 spine1", "<code>00t0 pelvis".
      // (glTF export replaces the spaces with underscores, so match either.)
      bind(SOCKET.HEAD, [/[ _]head$/, /head/], SOCKET.HEAD);
      bind(SOCKET.CHEST, [/[ _]spine1$/, /spine2|spine_02|chest|upperbody/, /[ _]spine$/], SOCKET.CHEST);
      bind(SOCKET.R_HAND, [/[ _]r[ _]hand$/, /hand_r|righthand|hand\.r|rhand/], SOCKET.R_HAND);
      bind(SOCKET.L_HAND, [/[ _]l[ _]hand$/, /hand_l|lefthand|hand\.l|lhand/], SOCKET.L_HAND);
      bind(SOCKET.R_FOOT, [/[ _]r[ _]foot$/, /foot_r|rightfoot|foot\.r|toe_r/], SOCKET.R_FOOT);
      bind(SOCKET.L_FOOT, [/[ _]l[ _]foot$/, /foot_l|leftfoot|foot\.l|toe_l/], SOCKET.L_FOOT);
      bind(SOCKET.R_PALM_EFF, [/eff.*dmy01/, /dmy01/, /[ _]r[ _]hand$/, /hand_r|righthand/], SOCKET.R_HAND);
      if (this.def.hasBlade) {
        // Kusanagi: the accessory mesh is skinned to the right hand; blade tip is offset along the hand bone.
        bind(SOCKET.BLADE_BASE, [/blade.*base|sword.*base|kusanagi|wep.*base|acc.*dmy01|weapon/, /[ _]r[ _]hand$/], SOCKET.R_HAND);
        bind(SOCKET.BLADE_TIP, [/blade.*tip|sword.*tip|wep.*tip|acc.*dmy02/], SOCKET.R_HAND);
        if (this.sockets.get(SOCKET.BLADE_TIP) === this.sockets.get(SOCKET.BLADE_BASE)) {
          // No dedicated tip bone: create a child marker ~1 m along the blade from the hand.
          const base = this.sockets.get(SOCKET.BLADE_BASE)!;
          const tip = new THREE.Object3D();
          tip.name = 'blade_tip_marker';
          tip.position.set(0, 1.0 / s, 0);
          base.add(tip);
          this.sockets.set(SOCKET.BLADE_TIP, tip);
        }
      }
      const rootB = find([/ pelvis$/, /^root$|hips|pelvis|center/]);
      if (rootB) this.sockets.set(SOCKET.ROOT, rootB);

      if (opbr) {
        // Procedural backend: a pivot carries the body so pose clips can move and tilt it.
        const pivot = new THREE.Group();
        pivot.add(scene);
        const rig = new OpbrRig();
        rig.weaponMode = opbr.weapon === 'hand' ? 'hand' : 'keep';
        if (rig.bind(scene, pivot)) {
          if (opbr.weapon === 'hide') {
            scene.traverse((o) => {
              if ((o as THREE.Mesh).isMesh && /weapon|sword|katana/i.test(o.name || o.parent?.name || '')) o.visible = false;
            });
          }
          // Transformation parts (Gear 4 limbs, mochi weapons) start hidden.
          if (opbr.altMesh) {
            const re = new RegExp(opbr.altMesh);
            scene.traverse((o) => {
              if (!(o as THREE.Mesh).isMesh) return;
              const name = o.name || o.parent?.name || '';
              if (re.test(name)) { this.altMeshes.push(o); o.visible = false; }
            });
          }
          for (const [k, v] of rig.sockets) this.sockets.set(k, v);
          this.opbr = rig;
          this.root.remove(this.mannequin);
          this.root.add(pivot);
          this.glbRoot = pivot;
          this.usingGlb = true;
          if (RIG_RAMP.texture) setRamp(scene, RIG_RAMP.texture, RIG_RAMP.row);
          return true;
        }
        console.warn(`[FighterRig] ${this.def.code}: OP_* bones missing, falling back to the mannequin`);
        return false;
      }

      this.mixer = new THREE.AnimationMixer(scene);
      // CC2 clips carry root motion on the root / "trall" bones. The simulation moves the
      // collider itself, so drop those position tracks to keep the mesh glued to its body.
      const rootNames = new Set<string>();
      scene.traverse((o) => {
        if ((o as THREE.Bone).isBone && (/trall$/i.test(o.name) || /^\w{4}00t0$/i.test(o.name))) rootNames.add(o.name);
      });
      for (const c of gltf.animations) {
        // Cinematic (spl1_*) clips keep their root motion: the exported camera path expects the
        // body to travel exactly where the animation moves it.
        const cinematic = /spl1_(atk|cut)/.test(c.name);
        c.tracks = c.tracks.filter((t) => {
          const dot = t.name.lastIndexOf('.');
          const node = t.name.slice(0, dot);
          const prop = t.name.slice(dot + 1);
          if (prop === 'scale' && rootNames.has(node)) return false;
          if (cinematic) return true;
          return !(prop === 'position' && rootNames.has(node));
        });
        this.clips.set(c.name, c);
      }

      scene.traverse((o) => {
        if ((o as THREE.Bone).isBone) this.boneNames.add(o.name);
      });
      // Retarget shared banks: <bank>00t0_* → <code>00t0_*, dropping tracks for bones this rig lacks.
      const code = this.def.code;
      const retarget = (bank: THREE.AnimationClip[], from: string, rename: (n: string) => string, overwrite: boolean) => {
        for (const c of bank) {
          const name = rename(c.name);
          if (!overwrite && this.clips.has(name)) continue;
          const tracks: THREE.KeyframeTrack[] = [];
          for (const t of c.tracks) {
            const dot = t.name.lastIndexOf('.');
            const node = t.name.slice(0, dot).replace(new RegExp(`^${from}00t0`), `${code}00t0`);
            const prop = t.name.slice(dot + 1);
            if (!this.boneNames.has(node)) continue;
            if ((prop === 'position' || prop === 'scale') && (/trall$/i.test(node) || /^\w{4}00t0$/i.test(node))) continue;
            const nt = t.clone();
            nt.name = `${node}.${prop}`;
            tracks.push(nt);
          }
          if (tracks.length) this.clips.set(name, new THREE.AnimationClip(name, c.duration, tracks));
        }
      };
      // 1cmnbod1: damage / stagger / knockdown / wall / dodge clips shared by every character.
      loadCommonBank().then((bank) => retarget(bank, '1cmn', (n) => n, true));
      // Borrowed moveset (Indra ← Sasuke): "2sskcma00" becomes "9indcma00" so the state bindings resolve.
      if (this.def.animBank && this.def.animBank !== code) {
        const from = this.def.animBank;
        loadAnimBank(`assets/${from}.glb`).then((bank) => retarget(bank, from, (n) => n.replace(new RegExp(`^${from}`), code), false));
      }
      this.retargetFn = retarget;
      for (const from of this.pendingDemoBanks) this.importDemoClips(from);
      this.pendingDemoBanks.length = 0;
      if (RIG_RAMP.texture) setRamp(scene, RIG_RAMP.texture, RIG_RAMP.row);

      this.root.remove(this.mannequin);
      this.root.add(scene);
      this.glbRoot = scene;
      this.usingGlb = true;
      return true;
    } catch (err) {
      console.warn(`[FighterRig] GLB load failed for ${this.def.code}, using procedural rig`, err);
      return false;
    }
  }

  // -------------------------------------------------------------- queries
  /** World position of a socket (writes into `out`). Falls back to the root socket. */
  socketWorld(name: string, out: THREE.Vector3): THREE.Vector3 {
    const s = this.sockets.get(name) ?? this.sockets.get(SOCKET.ROOT);
    if (!s) return out.copy(this.root.position);
    s.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(s.matrixWorld);
  }

  /** Visible mesh root for hit flash effects. */
  get visual(): THREE.Object3D {
    return this.glbRoot ?? this.mannequin;
  }

  // ------------------------------------------------------------- animation
  update(ctx: PoseContext, dt: number): void {
    this.time += dt;
    if (this.opbr) {
      const pick = opbrClipFor(ctx, !!this.def.opbr?.float);
      if (pick.name === 'idle' && this.def.opbr?.idleClip) pick.name = this.def.opbr.idleClip;
      this.opbr.play(pick.name, pick.frame !== undefined && pick.frame <= 1);
      if (pick.frame !== undefined) this.opbr.setFrame(pick.frame);
      this.opbr.update(ctx, dt);
      return;
    }
    if (this.usingGlb && this.mixer) {
      this.updateGlbAnimation(ctx, dt);
      return;
    }
    this.poseMannequin(ctx);
  }

  /** Blob drop shadow that stays on the floor while the body is in the air. */
  readonly shadow: THREE.Mesh;
  catcher!: THREE.Mesh;
  private static shadowTex: THREE.Texture | null = null;
  private static makeShadowTex(): THREE.Texture {
    if (FighterRig.shadowTex) return FighterRig.shadowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    FighterRig.shadowTex = t;
    return t;
  }

  hasClip(name: string): boolean { return this.opbr ? this.opbr.hasClip(name.replace(/^op:/, '')) : this.clips.has(name); }
  clipDuration(name: string): number { return this.clips.get(name)?.duration ?? 0; }

  /** Keep the shadow on the ground: `height` is the body's height above the floor. */
  updateShadow(height: number): void {
    const h = Math.max(0, height);
    this.shadow.position.y = -h + 0.02;
    this.catcher.position.y = -h + 0.03;
    const k = 1 - Math.min(0.55, h * 0.12);
    this.shadow.scale.setScalar(k * 0.8);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.35 * k;
  }

  private retargetFn: ((bank: THREE.AnimationClip[], from: string, rename: (n: string) => string, overwrite: boolean) => void) | null = null;
  private pendingDemoBanks: string[] = [];
  /** Retarget another character's victim clips (skl1_dmg*, spl1_dmg) onto this rig, names kept. */
  importDemoClips(fromCode: string): void {
    if (fromCode === this.def.code) return;
    if (!this.retargetFn) { this.pendingDemoBanks.push(fromCode); return; }
    const fn = this.retargetFn;
    loadAnimBank(`assets/${fromCode}.glb`).then((bank) => fn(bank.filter((c) => /(skl1|spl1)_dmg/.test(c.name)), fromCode, (n) => n, false));
  }

  private awInfix = '';
  private smearVec = new THREE.Vector3();
  /** Smear-frame stretch (world metres) applied to every cel/outline material; zero to clear. */
  setSmear(v: THREE.Vector3): void {
    if (this.smearVec.distanceToSquared(v) < 1e-8) return;
    this.smearVec.copy(v);
    this.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
      if (!m || !(m as THREE.ShaderMaterial).uniforms) return;
      const u = (m as THREE.ShaderMaterial).uniforms;
      if (u.uSmear) (u.uSmear.value as THREE.Vector3).copy(v);
    });
  }
  /** Stage lighting: sun colour, ambient and rim on every cel material. */
  setLighting(sun: number, ambient: number, rim: number, dir: THREE.Vector3): void {
    this.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
      if (!m || !(m as THREE.ShaderMaterial).uniforms) return;
      const u = (m as THREE.ShaderMaterial).uniforms;
      if (u.uLightColor) (u.uLightColor.value as THREE.Color).set(sun);
      if (u.uAmbient) (u.uAmbient.value as THREE.Color).set(ambient);
      if (u.uRimColor && !this.awakenedVisual) (u.uRimColor.value as THREE.Color).set(rim);
      if (u.uLightDir) (u.uLightDir.value as THREE.Vector3).copy(dir).normalize();
    });
  }

  private awakenedVisual = false;
  /** Awakening look: hot rim light on every cel material (restored when it ends). */
  setAwakened(on: boolean, color = 0xff7a1a): void {
    if (this.awakenedVisual === on) return;
    this.awakenedVisual = on;
    this.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
      if (!m || !(m as THREE.ShaderMaterial).uniforms) return;
      const u = (m as THREE.ShaderMaterial).uniforms;
      if (u.uRimColor) (u.uRimColor.value as THREE.Color).set(on ? color : 0xffffff);
      if (u.uRimThreshold) u.uRimThreshold.value = on ? 0.45 : 0.7;
    });
  }

  /**
   * Advance the skeletal animation by render time. Kept separate from the fixed 60 Hz tick so the
   * mixer runs at the display's refresh rate (no 60 Hz stepping on 120/144 Hz monitors) and can be
   * frozen during hitstop without touching the simulation.
   */
  advance(dt: number): void {
    if (this.usingGlb && this.mixer && dt > 0) this.mixer.update(dt);
  }

  /** Resolve a clip spec against the clips actually present ({c} → character code). */
  private resolve(spec: ClipSpec): ClipSpec | null {
    // Awakened forms: the parameter table's awakening clips carry an infix (2nrvawanut0, 2garawstk00).
    if (this.awInfix) {
      const aw = spec.clip.replace('{c}', this.def.code + this.awInfix);
      if (this.clips.has(aw)) return { clip: aw, loop: spec.loop, next: spec.next?.replace('{c}', this.def.code + this.awInfix) };
    }
    const name = spec.clip.replace('{c}', this.def.code);
    if (this.clips.has(name)) return { clip: name, loop: spec.loop, next: spec.next?.replace('{c}', this.def.code) };
    // partial match (e.g. skl1_s → skl1_s1)
    for (const k of this.clips.keys()) if (k.startsWith(name)) return { clip: k, loop: spec.loop, next: spec.next?.replace('{c}', this.def.code) };
    return null;
  }

  private pickSpec(ctx: PoseContext): ClipSpec | null {
    if (!this.clips.size) return null;
    const binding = bindingFor(ctx.state, {
      moveClip: ctx.moveClip,
      moveDir: ctx.moveDir,
      hitDir: ctx.hitDir,
      airborne: !ctx.grounded,
      airDash: ctx.airDash,
      throwDir: ctx.throwDir,
      jumpDir: ctx.jumpDir,
      awakened: ctx.awakened,
      falling: ctx.falling,
      stateFrame: ctx.stateFrame,
      framesLeft: ctx.framesLeft,
    });
    for (const spec of binding.clips) {
      const r = this.resolve(spec);
      if (r) return r;
    }
    const idle = this.resolve({ clip: '{c}nut0', loop: true });
    return idle ?? { clip: [...this.clips.keys()][0], loop: true };
  }

  private play(spec: ClipSpec, fade = 0.08): void {
    if (!this.mixer) return;
    const clip = this.clips.get(spec.clip);
    if (!clip) return;
    const action = this.mixer.clipAction(clip);
    if (this.activeAction === action && this.activeSpec?.clip === spec.clip) return;
    if (this.activeAction) this.activeAction.fadeOut(fade);
    action.reset();
    action.setLoop(spec.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true;
    action.fadeIn(fade).play();
    this.activeAction = action;
    this.activeSpec = spec;
  }

  private updateGlbAnimation(ctx: PoseContext, dt: number): void {
    // Re-pick on state change, on hit direction / fall changes, or when a one-shot finished and has a chain.
    const stateKey = `${ctx.state}|${ctx.moveClip ?? ''}|${ctx.jumpCount ?? 0}|${ctx.airDash ? 1 : 0}|${ctx.hitDir}|${ctx.falling ? 1 : 0}|${ctx.throwDir ?? ''}|${ctx.awInfix ?? ''}|${ctx.jumpDir ?? ''}`;
    this.awInfix = ctx.awInfix ?? '';
    const spec = this.pickSpec(ctx);
    if (spec) {
      const changed = this.activeState !== stateKey || !this.activeSpec;
      const oneShotDone = this.activeAction && this.activeSpec && !this.activeSpec.loop && this.activeAction.time >= this.activeAction.getClip().duration - 1e-3;
      if (changed) {
        this.play(spec);
        this.activeState = stateKey;
      } else if (oneShotDone && this.activeSpec?.next) {
        const nxt = this.resolve({ clip: this.activeSpec.next, loop: true });
        if (nxt) this.play(nxt, 0.05);
      } else if (!changed && this.activeSpec && spec.clip !== this.activeSpec.clip && this.activeSpec.loop && ctx.state === CombatState.NINJA_MOVE) {
        // direction changed mid ninja-move
        this.play(spec, 0.04);
      }
    }
    void dt;
  }

  private poseMannequin(ctx: PoseContext): void {
    const p = this.parts;
    const t = this.time;
    const st = ctx.state;
    // Reset
    const reset = (o: THREE.Object3D, x = 0, y = 0, z = 0) => o.rotation.set(x, y, z);
    reset(p.rShoulder); reset(p.lShoulder); reset(p.rElbow); reset(p.lElbow);
    reset(p.rHip); reset(p.lHip); reset(p.rKnee); reset(p.lKnee); reset(p.neck); reset(p.torso);
    p.hips.position.set(0, 0.95, 0);
    p.hips.rotation.set(0, 0, 0);
    this.mannequin.rotation.set(0, 0, 0);
    this.mannequin.position.set(0, 0, 0);

    const moveT = ctx.moveTotal > 0 ? ctx.moveFrame / ctx.moveTotal : 0;
    const swing = (x: number) => Math.sin(x);

    // Base arm ready pose
    p.rShoulder.rotation.x = -0.35; p.lShoulder.rotation.x = -0.35;
    p.rElbow.rotation.x = -0.9; p.lElbow.rotation.x = -0.9;

    switch (st) {
      case CombatState.IDLE_NEUTRAL: {
        const b = Math.sin(t * 2.2) * 0.02;
        p.hips.position.y = 0.93 + b;
        p.rKnee.rotation.x = 0.12; p.lKnee.rotation.x = 0.12;
        p.rHip.rotation.x = -0.08; p.lHip.rotation.x = -0.08;
        p.torso.rotation.x = 0.05;
        break;
      }
      case CombatState.RUNNING: {
        const f = t * 11 * Math.max(0.3, ctx.speed / 9);
        p.rHip.rotation.x = swing(f) * 0.8;
        p.lHip.rotation.x = -swing(f) * 0.8;
        p.rKnee.rotation.x = Math.max(0, -swing(f)) * 1.2 + 0.1;
        p.lKnee.rotation.x = Math.max(0, swing(f)) * 1.2 + 0.1;
        p.rShoulder.rotation.x = -swing(f) * 0.9 - 0.2;
        p.lShoulder.rotation.x = swing(f) * 0.9 - 0.2;
        p.hips.position.y = 0.95 + Math.abs(Math.sin(f)) * 0.05;
        p.hips.rotation.x = 0.18;
        break;
      }
      case CombatState.NINJA_MOVE: {
        p.hips.rotation.z = 0.25;
        p.rHip.rotation.x = -0.6; p.lHip.rotation.x = 0.5;
        p.rKnee.rotation.x = 1.0; p.lKnee.rotation.x = 0.4;
        p.rShoulder.rotation.z = -1.2; p.lShoulder.rotation.z = 1.2;
        p.hips.position.y = 1.05;
        break;
      }
      case CombatState.HOLLOW_STEP:
      case CombatState.JUMPING: {
        p.rHip.rotation.x = -0.9; p.lHip.rotation.x = -0.5;
        p.rKnee.rotation.x = 1.4; p.lKnee.rotation.x = 1.0;
        p.rShoulder.rotation.z = -0.9; p.lShoulder.rotation.z = 0.9;
        break;
      }
      case CombatState.DASH_STARTUP: {
        p.hips.position.y = 0.8;
        p.rKnee.rotation.x = 0.9; p.lKnee.rotation.x = 0.9;
        p.rHip.rotation.x = -0.6; p.lHip.rotation.x = -0.6;
        p.hips.rotation.x = 0.35;
        p.rShoulder.rotation.x = 0.6; p.lShoulder.rotation.x = 0.6;
        break;
      }
      case CombatState.DASH_CHARGING: {
        const s = Math.sin(t * 30) * 0.03;
        p.hips.position.y = 0.78 + s;
        p.rKnee.rotation.x = 1.0; p.lKnee.rotation.x = 1.0;
        p.rHip.rotation.x = -0.7; p.lHip.rotation.x = -0.7;
        p.hips.rotation.x = 0.4;
        p.rShoulder.rotation.x = 1.4; p.lShoulder.rotation.x = 1.4;
        p.rElbow.rotation.x = -0.4; p.lElbow.rotation.x = -0.4;
        break;
      }
      case CombatState.DASH_HOMING:
      case CombatState.SPARK_DASH: {
        p.hips.rotation.x = 1.15; // superman lean
        p.hips.position.y = 1.0;
        p.rShoulder.rotation.x = 2.6; p.lShoulder.rotation.x = 2.6;
        p.rElbow.rotation.x = -0.2; p.lElbow.rotation.x = -0.2;
        p.rHip.rotation.x = 0.2; p.lHip.rotation.x = 0.35;
        p.rKnee.rotation.x = 0.2; p.lKnee.rotation.x = 0.4;
        p.neck.rotation.x = -0.8;
        break;
      }
      case CombatState.DASH_IMPACT:
      case CombatState.DASH_REBOUND:
      case CombatState.DASH_CLASH: {
        p.hips.rotation.x = -0.25;
        p.rShoulder.rotation.x = -1.2; p.lShoulder.rotation.x = -1.2;
        p.rKnee.rotation.x = 0.6; p.lKnee.rotation.x = 0.6;
        p.rHip.rotation.x = -0.4; p.lHip.rotation.x = -0.4;
        p.hips.position.y = 0.85;
        break;
      }
      case CombatState.COMBO_STRING: {
        const punchR = Math.sin(Math.min(1, moveT * 1.6) * Math.PI);
        const name = ctx.moveName ?? '';
        const isKick = name.includes('atk3') || name.includes('up') || name.includes('dn2');
        const isLeft = name.includes('atk2');
        p.hips.rotation.x = 0.2 + punchR * 0.15;
        p.hips.rotation.y = (isLeft ? 0.5 : -0.5) * punchR;
        if (isKick) {
          p.rHip.rotation.x = -1.4 * punchR - 0.2;
          p.rKnee.rotation.x = (1 - punchR) * 1.2 + 0.1;
          p.lKnee.rotation.x = 0.4;
          p.rShoulder.rotation.x = -0.3; p.lShoulder.rotation.x = -0.9;
          if (name.includes('up')) { p.rHip.rotation.x = -2.2 * punchR; p.hips.rotation.x = -0.4 * punchR; }
          if (name.includes('dn2')) { p.rHip.rotation.x = -2.4 * punchR + 0.8; p.hips.rotation.x = 0.6 * punchR; }
        } else if (isLeft) {
          p.lShoulder.rotation.x = -1.6 * punchR - 0.2;
          p.lElbow.rotation.x = -0.15 * (1 - punchR) - 0.1;
          p.rShoulder.rotation.x = -0.5;
          p.rKnee.rotation.x = 0.35; p.lKnee.rotation.x = 0.35;
        } else {
          p.rShoulder.rotation.x = -1.6 * punchR - 0.2;
          p.rElbow.rotation.x = -0.15 * (1 - punchR) - 0.1;
          p.lShoulder.rotation.x = -0.5;
          p.rKnee.rotation.x = 0.35; p.lKnee.rotation.x = 0.35;
          if (name.includes('dn1')) { p.rShoulder.rotation.x = -2.6 * punchR + 0.4; p.hips.rotation.x = 0.7 * punchR; }
        }
        if (this.bladeGroup) this.bladeGroup.rotation.x = -1.2 + punchR * 0.8;
        p.hips.position.y = 0.92;
        break;
      }
      case CombatState.JUTSU: {
        const phase = moveT;
        const wind = Math.min(1, phase * 3);
        p.hips.rotation.x = 0.5 * wind;
        p.hips.position.y = 0.9;
        p.rShoulder.rotation.x = -1.4 * wind;
        p.rElbow.rotation.x = -0.2;
        p.lShoulder.rotation.x = -1.4 * wind;
        p.lElbow.rotation.x = -0.2;
        p.rKnee.rotation.x = 0.5; p.lKnee.rotation.x = 0.5;
        p.rHip.rotation.x = -0.3; p.lHip.rotation.x = -0.3;
        break;
      }
      case CombatState.GUARDING: {
        p.hips.position.y = 0.84;
        p.rKnee.rotation.x = 0.7; p.lKnee.rotation.x = 0.7;
        p.rHip.rotation.x = -0.45; p.lHip.rotation.x = -0.45;
        p.rShoulder.rotation.x = -1.3; p.lShoulder.rotation.x = -1.3;
        p.rShoulder.rotation.z = -0.5; p.lShoulder.rotation.z = 0.5;
        p.rElbow.rotation.x = -1.8; p.lElbow.rotation.x = -1.8;
        p.hips.rotation.x = 0.15;
        break;
      }
      case CombatState.GUARD_COUNTER: {
        const flick = Math.sin(Math.min(1, ctx.stateFrame / 8) * Math.PI);
        p.hips.position.y = 0.86;
        p.rShoulder.rotation.x = -2.2 * flick - 0.4;
        p.lShoulder.rotation.x = -1.2;
        p.rElbow.rotation.x = -0.3;
        p.rKnee.rotation.x = 0.6; p.lKnee.rotation.x = 0.6;
        p.hips.rotation.y = -0.4 * flick;
        break;
      }
      case CombatState.GUARD_BREAK: {
        p.hips.rotation.x = -0.35;
        p.rShoulder.rotation.z = -1.6; p.lShoulder.rotation.z = 1.6;
        p.rShoulder.rotation.x = 0.4; p.lShoulder.rotation.x = 0.4;
        p.neck.rotation.x = -0.5;
        p.rKnee.rotation.x = 0.4; p.lKnee.rotation.x = 0.4;
        p.hips.position.y = 0.9 + Math.sin(t * 40) * 0.01;
        break;
      }
      case CombatState.HITSTUN:
      case CombatState.BLOCKSTUN: {
        const k = Math.exp(-ctx.stateFrame * 0.12);
        p.hips.rotation.x = -0.5 * k;
        p.neck.rotation.x = -0.6 * k;
        p.rShoulder.rotation.x = 0.8 * k - 0.3; p.lShoulder.rotation.x = 0.8 * k - 0.3;
        p.rKnee.rotation.x = 0.5; p.lKnee.rotation.x = 0.5;
        p.hips.position.y = 0.88;
        break;
      }
      case CombatState.LAUNCHED:
      case CombatState.TUMBLE: {
        this.mannequin.rotation.x = -ctx.stateFrame * 0.14;
        p.rShoulder.rotation.z = -2.2; p.lShoulder.rotation.z = 2.2;
        p.rHip.rotation.x = -0.6; p.lHip.rotation.x = 0.3;
        p.rKnee.rotation.x = 1.0; p.lKnee.rotation.x = 0.4;
        p.hips.position.y = 1.0;
        break;
      }
      case CombatState.CRUMPLE: {
        const k = Math.min(1, ctx.stateFrame / 14);
        p.hips.position.y = 0.95 - 0.55 * k;
        p.rKnee.rotation.x = 2.2 * k; p.lKnee.rotation.x = 2.2 * k;
        p.rHip.rotation.x = -1.0 * k; p.lHip.rotation.x = -1.0 * k;
        p.hips.rotation.x = 0.7 * k;
        p.neck.rotation.x = 0.6 * k;
        p.rShoulder.rotation.x = 0.4; p.lShoulder.rotation.x = 0.4;
        break;
      }
      case CombatState.KNOCKDOWN:
      case CombatState.DEAD: {
        const k = Math.min(1, ctx.stateFrame / 10);
        this.mannequin.rotation.x = -Math.PI / 2 * k;
        p.hips.position.y = 0.95 - 0.72 * k;
        p.hips.position.z = -0.3 * k;
        p.rShoulder.rotation.z = -1.4; p.lShoulder.rotation.z = 1.4;
        p.rShoulder.rotation.x = 0.6; p.lShoulder.rotation.x = 0.6;
        p.rKnee.rotation.x = 0.3;
        break;
      }
      case CombatState.WALL_SPLAT: {
        p.hips.rotation.x = -0.5;
        p.rShoulder.rotation.z = -2.0; p.lShoulder.rotation.z = 2.0;
        p.rShoulder.rotation.x = 0.9; p.lShoulder.rotation.x = 0.9;
        p.rHip.rotation.x = -0.4; p.lHip.rotation.x = -0.6;
        p.rKnee.rotation.x = 0.6; p.lKnee.rotation.x = 0.9;
        p.neck.rotation.x = -0.5;
        p.hips.position.y = 1.0;
        break;
      }
      case CombatState.SUBSTITUTED: {
        p.hips.position.y = 0.95;
        p.rShoulder.rotation.x = -1.8; p.lShoulder.rotation.x = -1.8;
        p.rElbow.rotation.x = -1.6; p.lElbow.rotation.x = -1.6;
        break;
      }
    }
    if (this.bladeGroup && st !== CombatState.COMBO_STRING) this.bladeGroup.rotation.x = -1.4;
  }
}
