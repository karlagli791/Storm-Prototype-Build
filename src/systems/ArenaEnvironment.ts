/**
 * ArenaEnvironment.ts — Procedural 32 m cylindrical arena: stone floor, circular boundary wall,
 * radial clamping, wall normal / tangential velocity preservation, and wall-splat evaluation.
 *
 *   r_xz = sqrt(x^2 + z^2)
 *   if r_xz >= R - r_col:  [x,z] *= (R - r_col) / r_xz
 *   n_wall = [-x/r_xz, 0, -z/r_xz]
 *   v_n = dot(v, n_wall);  splat if knockback && v_n <= -8.5
 *   v_tangent = v - (v . n_wall) n_wall
 */
import * as THREE from 'three';
import { ARENA_CEILING, ARENA_RADIUS, PLAYER_COLLIDER_RADIUS, WALL_SPLAT_IMPACT_VN } from '../core/Types';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createCelMaterial, addInvertedHull } from '../render/Shaders';

export interface BoundaryResult {
  /** True if the position was clamped this tick. */
  clamped: boolean;
  /** Normal component of incoming velocity (negative = moving into the wall). */
  vn: number;
  /** True if the impact qualified for a wall splat (caller decides based on state). */
  splatQualified: boolean;
  /** Inward-facing wall normal at the contact point. */
  normal: THREE.Vector3;
}

export class ArenaEnvironment {
  readonly group = new THREE.Group();
  radius = ARENA_RADIUS;
  readonly ceiling = ARENA_CEILING;
  /** Procedural pieces, hidden when a real stage GLB is bound. */
  readonly proceduralFloor = new THREE.Group();
  readonly proceduralWall = new THREE.Group();
  readonly proceduralDressing = new THREE.Group();
  /** Loaded CC2 stage (e.g. sd05a Hidden Leaf forest), if any. */
  stageRoot: THREE.Object3D | null = null;
  stageName: string | null = null;
  private result: BoundaryResult = { clamped: false, vn: 0, splatQualified: false, normal: new THREE.Vector3() };
  private tmpN = new THREE.Vector3();

  constructor() {
    this.group.add(this.proceduralFloor, this.proceduralWall, this.proceduralDressing);
    this.buildFloor();
    this.buildWall();
    this.buildDressing();
  }

  /**
   * Try to bind an exported CC2 stage GLB (public/assets/stage_*.glb). On success the procedural
   * floor and tree dressing are hidden; the gameplay boundary (32 m cylinder) is unchanged and the
   * translucent barrier stays as the visual cue for it.
   */
  /** Remove the bound stage (used when cycling stages) and show the procedural arena again. */
  unloadStage(): void {
    this.radius = ARENA_RADIUS;
    this.limits = null;
    if (this.stageRoot) {
      this.group.remove(this.stageRoot);
      this.stageRoot.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) mat.dispose();
        }
      });
      this.stageRoot = null;
      this.stageName = null;
    }
    this.proceduralFloor.visible = true;
    this.proceduralDressing.visible = true;
    this.proceduralWall.visible = true;
  }

  private floorMeshes: THREE.Mesh[] = [];
  /** Cached floor hits per 0.5 m cell: every surface height under the cell, highest first. */
  private heightCache = new Map<number, number[]>();
  /** Walkable outline: max distance from the arena centre per angle (72 samples), null = circle. */
  private limits: Float32Array | null = null;
  /** Visible vertical stage geometry (walls, cliffs, rocks, tree lines, buildings) that bounds the arena. */
  private obstacles: THREE.Mesh[] = [];
  /** Solid stage geometry fighters may stand on when the named floor meshes do not cover the arena. */
  private walkCandidates: THREE.Mesh[] = [];
  private sideRay = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), 0, 80);
  private heightRay = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 400);

  /**
   * Floor height under (x, z) so fighters follow uneven ground instead of floating or sinking.
   * Raycast against the stage's floor meshes, cached on a 0.5 m grid (the ray only fires for cells
   * nobody has visited yet). Flat 0 when no stage floor is loaded.
   */
  /** Every floor surface height under (x, z), highest first (cached on a 0.5 m grid). */
  private sampleCell(x: number, z: number): number[] {
    const gx = Math.round(x * 2), gz = Math.round(z * 2);
    const key = (gx + 4096) * 8192 + (gz + 4096);
    let ys = this.heightCache.get(key);
    if (ys) return ys;
    this.heightRay.ray.origin.set(gx * 0.5, 120, gz * 0.5);
    const res = this.heightRay.intersectObjects(this.floorMeshes, false);
    // Pit guard: surfaces far below the battle floor (shafts, river beds, skirts) are never ground.
    ys = res.map((r) => r.point.y).filter((y) => y > -4);
    this.heightCache.set(key, ys);
    return ys;
  }

  /**
   * Floor height under (x, z). With `refY` (the fighter's current height) the result is the highest
   * surface at or below the feet plus a small step — fighters stand on the ground they are on instead
   * of popping up onto a roof, bridge deck or canopy above them. Without it: the first surface under
   * +4 m (legacy behaviour for effects).
   */
  groundY(x: number, z: number, refY?: number): number {
    if (!this.floorMeshes.length) return 0;
    const ys = this.sampleCell(x, z);
    if (!ys.length) return 0;
    if (refY === undefined) {
      for (const y of ys) if (y <= 4.0) return y;
      return ys[ys.length - 1];
    }
    for (const y of ys) if (y <= refY + 0.6) return y;
    return ys[ys.length - 1];
  }

  /**
   * Walkable outline of the loaded stage: march outward along 72 rays over the floor meshes and stop
   * where the floor ends or jumps by more than a ledge (wall, cliff, building). Movement is limited to
   * this outline, so fighters stay inside the area the stage was authored for.
   */
  private computeBounds(): void {
    const N = 72;
    const poor = (l: Float32Array | null) => !l || l.filter((v) => v < 12).length > N / 2;
    let lim = this.floorMeshes.length ? this.marchFloor(N) : null;
    if (poor(lim) && this.walkCandidates.length) {
      // The named floor does not cover the arena (villages, hideouts): stand on solid stage geometry.
      this.floorMeshes = this.walkCandidates;
      this.heightCache.clear();
      lim = this.marchFloor(N);
    }
    if (poor(lim)) {
      // No usable floor at all: flat ground at 0, bounded by walls and cliffs only.
      this.floorMeshes = [];
      this.heightCache.clear();
      lim = new Float32Array(N).fill(42);
    }
    const L = lim as Float32Array;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2;
      let edge = L[i];
      // Walls, cliffs, tree lines and buildings at waist height close the arena earlier than the floor.
      if (this.obstacles.length) {
        this.sideRay.ray.origin.set(0, 1.0, 0);
        this.sideRay.ray.direction.set(Math.cos(ang), 0, Math.sin(ang));
        this.sideRay.far = Math.max(1, edge + 1);
        const h = this.sideRay.intersectObjects(this.obstacles, false).find((r) => r.distance >= 12);
        if (h) edge = Math.min(edge, h.distance - 1.2);
      }
      // Storm free-battle scale: the fight happens inside roughly a 42 m radius even on huge maps.
      L[i] = Math.max(9, Math.min(42, edge));
    }
    // A single long spike (a corridor between walls) does not open the arena up.
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) out[i] = Math.min(L[i], (L[(i + N - 1) % N] + L[(i + 1) % N]) * 0.5 + 4);
    this.limits = out;
    let mx = 0;
    for (const v of out) mx = Math.max(mx, v);
    this.radius = Math.min(75, Math.max(ARENA_RADIUS, mx));
  }

  /** Floor march per ray: distance until the floor ends or steps like a wall / cliff (null = no floor at the centre). */
  private marchFloor(N: number): Float32Array | null {
    const step = 1.5, maxR = 60;
    if (!this.sampleCell(0, 0).length) return null;
    const lim = new Float32Array(N);
    const y0 = this.groundY(0, 0, 1);
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2;
      const cx = Math.cos(ang), cz = Math.sin(ang);
      let prev = y0, last = 0;
      for (let r = step; r <= maxR; r += step) {
        const ys = this.sampleCell(cx * r, cz * r);
        if (!ys.length) break;
        let best = ys[0], bd = Math.abs(ys[0] - prev);
        for (const y of ys) { const d = Math.abs(y - prev); if (d < bd) { bd = d; best = y; } }
        if (bd > 1.6) break;
        prev = best;
        last = r;
      }
      lim[i] = last - 1.0;
    }
    return lim;
  }

  /** Allowed distance from the centre in a direction (angle = atan2(z, x)). */
  limitAt(angle: number): number {
    const L = this.limits;
    if (!L) return this.radius;
    const N = L.length;
    let f = (angle / (Math.PI * 2)) * N;
    f = ((f % N) + N) % N;
    const i = Math.floor(f), t = f - i;
    return L[i] * (1 - t) + L[(i + 1) % N] * t;
  }

  async tryLoadStage(path: string): Promise<boolean> {
    try {
      const head = await fetch(path, { method: 'HEAD' });
      if (!head.ok || (head.headers.get('content-type') ?? '').includes('text/html')) return false;
    } catch {
      return false;
    }
    try {
      const gltf = await new GLTFLoader().loadAsync(path);
      const scene = gltf.scene;
      // CC2 stages are Y-up after glTF export; drop the stage so its floor sits at y = 0.
      scene.updateMatrixWorld(true);
      // Battle floor height: raycast straight down at the arena origin against the ground meshes
      // (matched by mesh, material or texture name — CC2 stages usually name the texture "flo0x").
      // CC2 authors the fighting floor at y=0, so fall back to that rather than the scene's lowest
      // point (which is a river bed / backdrop skirt and would lift the whole stage).
      const floorMeshes: THREE.Mesh[] = [];
      this.floorMeshes = floorMeshes;
      this.heightCache.clear();
      scene.updateMatrixWorld(true);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
        const names = `${m.name} ${src?.name ?? ''} ${src?.map?.name ?? ''}`;
        if (/flor|floor|ground|flo0/i.test(names) && !/river|water|hit_/i.test(names)) floorMeshes.push(m);
      });
      let floorY = 0;
      // Playable radius: as much of the floor mesh as exists (capped), so the whole map is walkable.
      if (floorMeshes.length) {
        const fb = new THREE.Box3();
        for (const m of floorMeshes) fb.expandByObject(m);
        const ext = Math.min(fb.max.x, -fb.min.x, fb.max.z, -fb.min.z);
        this.radius = Number.isFinite(ext) && ext > 10 ? Math.min(75, Math.max(ARENA_RADIUS, ext * 0.92)) : ARENA_RADIUS;
      } else this.radius = ARENA_RADIUS;
      if (floorMeshes.length) {
        const ray = new THREE.Raycaster(new THREE.Vector3(0, 200, 0), new THREE.Vector3(0, -1, 0), 0, 400);
        const hits = ray.intersectObjects(floorMeshes, false);
        if (hits.length) floorY = hits[0].point.y;
        else {
          const b = new THREE.Box3();
          for (const m of floorMeshes) b.expandByObject(m);
          floorY = b.max.y;
        }
      }
      scene.position.y -= floorY;
      scene.updateMatrixWorld(true);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        // "*_batch*" meshes are prop templates the game instances at runtime from stage params;
        // in a static export they all pile up at the origin, so hide them.
        if (/_batch/i.test(m.name)) {
          m.visible = false;
          return;
        }
        // Bone-placed props (tree trunks "ki", branch clusters "eda") collapse onto the origin in a
        // static export. Anything tall sitting inside the fighting circle is one of those; hide it.
        if (!/flor|floor|ground|kusa|gls|art|sky|enkei|shadow/i.test(m.name)) {
          const b = new THREE.Box3().setFromObject(m);
          const cx = (b.min.x + b.max.x) * 0.5;
          const cz = (b.min.z + b.max.z) * 0.5;
          const r = Math.hypot(cx, cz);
          const tall = b.max.y - b.min.y > 2.5;
          // Environment rings / domes (mountains, tree lines, sky) are centred on the origin too but
          // span the whole map; only compact meshes are collapsed props.
          const wide = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) > 40;
          // Rooted inside the circle, or a collapsed cluster hovering right over the origin.
          if (tall && !wide && ((r < 14 && b.min.y < 2) || r < 8)) {
            m.visible = false;
            return;
          }
        }
        // Engine light-shaft placeholders ("backlight") carry no texture and would draw as black sheets.
        if (/backlight/i.test(m.name)) {
          m.visible = false;
          return;
        }
        const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
        const map = src?.map ?? null;
        const names = m.name + ' ' + (src?.name ?? '') + ' ' + (map?.name ?? '');
        const hasAlpha = !!src && (src.transparent || (src as THREE.MeshStandardMaterial).alphaTest > 0);
        // Foliage / grass cards: hard alpha test (crisp, no sorting issues).
        const foliage = /ha0|kusa|eda|leaf|tree|ki0|gls|art|grass|bac0/i.test(names);
        // Everything else with a real alpha channel (ground overlays, dapple sheets): blended.
        const blended = hasAlpha && !foliage;
        const mat = createCelMaterial({
          albedo: src?.color ?? 0xffffff,
          map,
          rimColor: 0x000000,
          alphaTest: (hasAlpha || foliage) && map && !blended ? 0.5 : 0,
          alphaBlend: blended && !!map,
          doubleSided: hasAlpha || foliage,
        });
        if (blended) m.renderOrder = 1;
        mat.uniforms.uRimThreshold.value = 2.0;
        mat.uniforms.uSpecThreshold.value = 2.0;
        // Stage lighting: a real sun term (shadow band at 62 %) instead of the flat look.
        mat.uniforms.uLightColor.value = new THREE.Color(0.55, 0.53, 0.5);
        mat.uniforms.uAmbient.value = new THREE.Color(0.62, 0.63, 0.66);
        // CC2 stages layer "light" (sun dapple) and "shadow" planes over the ground; they are
        // additive / multiplicative FX sheets, not opaque geometry.
        const texName = (map?.name ?? '') + ' ' + m.name + ' ' + (src?.name ?? '');
        if (/sky|enkei|back0|bac0|cloud/i.test(texName) && !hasAlpha) {
          // Sky dome / distant backdrop: unlit so it never goes dark on the far side.
          mat.uniforms.uLightColor.value = new THREE.Color(0, 0, 0);
          mat.uniforms.uAmbient.value = new THREE.Color(1, 1, 1);
        }
        if (/light|glow|flare/i.test(texName) || /shadow|kage/i.test(texName)) {
          const additive = /light|glow|flare/i.test(texName);
          mat.depthWrite = false;
          mat.blending = additive ? THREE.AdditiveBlending : THREE.MultiplyBlending;
          // Flat: output the texture as-is (no banding).
          mat.uniforms.uLightColor.value = new THREE.Color(0, 0, 0);
          mat.uniforms.uAmbient.value = new THREE.Color(1, 1, 1);
          if (additive) {
            mat.transparent = true;
            m.renderOrder = 2;
          } else {
            // Canopy / ground shadow sheets multiply what is under them. Draw them right after the
            // stage geometry but before the fighters (rig meshes use renderOrder 10) so characters are
            // never darkened by a sheet floating above the arena.
            mat.transparent = false;
            m.renderOrder = 1;
          }
        }
        m.material = mat;
        m.frustumCulled = false;
        m.castShadow = false;
      });
      this.obstacles = [];
      this.walkCandidates = [];
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.visible || floorMeshes.includes(m)) return;
        const mm = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.ShaderMaterial & { name?: string };
        const nm = `${m.name} ${mm?.name ?? ''}`;
        if (/kusa|gls|grass|ha0|leaf|eda|art|shadow|kage|light|glow|flare|sky|enkei|bac0|back0|cloud|water|river|fog|eff/i.test(nm)) return;
        const b = new THREE.Box3().setFromObject(m);
        if (b.min.y < 3 && b.max.y > -4) this.walkCandidates.push(m);
        if (b.max.y - b.min.y < 1.6 || b.min.y > 2.5) return; // low clutter or overhead geometry
        this.obstacles.push(m);
      });
      this.computeBounds();
      this.stageRoot = scene;
      this.heightCache.clear();
      this.stageName = path.split('/').pop() ?? path;
      this.group.add(scene);
      this.proceduralFloor.visible = false;
      this.proceduralDressing.visible = false;
      this.proceduralWall.visible = false;
      return true;
    } catch (err) {
      console.warn('[ArenaEnvironment] stage load failed', err);
      return false;
    }
  }

  private buildFloor(): void {
    const R = this.radius;
    // Main stone disc
    const floorGeo = new THREE.CircleGeometry(R + 2.0, 96);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = createCelMaterial({ albedo: 0x8a8f7a, rimColor: 0x000000 });
    floorMat.uniforms.uRimThreshold.value = 2.0; // disable rim on floor
    floorMat.uniforms.uSpecThreshold.value = 2.0;
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.receiveShadow = true;
    this.proceduralFloor.add(floor);

    // Concentric ring inlays for orientation reference
    const ringMat = createCelMaterial({ albedo: 0x6e7360 });
    ringMat.uniforms.uRimThreshold.value = 2.0;
    ringMat.uniforms.uSpecThreshold.value = 2.0;
    for (const r of [6, 14, 22, 30]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.18, r + 0.18, 96), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      this.proceduralFloor.add(ring);
    }
    // Radial lines
    const lineMat = createCelMaterial({ albedo: 0x70745f });
    lineMat.uniforms.uRimThreshold.value = 2.0;
    lineMat.uniforms.uSpecThreshold.value = 2.0;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(0.22, R - 2), lineMat);
      seg.rotation.x = -Math.PI / 2;
      seg.rotation.z = -a;
      seg.position.set(Math.sin(a) * (R / 2 + 1), 0.012, Math.cos(a) * (R / 2 + 1));
      this.proceduralFloor.add(seg);
    }
    // Center emblem
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), ringMat);
    emblem.rotation.x = -Math.PI / 2;
    emblem.position.y = 0.015;
    this.proceduralFloor.add(emblem);
  }

  private buildWall(): void {
    const R = this.radius;
    // Low stone parapet ring at the boundary
    const wallHeight = 2.6;
    const wallGeo = new THREE.CylinderGeometry(R + 0.9, R + 1.2, wallHeight, 96, 1, true);
    const wallMat = createCelMaterial({ albedo: 0x9a917c, rimColor: 0xd9d2b8 });
    wallMat.side = THREE.DoubleSide;
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.y = wallHeight / 2;
    this.proceduralWall.add(wall);

    // Cap on top of the parapet
    const capGeo = new THREE.RingGeometry(R + 0.6, R + 1.4, 96);
    capGeo.rotateX(-Math.PI / 2);
    const cap = new THREE.Mesh(capGeo, createCelMaterial({ albedo: 0xb1a88f }));
    cap.position.y = wallHeight;
    this.proceduralWall.add(cap);

    // Boundary pillars every 22.5 degrees
    const pillarMat = createCelMaterial({ albedo: 0x7d7461, rimColor: 0xe8e0c8 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5.0, 1.4), pillarMat);
      pillar.position.set(Math.sin(a) * (R + 1.0), 2.5, Math.cos(a) * (R + 1.0));
      pillar.rotation.y = a;
      this.proceduralWall.add(pillar);
      addInvertedHull(pillar, 0.05);
    }

    // Faint translucent barrier cylinder (visual hint of the invisible ceiling wall)
    const barrierGeo = new THREE.CylinderGeometry(R, R, this.ceiling, 96, 1, true);
    const barrierMat = new THREE.MeshBasicMaterial({
      color: 0x8fd3ff,
      transparent: true,
      opacity: 0.045,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const barrier = new THREE.Mesh(barrierGeo, barrierMat);
    barrier.position.y = this.ceiling / 2;
    this.group.add(barrier);
  }

  private buildDressing(): void {
    // Distant tree line ring (silhouette props) beyond the wall
    const treeMat = createCelMaterial({ albedo: 0x2f6b3a, rimColor: 0xa6ffb8 });
    const trunkMat = createCelMaterial({ albedo: 0x5a3d2b });
    const rng = mulberry32(1337);
    for (let i = 0; i < 46; i++) {
      const a = rng() * Math.PI * 2;
      const r = this.radius + 6 + rng() * 14;
      const h = 5 + rng() * 6;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, h * 0.5, 8), trunkMat);
      trunk.position.set(Math.sin(a) * r, h * 0.25, Math.cos(a) * r);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(2.2 + rng() * 1.5, h, 8), treeMat);
      crown.position.set(Math.sin(a) * r, h * 0.5 + h * 0.4, Math.cos(a) * r);
      this.proceduralDressing.add(trunk, crown);
      addInvertedHull(crown, 0.06);
    }
    // Ground plane far beyond the arena
    const far = new THREE.Mesh(new THREE.CircleGeometry(220, 64), createCelMaterial({ albedo: 0x4d6b3f }));
    far.rotation.x = -Math.PI / 2;
    far.position.y = -0.05;
    this.proceduralDressing.add(far);
  }

  /**
   * Clamp `pos` radially and vertically, evaluate wall impact against `vel`, and preserve the
   * tangential velocity component. `isKnockback` decides whether a hard impact qualifies for WALL_SPLAT.
   * Mutates pos and vel. Returns a shared result object (do not retain).
   */
  constrain(pos: THREE.Vector3, vel: THREE.Vector3, isKnockback: boolean, colliderRadius = PLAYER_COLLIDER_RADIUS): BoundaryResult {
    const res = this.result;
    res.clamped = false;
    res.vn = 0;
    res.splatQualified = false;

    const limit = this.limitAt(Math.atan2(pos.z, pos.x)) - colliderRadius;
    const rxz = Math.hypot(pos.x, pos.z);
    if (rxz >= limit && rxz > 1e-6) {
      const s = limit / rxz;
      pos.x *= s;
      pos.z *= s;
      // Inward normal
      const n = this.tmpN.set(-pos.x / limit, 0, -pos.z / limit);
      res.normal.copy(n);
      const vn = vel.dot(n);
      res.vn = vn;
      res.clamped = true;
      if (isKnockback && vn <= WALL_SPLAT_IMPACT_VN) {
        res.splatQualified = true;
      }
      // Remove inward-negative (i.e. outward) normal component, keep tangential sliding
      if (vn < 0) {
        vel.addScaledVector(n, -vn); // v_tangent = v - (v.n) n
      }
      // Walking / jumping into the edge stops you there instead of sliding along it.
      if (!isKnockback) { vel.x *= 0.35; vel.z *= 0.35; }
    }

    // Safety floor only below the pit guard: terrain height is resolved by groundY in the controller,
    // so fighters can stand on ground lower than the arena centre instead of hovering at y = 0.
    if (pos.y < -4) {
      pos.y = -4;
      if (vel.y < 0) vel.y = 0;
    }
    // Ceiling
    if (pos.y > this.ceiling - 1.8) {
      pos.y = this.ceiling - 1.8;
      if (vel.y > 0) vel.y = 0;
    }
    return res;
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
