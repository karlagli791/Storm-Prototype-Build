"""Session 9: team of three, two assist types, modes (VS COM / VS PLAYER / TRAINING / demo),
two controllers, title + menus + options + move list + pause + results, post effects, stage
lighting presets, smear frames, ground rings / dust / cracks, 20+ stages, battle music."""
import os, re
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rw(rel, fn, marker=None):
    p = os.path.join(root, rel); s = open(p, encoding='utf-8').read()
    if marker and marker in s: print('already', rel); return
    s2 = fn(s); assert s2 != s, rel
    open(p, 'w', encoding='utf-8').write(s2); print('patched', rel)
def rep(s, old, new, count=1):
    assert old in s, old[:120]; return s.replace(old, new, count)

# ------------------------------------------------------------------------------------ Team
def fighter(s):
    s = rep(s, """  active: Fighter;
  bench: Fighter;
  /** Fighters currently present in the arena (leader + any autonomous outgoing fighter). */
  readonly present: Fighter[] = [];

  constructor(public readonly name: string, public readonly slot: number, leader: Fighter, support: Fighter, public humanSource: InputSource) {
    this.stats = new CombatStats(leader.def.health);
    this.active = leader;
    this.bench = support;
    leader.team = this;
    support.team = this;
    this.present.push(leader);
    leader.rig.root.visible = true;
    support.rig.root.visible = false;
  }""", """  active: Fighter;
  /** The two supports (Storm 3/4 team of three). Leader switch rotates a support in. */
  supports: Fighter[];
  /** Fighters currently present in the arena (leader + any autonomous outgoing fighter). */
  readonly present: Fighter[] = [];

  constructor(public readonly name: string, public readonly slot: number, leader: Fighter, supports: Fighter[], public humanSource: InputSource) {
    this.stats = new CombatStats(leader.def.health);
    this.active = leader;
    this.supports = supports;
    leader.team = this;
    for (const s of supports) { s.team = this; s.rig.root.visible = false; }
    this.present.push(leader);
    leader.rig.root.visible = true;
  }

  /** First support (legacy accessor). */
  get bench(): Fighter { return this.supports[0]; }
  /** Every member: leader first. */
  get members(): Fighter[] { return [this.active, ...this.supports]; }""")
    s = rep(s, """  performSwitch(): Fighter {
    const out = this.active;
    const inc = this.bench;""", """  performSwitch(index = 0): Fighter {
    const out = this.active;
    const inc = this.supports[index] ?? this.supports[0];""")
    s = rep(s, """    this.active = inc;
    this.bench = out;
    if (!this.present.includes(inc)) this.present.push(inc);
    return inc;""", """    this.active = inc;
    this.supports[this.supports.indexOf(inc)] = out;
    if (!this.present.includes(inc)) this.present.push(inc);
    return inc;""")
    return s
rw('src/combat/Fighter.ts', fighter, 'supports: Fighter[]')

# ------------------------------------------------------------------------------------ HUD
def hud(s):
    s = rep(s, """  partnerName: string;
  /** Storm 2 face_le portrait paths (leader / support). */
  portrait: string | null;
  supportPortrait: string | null;
  supportType: 'ATTACK' | 'GUARD' | 'BALANCE';
  /** Support gauge at or above the call cost. */
  supportReady: boolean;""", """  /** Storm 2 face_le portrait path of the leader. */
  portrait: string | null;
  /** The two supports (L1 / R1). */
  supports: { name: string; portrait: string | null; type: 'ATTACK' | 'GUARD' | 'BALANCE'; ready: boolean }[];
  /** Human-controlled side (shows button tags instead of AI). */
  human: boolean;""")
    a = s.index("    // Support medallion under the portrait")
    b = s.index("    // Support gauge (thin, purple) under the chakra bar")
    s = s[:a] + """    // Support medallions under the portrait (Storm 3/4 layout: two faces with L1 / R1 tags)
    const sr = 19;
    for (let si = 0; si < f.supports.length; si++) {
      const sup = f.supports[si];
      const sx = mirror ? px + 6 + si * (sr * 2 + 10) : px - 6 - si * (sr * 2 + 10);
      const sy = py + pr + sr + 6;
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, sr + 3, 0, Math.PI * 2);
      ctx.fillStyle = sup.ready ? (sup.type === 'ATTACK' ? '#c0392b' : sup.type === 'GUARD' ? '#2c6fd2' : '#8a4dff') : '#2a2438';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.clip();
      const sim = portrait(sup.portrait);
      if (sim) ctx.drawImage(sim, sx - sr, sy - sr, sr * 2, sr * 2);
      else { ctx.fillStyle = '#555'; ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2); }
      if (!sup.ready) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2); }
      ctx.restore();
      ctx.save();
      ctx.font = 'bold 9px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#111';
      ctx.fillRect(sx - 14, sy + sr - 2, 28, 12);
      ctx.fillStyle = '#fff';
      ctx.fillText(f.human ? (si === 0 ? 'L1' : 'R1') : 'AI', sx, sy + sr + 7);
      ctx.font = '8px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(sup.type[0], sx, sy - sr - 3);
      ctx.restore();
    }

""" + s[b:]
    return s
rw('src/ui/UIOverlay.ts', hud, 'supports: { name')

# ------------------------------------------------------------------------------------ smear
def shaders(s):
    # both vertex shaders: add a smear uniform and stretch away from the motion direction
    s = s.replace("  #include <skinning_pars_vertex>\n", "  #include <skinning_pars_vertex>\n  uniform vec3 uSmear;\n")
    s = s.replace("    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);\n", """    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
    // Smear frame: vertices facing away from the travel direction trail behind (dash / hop streak).
    float smearLen = length(uSmear);
    if (smearLen > 0.0001) {
      vec3 nW = normalize(mat3(modelMatrix) * objectNormal);
      float k = max(0.0, -dot(nW, uSmear / smearLen));
      worldPos.xyz -= uSmear * k;
    }
""")
    s = s.replace("    uniforms: {\n", "    uniforms: {\n      uSmear: { value: new THREE.Vector3() },\n")
    return s
rw('src/render/Shaders.ts', shaders, 'uSmear')

def rig(s):
    s = rep(s, "  private awakenedVisual = false;", """  private smearVec = new THREE.Vector3();
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

  private awakenedVisual = false;""")
    return s
rw('src/render/FighterRig.ts', rig, 'setSmear')

# ------------------------------------------------------------------------------------ effects
def effects(s):
    s = rep(s, "export class Effects {\n  readonly group = new THREE.Group();", """interface GroundFx { mesh: THREE.Mesh; life: number; maxLife: number; grow: number; fadeIn: number; }

export class Effects {
  readonly group = new THREE.Group();
  private ground: GroundFx[] = [];
  private decals: GroundFx[] = [];
  private groundMatCache = new Map<string, THREE.MeshBasicMaterial>();
  private planeGeo = new THREE.PlaneGeometry(1, 1);

  private groundMat(name: string, color: number, additive: boolean): THREE.MeshBasicMaterial {
    const key = `${name}|${color}|${additive ? 1 : 0}`;
    let m = this.groundMatCache.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: this.tex(name), color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      this.groundMatCache.set(key, m);
    }
    return m;
  }

  private groundPlane(name: string, pos: THREE.Vector3, size: number, color: number, additive: boolean, life: number, grow: number, list: GroundFx[], fadeIn = 0, rot = 0): void {
    const mesh = new THREE.Mesh(this.planeGeo, this.groundMat(name, color, additive).clone());
    mesh.rotation.set(-Math.PI / 2, 0, rot);
    mesh.position.copy(pos);
    mesh.position.y += 0.035 + list.length * 0.0004;
    mesh.scale.setScalar(size);
    mesh.renderOrder = 5;
    this.group.add(mesh);
    list.push({ mesh, life, maxLife: life, grow, fadeIn });
    if (list.length > 28) { const old = list.shift()!; this.group.remove(old.mesh); }
  }

  /** Expanding flat ring on the ground (dash launch, landings, impacts). */
  groundRing(pos: THREE.Vector3, size = 2.2, color = 0xfff4d8, life = 0.35): void {
    this.groundPlane('circle', pos, size * 0.4, color, true, life, size * 3.2, this.ground);
  }
  /** Low, heavy dust kicked up at the feet. */
  dustKick(pos: THREE.Vector3, count = 8, size = 0.7, spread = 0.6): void {
    this.spriteBurst('smoke2', pos, { color: 0xd8cfc0, count, size, life: 0.55, speed: 2.2 * spread, up: 0.8, gravity: -1.5, grow: 2.2, spread: 1, fadeIn: 0.05 });
    this.spriteBurst('dirt', pos, { color: 0xb8a890, count: Math.ceil(count / 2), size: size * 0.4, life: 0.5, speed: 4 * spread, up: 3, gravity: 14, spin: 6 });
  }
  /** Persistent crack / scorch decal where something hit the ground hard. */
  groundCrack(pos: THREE.Vector3, size = 2.0, scorch = false): void {
    this.groundPlane(scorch ? 'scorch' : 'scratch', pos, size, scorch ? 0x1a1410 : 0x2a2420, false, 9.0, 0, this.decals, 0, Math.random() * Math.PI * 2);
    this.dustKick(pos, 10, 0.9, 1.1);
    this.groundRing(pos, size * 1.6, 0xe8dcc0, 0.3);
  }
  /** Gust: a wide, fast, faint ring plus a puff of air streaks (jumps, dashes, heavy swings). */
  gust(pos: THREE.Vector3, size = 3, color = 0xffffff): void {
    this.groundRing(pos, size, color, 0.28);
    this.spriteBurst('trace', pos, { color: 0xffffff, count: 4, size: 0.9, life: 0.22, speed: 6, up: 0.4, additive: true, spread: 1, grow: 2.5 });
  }
  private updateGround(dt: number): void {
    for (const list of [this.ground, this.decals]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const g = list[i];
        g.life -= dt;
        const t = 1 - Math.max(0, g.life) / g.maxLife;
        if (g.grow) g.mesh.scale.setScalar(g.mesh.scale.x + g.grow * dt);
        const m = g.mesh.material as THREE.MeshBasicMaterial;
        m.opacity = list === this.decals ? (g.life < 2 ? g.life / 2 : 1) * 0.85 : (1 - t) * (1 - t);
        if (g.life <= 0) { this.group.remove(g.mesh); list.splice(i, 1); }
      }
    }
  }""")
    s = rep(s, "  update(dt: number): void {\n", "  update(dt: number): void {\n    this.updateGround(dt);\n")
    s = rep(s, "  scorch: 'assets/vfx/scorch_01.png',", "  scorch: 'assets/vfx/scorch_01.png',\n  scratch: 'assets/vfx/scratch_01.png',\n  trace1: 'assets/vfx/trace_01.png',\n  window: 'assets/vfx/window_01.png',")
    return s
rw('src/render/Effects.ts', effects, 'groundCrack')

# ------------------------------------------------------------------------------------ camera
def cam(s):
    s = rep(s, "  dashTarget = 0;", "  dashTarget = 0;\n  /** Player option: scales the follow distance (0.7 close … 1.4 far). */\n  distanceScale = 1;")
    s = rep(s, "    const back = clamp(P.BACK_MIN + P.BACK_K * d, P.BACK_MIN, P.BACK_MAX);\n    const up = clamp(P.UP_MIN + P.UP_K * d, P.UP_MIN, P.UP_MAX);",
               "    const back = clamp(P.BACK_MIN + P.BACK_K * d, P.BACK_MIN, P.BACK_MAX) * this.distanceScale;\n    const up = clamp(P.UP_MIN + P.UP_K * d, P.UP_MIN, P.UP_MAX) * (0.7 + 0.3 * this.distanceScale);")
    return s
rw('src/systems/DualTargetCamera.ts', cam, 'distanceScale')

print('core patches ok')
