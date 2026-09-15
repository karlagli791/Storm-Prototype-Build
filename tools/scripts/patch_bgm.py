"""Session 8: title BGM loop (Storm 2 BGM_TITLE, HCA → ogg) on the select screen and in battle."""
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rw(rel, fn, marker=None):
    p = os.path.join(root, rel); s = open(p, encoding='utf-8').read()
    if marker and marker in s: print('already', rel); return
    s2 = fn(s); assert s2 != s, rel
    open(p, 'w', encoding='utf-8').write(s2); print('patched', rel)
def rep(s, old, new, count=1):
    assert old in s, old[:100]; return s.replace(old, new, count)

def audio(s):
    s = rep(s, """    const unlock = () => {
      this.ensure();
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    };""", """    const unlock = () => {
      this.ensure();
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().then(() => this.tryStartLoop());
      else this.tryStartLoop();
    };""")
    s = rep(s, """  private load(name: string): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(name);""", """  private load(name: string, ext = 'wav'): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(name);""")
    s = rep(s, "const res = await fetch(`${this.base}${name}.wav`);", "const res = await fetch(`${this.base}${name}.${ext}`);")
    s = rep(s, """  setVolume(v: number): void {""", """  // --- music -------------------------------------------------------------------------------
  private loopSrc: AudioBufferSourceNode | null = null;
  private loopGain: GainNode | null = null;
  private pendingLoop: { name: string; volume: number; loopStart: number } | null = null;

  /** Looping music track (assets/bgm/<name>.ogg). Starts as soon as the context is unlocked. */
  playLoop(name: string, volume = 0.35, loopStart = 0): void {
    if (this.pendingLoop?.name === name && this.loopSrc) { if (this.loopGain) this.loopGain.gain.value = volume; return; }
    this.stopLoop(0.4);
    this.pendingLoop = { name, volume, loopStart };
    this.tryStartLoop();
  }

  private tryStartLoop(): void {
    const ctx = this.ensure();
    const p = this.pendingLoop;
    if (!ctx || !p || this.loopSrc || ctx.state !== 'running') return;
    void this.load(`../bgm/${p.name}`, 'ogg').then((buf) => {
      if (!buf || this.loopSrc || !this.ctx || !this.master || this.pendingLoop !== p) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = Math.min(p.loopStart, buf.duration - 1);
      src.loopEnd = buf.duration;
      const g = this.ctx.createGain();
      g.gain.value = this.muted ? 0 : p.volume;
      src.connect(g).connect(this.master);
      src.start();
      this.loopSrc = src;
      this.loopGain = g;
    });
  }

  /** Fade the music out over `fade` seconds. */
  stopLoop(fade = 0.6): void {
    this.pendingLoop = null;
    const src = this.loopSrc, g = this.loopGain, ctx = this.ctx;
    this.loopSrc = null; this.loopGain = null;
    if (!src || !g || !ctx) return;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + fade);
    src.stop(t + fade + 0.05);
  }

  /** Music level (0–1) without restarting the track. */
  setMusicVolume(v: number): void {
    if (this.pendingLoop) this.pendingLoop.volume = v;
    if (this.loopGain && this.ctx) this.loopGain.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.3);
  }

  setVolume(v: number): void {""")
    return s
rw('src/audio/AudioManager.ts', audio, 'playLoop')

def main(s):
    s = rep(s, """async function boot(): Promise<void> {
  let sel = selectionFromUrl();""", """/** Storm 2 title theme (decoded from adx2/PC/BGM_TITLE.awb): select screen loud, battle quieter. */
const bgm = new AudioManager();
async function boot(): Promise<void> {
  let sel = selectionFromUrl();
  bgm.playLoop('title', sel ? 0.22 : 0.4, 2.7);""")
    # KO / results: duck the music
    s = rep(s, "        case CombatState.DEAD: this.audio.play('ko'); v('dmgLose'); break;",
               "        case CombatState.DEAD: this.audio.play('ko'); v('dmgLose'); bgm.setMusicVolume(0.1); break;")
    # ultimates: duck during the cinematic, restore after
    s = rep(s, "          this.audio.play('exp2');", "          bgm.setMusicVolume(0.08); setTimeout(() => bgm.setMusicVolume(0.22), 6500);\n          this.audio.play('exp2');")
    return s
rw('src/main.ts', main, 'bgm.playLoop')
print('ok')
