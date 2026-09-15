"""Sprite VFX (Kenney CC0 particle sheets) layered on the existing mesh particles, and AI use of the
new mechanics (air strings, ultimate, awakening)."""
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rw(rel, fn, marker=None):
    p = os.path.join(root, rel); s = open(p, encoding='utf-8').read()
    if marker and marker in s: print('already', rel); return
    s2 = fn(s); assert s2 != s, rel
    open(p, 'w', encoding='utf-8').write(s2); print('patched', rel)
def rep(s, old, new, count=1):
    assert old in s, old[:100]; return s.replace(old, new, count)

def fx(s):
    s = rep(s, """export class Effects {
  readonly group = new THREE.Group();
  private particles: Particle[] = [];""", """interface SpriteFx {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  grow: number;
  gravity: number;
  spin: number;
  fadeIn: number;
}

/** Kenney particle sheets (CC0) in public/assets/vfx. */
const VFX_TEX: Record<string, string> = {
  spark: 'assets/vfx/spark_04.png',
  spark2: 'assets/vfx/spark_05.png',
  star: 'assets/vfx/star_07.png',
  flare: 'assets/vfx/flare_01.png',
  light: 'assets/vfx/light_02.png',
  smoke: 'assets/vfx/smoke_04.png',
  smoke2: 'assets/vfx/smoke_08.png',
  dirt: 'assets/vfx/dirt_02.png',
  magic: 'assets/vfx/magic_04.png',
  magic2: 'assets/vfx/magic_05.png',
  twirl: 'assets/vfx/twirl_02.png',
  slash: 'assets/vfx/slash_03.png',
  circle: 'assets/vfx/circle_05.png',
  trace: 'assets/vfx/trace_03.png',
  scorch: 'assets/vfx/scorch_01.png',
  flame: 'assets/vfx/flame_03.png',
};

export class Effects {
  readonly group = new THREE.Group();
  private particles: Particle[] = [];
  private sprites: SpriteFx[] = [];
  private texCache = new Map<string, THREE.Texture>();
  private spriteMatCache = new Map<string, THREE.SpriteMaterial>();

  private tex(name: string): THREE.Texture {
    let t = this.texCache.get(name);
    if (!t) {
      t = new THREE.TextureLoader().load(VFX_TEX[name] ?? VFX_TEX.spark);
      t.colorSpace = THREE.SRGBColorSpace;
      this.texCache.set(name, t);
    }
    return t;
  }

  private spriteMat(name: string, color: number, additive: boolean): THREE.SpriteMaterial {
    const key = `${name}|${color}|${additive ? 1 : 0}`;
    let m = this.spriteMatCache.get(key);
    if (!m) {
      m = new THREE.SpriteMaterial({ map: this.tex(name), color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: 1 });
      this.spriteMatCache.set(key, m);
    }
    return m;
  }

  /**
   * Billboard burst: `count` sprites of sheet `name` thrown from `pos`. Additive for light/sparks,
   * normal blending for smoke/dirt. Each sprite gets its own material clone so opacity can fade.
   */
  spriteBurst(name: string, pos: THREE.Vector3, opts: { color?: number; count?: number; size?: number; life?: number; speed?: number; up?: number; gravity?: number; grow?: number; additive?: boolean; spin?: number; spread?: number; fadeIn?: number } = {}): void {
    const count = opts.count ?? 6;
    const base = this.spriteMat(name, opts.color ?? 0xffffff, opts.additive ?? true);
    for (let i = 0; i < count; i++) {
      const mat = base.clone();
      mat.rotation = Math.random() * Math.PI * 2;
      const sp = new THREE.Sprite(mat);
      const size = (opts.size ?? 0.8) * (0.7 + Math.random() * 0.6);
      sp.scale.setScalar(size);
      sp.position.copy(pos);
      const spread = opts.spread ?? 0.25;
      sp.position.x += (Math.random() - 0.5) * spread * 2;
      sp.position.y += (Math.random() - 0.5) * spread * 2;
      sp.position.z += (Math.random() - 0.5) * spread * 2;
      const vel = new THREE.Vector3((Math.random() - 0.5) * 2, (opts.up ?? 0.4) + Math.random() * 0.8, (Math.random() - 0.5) * 2);
      vel.normalize().multiplyScalar((opts.speed ?? 2.5) * (0.4 + Math.random() * 0.9));
      this.group.add(sp);
      const life = (opts.life ?? 0.35) * (0.7 + Math.random() * 0.6);
      this.sprites.push({ sprite: sp, vel, life, maxLife: life, grow: opts.grow ?? 0, gravity: opts.gravity ?? 0, spin: (opts.spin ?? 0) * (Math.random() < 0.5 ? -1 : 1), fadeIn: opts.fadeIn ?? 0 });
    }
  }

  /** One big flat flash at the impact point (hit flash / jutsu flash). */
  flash(name: string, pos: THREE.Vector3, size = 2.2, color = 0xffffff, life = 0.18): void {
    this.spriteBurst(name, pos, { color, count: 1, size, life, speed: 0, up: 0, spread: 0, grow: size * 3, additive: true });
  }""")
    s = rep(s, """  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {""", """  update(dt: number): void {
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const p = this.sprites[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.sprite);
        p.sprite.material.dispose();
        this.sprites.splice(i, 1);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      if (p.grow) p.sprite.scale.addScalar(p.grow * dt);
      p.sprite.material.rotation += p.spin * dt;
      const age = 1 - t;
      const fade = p.fadeIn > 0 ? Math.min(1, age / p.fadeIn) : 1;
      p.sprite.material.opacity = Math.min(1, t * 1.4) * fade;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {""")
    # layer sprites onto the existing cues
    s = rep(s, """  hitSpark(pos: THREE.Vector3, color = 0xffe066, count = 10, power = 6): void {""", """  hitSpark(pos: THREE.Vector3, color = 0xffe066, count = 10, power = 6): void {
    this.flash('light', pos, 1.6 + power * 0.08, 0xffffff, 0.14);
    this.spriteBurst('spark', pos, { color, count: Math.min(8, Math.round(count * 0.7)), size: 0.55, life: 0.3, speed: 4.5, up: 0.6, gravity: -9, additive: true, spin: 6 });
    this.spriteBurst('star', pos, { color: 0xffffff, count: 2, size: 0.9, life: 0.16, speed: 0.5, grow: 2.5, additive: true });""")
    s = rep(s, """  smokePuff(pos: THREE.Vector3, color = 0xdddddd, count = 10): void {""", """  smokePuff(pos: THREE.Vector3, color = 0xdddddd, count = 10): void {
    this.spriteBurst('smoke', pos, { color, count: Math.min(6, Math.round(count * 0.6)), size: 1.0, life: 0.55, speed: 1.6, up: 0.8, grow: 1.4, additive: false, spin: 1.5, spread: 0.3 });""")
    s = rep(s, """  guardSpark(pos: THREE.Vector3, color: number): void {""", """  guardSpark(pos: THREE.Vector3, color: number): void {
    this.flash('circle', pos, 1.4, color, 0.16);
    this.spriteBurst('spark2', pos, { color, count: 5, size: 0.45, life: 0.25, speed: 3.5, additive: true, spin: 4 });""")
    s = rep(s, """  clashBurst(pos: THREE.Vector3): void {""", """  clashBurst(pos: THREE.Vector3): void {
    this.flash('flare', pos, 3.5, 0xffffff, 0.3);
    this.spriteBurst('twirl', pos, { color: 0xfff1a8, count: 1, size: 2.4, life: 0.35, speed: 0, up: 0, grow: 6, additive: true, spin: 5 });
    this.spriteBurst('spark', pos, { color: 0xffe066, count: 12, size: 0.6, life: 0.4, speed: 7, up: 0.7, gravity: -12, additive: true, spin: 8 });""")
    s = rep(s, """  chargeAura(pos: THREE.Vector3, color: number): void {""", """  chargeAura(pos: THREE.Vector3, color: number): void {
    this.spriteBurst('magic', pos, { color, count: 2, size: 0.7, life: 0.5, speed: 1.2, up: 1.4, additive: true, spin: 2, spread: 0.6, fadeIn: 0.2 });""")
    s = rep(s, """  dashTrail(pos: THREE.Vector3, color: number): void {""", """  dashTrail(pos: THREE.Vector3, color: number): void {
    this.spriteBurst('light', pos, { color, count: 1, size: 1.1, life: 0.22, speed: 0, up: 0, additive: true, grow: 1.5 });""")
    s = rep(s, """  wallDust(pos: THREE.Vector3, normal: THREE.Vector3): void {""", """  wallDust(pos: THREE.Vector3, normal: THREE.Vector3): void {
    this.spriteBurst('dirt', pos, { color: 0xd8cbb0, count: 6, size: 0.9, life: 0.5, speed: 2.5, up: 0.9, gravity: -6, additive: false, spin: 2, spread: 0.4 });""")
    s = rep(s, """  rasenganTick(pos: THREE.Vector3): void {""", """  rasenganTick(pos: THREE.Vector3): void {
    this.spriteBurst('magic2', pos, { color: 0x9fd8ff, count: 1, size: 1.0, life: 0.16, speed: 0.5, additive: true, spin: 12 });""")
    s = rep(s, """  chidoriTick(pos: THREE.Vector3): void {""", """  chidoriTick(pos: THREE.Vector3): void {
    this.spriteBurst('spark2', pos, { color: 0xbfe8ff, count: 2, size: 0.8, life: 0.12, speed: 3, additive: true, spin: 10, spread: 0.3 });""")
    s = rep(s, """  switchFlash(pos: THREE.Vector3, color: number): void {""", """  switchFlash(pos: THREE.Vector3, color: number): void {
    this.flash('flare', pos, 2.6, color, 0.25);""")
    return s
rw('src/render/Effects.ts', fx, 'spriteBurst(')

def ai(s):
    s = rep(s, """      case 'APPROACH': {
        this.source.releaseAll();
        if (dist > 2.5) {""", """      case 'APPROACH': {
        this.source.releaseAll();
        // Ultimate when the gauge is full and the enemy is in range; awakening when hurt (hold chakra).
        if (f.stats.chakra >= 90 && dist < 9 && this.tapTimer <= 0 && this.rng() < 0.2 && (f.state === CombatState.IDLE_NEUTRAL || f.state === CombatState.RUNNING)) {
          this.tap(InputFlag.ULTIMATE);
          this.tapTimer = 2.0;
          break;
        }
        if (!f.awakened && f.stats.health <= f.stats.healthMax * 0.5 && dist > 6 && this.chargeHold <= 0 && this.rng() < 0.02) {
          this.source.press(InputFlag.CHARGE);
          this.chargeHold = 1.1;
        }
        if (this.chargeHold > 0) {
          this.chargeHold -= dt;
          this.source.moveX = 0; this.source.moveY = 0;
          this.source.press(InputFlag.CHARGE);
          if (this.chargeHold <= 0) this.source.release(InputFlag.CHARGE);
          break;
        }
        if (dist > 2.5) {""")
    s = rep(s, """      case 'COMBO': {
        this.source.release(InputFlag.GUARD);""", """      case 'COMBO': {
        this.source.release(InputFlag.GUARD);
        // Air string: when already airborne near the enemy, keep swinging; occasionally jump in.
        if (!f.grounded && dist < 3.5 && this.tapTimer <= 0) {
          this.tap(InputFlag.ATTACK);
          this.tapTimer = 0.14;
          break;
        }
        if (f.grounded && dist < 3 && t.position.y > 1.2 && this.tapTimer <= 0 && this.rng() < 0.3) {
          this.tap(InputFlag.JUMP);
          this.tapTimer = 0.25;
          break;
        }""")
    return s
rw('src/combat/AIBrain.ts', ai, 'InputFlag.ULTIMATE')
print('ok')
