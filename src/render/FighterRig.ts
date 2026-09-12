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
import { CharacterDef, CombatState } from '../core/Types';
import { SOCKET } from '../combat/CharacterDefs';
import { addInvertedHull, createCelMaterial } from './Shaders';

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
}

export class FighterRig {
  readonly root = new THREE.Group();
  readonly sockets = new Map<string, THREE.Object3D>();
  readonly mannequin = new THREE.Group();
  private glbRoot: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private clips = new Map<string, THREE.AnimationClip>();
  private activeAction: THREE.AnimationAction | null = null;
  private time = 0;
  private parts: Record<string, THREE.Object3D> = {};
  private bladeGroup: THREE.Group | null = null;
  public usingGlb = false;

  constructor(private def: CharacterDef) {
    this.buildMannequin();
    this.root.add(this.mannequin);
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
      // Normalize height to ~1.85 m
      const box = new THREE.Box3().setFromObject(scene);
      const size = new THREE.Vector3();
      box.getSize(size);
      const s = size.y > 1e-3 ? 1.85 / size.y : 1;
      scene.scale.setScalar(s);
      scene.position.y = -box.min.y * s;

      // Cel-shade every mesh
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
          const map = (src && (src as THREE.MeshStandardMaterial).map) || null;
          const color = src && (src as THREE.MeshStandardMaterial).color ? (src as THREE.MeshStandardMaterial).color : new THREE.Color(this.def.color);
          m.material = createCelMaterial({ albedo: color, map, rimColor: 0xffffff, skinning: (m as THREE.SkinnedMesh).isSkinnedMesh });
          m.frustumCulled = false;
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

      this.mixer = new THREE.AnimationMixer(scene);
      for (const c of gltf.animations) this.clips.set(c.name, c);

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
    if (this.usingGlb && this.mixer) {
      this.updateGlbAnimation(ctx, dt);
      return;
    }
    this.poseMannequin(ctx);
  }

  private pickClip(ctx: PoseContext): string | null {
    const names = [...this.clips.keys()];
    if (!names.length) return null;
    // CC2 clip codes (from bod1c / bod1l containers): nut0 idle, run1 run, jmp0 jump, lan0 land,
    // dsf0 dash, dsh0s dash-hit, grd0 guard, ghf0 guard-hit, gda0 guard-break, dmg0f damage,
    // dow0 knockdown, cmaNN neutral string, cmbNN branch strings, hola0 hold.
    const c = this.def.code;
    const want: string[] = [];
    if (ctx.moveClip) want.push(ctx.moveClip);
    else if (ctx.moveName) want.push(ctx.moveName);
    switch (ctx.state) {
      case CombatState.RUNNING: want.push(`${c}run1`, 'run', 'dash', 'walk'); break;
      case CombatState.DASH_STARTUP: case CombatState.DASH_CHARGING: want.push(`${c}dsh0s`, `${c}dsf0`, 'dash'); break;
      case CombatState.DASH_HOMING: case CombatState.SPARK_DASH: want.push(`${c}dsf0`, `${c}dsh1l`, 'chakra_dash', 'dash', 'run'); break;
      case CombatState.DASH_IMPACT: case CombatState.DASH_REBOUND: case CombatState.DASH_CLASH: want.push(`${c}lan0`, `${c}dsh0l`, 'land'); break;
      case CombatState.GUARDING: want.push(`${c}grd0`, 'guard', 'block'); break;
      case CombatState.GUARD_COUNTER: want.push(`${c}gda0`, `${c}grd0`, 'guard'); break;
      case CombatState.BLOCKSTUN: want.push(`${c}ghf0`, `${c}grd0`, 'guard'); break;
      case CombatState.GUARD_BREAK: want.push(`${c}gda0`, `${c}dmg0f`, 'damage'); break;
      case CombatState.HITSTUN: want.push(`${c}dmg0f`, `${c}ghf0`, 'damage', 'hit'); break;
      case CombatState.LAUNCHED: case CombatState.TUMBLE: want.push(`${c}dow1`, `${c}dow0`, 'blow', 'launch', 'damage'); break;
      case CombatState.KNOCKDOWN: case CombatState.CRUMPLE: case CombatState.WALL_SPLAT: case CombatState.DEAD: want.push(`${c}dow0`, 'down', 'crumple', 'damage'); break;
      case CombatState.JUMPING: case CombatState.HOLLOW_STEP: case CombatState.NINJA_MOVE: want.push(`${c}jmp0`, 'jump'); break;
      case CombatState.SUBSTITUTED: want.push(`${c}lan0`, `${c}nut0`, 'idle'); break;
      case CombatState.COMBO_STRING: case CombatState.JUTSU: want.push(`${c}cma00`, `${c}nut0`); break;
      default: want.push(`${c}nut0`, 'idle', 'wait', 'stand');
    }
    for (const w of want) {
      const exact = names.find((n) => n === w);
      if (exact) return exact;
      const partial = names.find((n) => n.toLowerCase().includes(w));
      if (partial) return partial;
    }
    return names[0];
  }

  private updateGlbAnimation(ctx: PoseContext, dt: number): void {
    const clipName = this.pickClip(ctx);
    if (clipName && this.mixer) {
      const clip = this.clips.get(clipName)!;
      const action = this.mixer.clipAction(clip);
      if (this.activeAction !== action) {
        if (this.activeAction) this.activeAction.fadeOut(0.08);
        action.reset().fadeIn(0.08).play();
        this.activeAction = action;
      }
    }
    this.mixer?.update(dt);
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
