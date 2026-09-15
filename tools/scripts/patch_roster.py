"""Session 5 patch: roster fields, animation bank retargeting, render interpolation, assist rework."""
import os, re
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rw(rel, fn):
    p = os.path.join(root, rel); s = open(p, encoding='utf-8').read(); s2 = fn(s)
    assert s2 != s, rel; open(p, 'w', encoding='utf-8').write(s2); print('patched', rel)
def rep(s, old, new, count=1):
    assert old in s, old[:80]; return s.replace(old, new, count)

# ---------------------------------------------------------------- Types: CharacterDef fields
def types(s):
    s = rep(s, """  /** HUD portrait (Storm 2 face_le texture). */
  portrait?: string;
}""", """  /** HUD portrait (Storm 2 face_le texture). */
  portrait?: string;
  /** Select screen: subtitle line, jutsu label, 128 px icon, full-body stand art, versus face. */
  title?: string;
  jutsuName?: string;
  icon?: string;
  stand?: string;
  vsFace?: string;
  /** Borrow another character's clip set (same CC2 body skeleton); tracks are retargeted by bone prefix. */
  animBank?: string;
}""")
    return s
rw('src/core/Types.ts', types)

# ---------------------------------------------------------------- Fighter: previous transform for render interpolation
def fighter(s):
    s = rep(s, """  position = new THREE.Vector3();
  velocity = new THREE.Vector3();
  yaw = 0;
  grounded = true;
""", """  position = new THREE.Vector3();
  velocity = new THREE.Vector3();
  yaw = 0;
  grounded = true;
  /** Transform at the start of the current simulation tick (render interpolation). */
  prevPosition = new THREE.Vector3();
  prevYaw = 0;
""")
    return s
rw('src/combat/Fighter.ts', fighter)

# ---------------------------------------------------------------- PlayerController: snapshot prev, no mixer stepping here
def pc(s):
    s = rep(s, """    const f = this.fighter;
    f.input.tick(tick);
""", """    const f = this.fighter;
    f.input.tick(tick);
    f.prevPosition.copy(f.position);
    f.prevYaw = f.yaw;
""")
    return s
rw('src/combat/PlayerController.ts', pc)

# ---------------------------------------------------------------- FighterRig: animation bank + advance(dt)
def rig(s):
    s = rep(s, """function loadCommonBank(path = 'assets/cmn_anims.glb'): Promise<THREE.AnimationClip[]> {""",
"""const bankCache = new Map<string, Promise<THREE.AnimationClip[]>>();
/** Clip set of another character's GLB (e.g. Indra borrows 2ssk). Cached per path. */
function loadAnimBank(path: string): Promise<THREE.AnimationClip[]> {
  let p = bankCache.get(path);
  if (!p) {
    p = new GLTFLoader().loadAsync(path).then((g) => g.animations).catch(() => []);
    bankCache.set(path, p);
  }
  return p;
}

function loadCommonBank(path = 'assets/cmn_anims.glb'): Promise<THREE.AnimationClip[]> {""")
    # retarget helper used for both banks
    s = rep(s, """      // Retarget the shared bank: 1cmn00t0_* → <code>00t0_*, dropping tracks for bones this rig lacks.
      const code = this.def.code;
      loadCommonBank().then((bank) => {
        for (const c of bank) {
          const tracks: THREE.KeyframeTrack[] = [];
          for (const t of c.tracks) {
            const dot = t.name.lastIndexOf('.');
            const node = t.name.slice(0, dot).replace(/^1cmn00t0/, `${code}00t0`);
            const prop = t.name.slice(dot + 1);
            if (!this.boneNames.has(node)) continue;
            if (prop === 'position' && (/trall$/i.test(node) || /^\\w{4}00t0$/i.test(node))) continue;
            const nt = t.clone();
            nt.name = `${node}.${prop}`;
            tracks.push(nt);
          }
          if (tracks.length) this.clips.set(c.name, new THREE.AnimationClip(c.name, c.duration, tracks));
        }
      });""",
"""      // Retarget shared banks: <bank>00t0_* → <code>00t0_*, dropping tracks for bones this rig lacks.
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
            if (prop === 'position' && (/trall$/i.test(node) || /^\\w{4}00t0$/i.test(node))) continue;
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
      }""")
    # split mixer stepping out of the fixed tick
    s = rep(s, """  update(ctx: PoseContext, dt: number): void {
    this.time += dt;
    if (this.usingGlb && this.mixer) {
      this.updateGlbAnimation(ctx, dt);
      return;
    }
    this.poseMannequin(ctx);
  }""", """  update(ctx: PoseContext, dt: number): void {
    this.time += dt;
    if (this.usingGlb && this.mixer) {
      this.updateGlbAnimation(ctx, dt);
      return;
    }
    this.poseMannequin(ctx);
  }

  /**
   * Advance the skeletal animation by render time. Kept separate from the fixed 60 Hz tick so the
   * mixer runs at the display's refresh rate (no 60 Hz stepping on 120/144 Hz monitors) and can be
   * frozen during hitstop without touching the simulation.
   */
  advance(dt: number): void {
    if (this.usingGlb && this.mixer && dt > 0) this.mixer.update(dt);
  }""")
    s = rep(s, """        this.play(spec, 0.04);
      }
    }
    this.mixer?.update(dt);
  }""", """        this.play(spec, 0.04);
      }
    }
    void dt;
  }""")
    return s
rw('src/render/FighterRig.ts', rig)

# ---------------------------------------------------------------- SupportSystem: manual call = jutsu assist
def sup(s):
    s = rep(s, """    if (action === 'COMBO_JOIN') {
      s.enterState(CombatState.SUPPORT_ACT);
      s.beginMove(s.def.neutralString.moves[0], 'NEUTRAL', 0);
    }""", """    if (action === 'COMBO_JOIN') {
      // Manual assist (R1 / Y): the support appears beside the enemy and fires its jutsu, then leaves.
      s.enterState(CombatState.SUPPORT_ACT);
      s.beginMove(s.def.jutsu, 'NEUTRAL', 0);
    }""")
    s = rep(s, """    const frames = action === 'COVER_FIRE' ? 40 : action === 'CHARGE_GUARD' ? 45 : 50;""",
              """    const frames = action === 'COVER_FIRE' ? 40 : action === 'CHARGE_GUARD' ? 45 : action === 'COMBO_JOIN' ? s.def.jutsu.totalFrames + 12 : 50;""")
    s = rep(s, """    } else if (action === 'COMBO_JOIN' && enemy) {
      s.position.copy(enemy.position).addScaledVector(this.tmp, -1.8);
      s.position.y = 0;
    }""", """    } else if (action === 'COMBO_JOIN' && enemy) {
      // Jutsu range decides the spawn distance so the palm hitbox lands on the enemy.
      const reach = Math.max(2.2, Math.min(6, s.def.jutsu.forwardStep * 0.55));
      s.position.copy(enemy.position).addScaledVector(this.tmp, -reach);
      s.position.y = 0;
    }""")
    return s
rw('src/combat/SupportSystem.ts', sup)
print('ok')
