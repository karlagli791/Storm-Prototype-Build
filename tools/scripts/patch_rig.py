"""Refactor FighterRig.ts: shared CC2 animation bank (cmn_anims.glb) with bone-prefix retargeting,
StormStates-driven clip selection with one-shot→loop chains, directional dash-step / damage clips,
and celshade ramp binding."""
p = r'C:\Users\ysoyo\OneDrive\Desktop\wan\storm4-proto\src\render\FighterRig.ts'
s = open(p, encoding='utf-8').read()

def rep(old, new):
    global s
    assert old in s, old[:90]
    s = s.replace(old, new, 1)

rep("import { CharacterDef, CombatState } from '../core/Types';",
    "import { CharacterDef, CombatState, HitDir } from '../core/Types';\nimport { bindingFor, ClipSpec } from '../combat/StormStates';")
rep("import { addInvertedHull, createCelMaterial } from './Shaders';",
    "import { addInvertedHull, createCelMaterial, setRamp } from './Shaders';")

# PoseContext additions
rep("""  guardActive: boolean;
  charging: boolean;
}""", """  guardActive: boolean;
  charging: boolean;
  moveDir: HitDir;
  hitDir: HitDir;
  falling: boolean;
  framesLeft: number;
}

/** Shared CC2 common-animation bank (1cmnbod1): loaded once, retargeted per character. */
let cmnBankPromise: Promise<THREE.AnimationClip[]> | null = null;
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
export const RIG_RAMP: { texture: THREE.Texture | null; row: number } = { texture: null, row: 8 };""")

# fields
rep("""  private activeAction: THREE.AnimationAction | null = null;
  private time = 0;""", """  private activeAction: THREE.AnimationAction | null = null;
  private activeSpec: ClipSpec | null = null;
  private activeState: CombatState | null = null;
  private boneNames = new Set<string>();
  private time = 0;""")

# after clips registration: collect bone names, load cmn bank, bind ramp
rep("""      this.root.remove(this.mannequin);
      this.root.add(scene);
      this.glbRoot = scene;
      this.usingGlb = true;
      return true;""", """      scene.traverse((o) => {
        if ((o as THREE.Bone).isBone) this.boneNames.add(o.name);
      });
      // Retarget the shared bank: 1cmn00t0_* → <code>00t0_*, dropping tracks for bones this rig lacks.
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
      });
      if (RIG_RAMP.texture) setRamp(scene, RIG_RAMP.texture, RIG_RAMP.row);

      this.root.remove(this.mannequin);
      this.root.add(scene);
      this.glbRoot = scene;
      this.usingGlb = true;
      return true;""")

# replace pickClip + updateGlbAnimation with StormStates-driven versions
start = s.index("  private pickClip(ctx: PoseContext): string | null {")
end = s.index("  private poseMannequin(ctx: PoseContext): void {")
new_block = '''  /** Resolve a clip spec against the clips actually present ({c} → character code). */
  private resolve(spec: ClipSpec): ClipSpec | null {
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
    const stateKey = ctx.state;
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
    this.mixer?.update(dt);
  }

'''
s = s[:start] + new_block + s[end:]

# poseMannequin needs the new states in its switch (fallthrough to idle) — nothing required (default branch).
open(p, 'w', encoding='utf-8').write(s)
print('rig patched')
