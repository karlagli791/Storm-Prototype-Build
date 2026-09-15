/**
 * AudioManager.ts — Web Audio playback for the Storm 2 sound effects (public/assets/sfx, decoded
 * from the game's nus3bank sound banks with vgmstream). Cues are looked up by short name, e.g.
 * `punch_hit1`; the context is unlocked on the first key / pad / pointer gesture (browser policy).
 */
export type SfxOptions = { volume?: number; rate?: number; pitchVar?: number };

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private lastPlay = new Map<string, number>();
  muted = false;
  volume = 0.8;

  constructor(private base = 'assets/sfx/') {
    const unlock = () => {
      this.ensure();
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('gamepadconnected', unlock);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  /** Warm the cache for a list of cues. */
  preload(names: string[]): void {
    for (const n of names) void this.load(n);
  }

  private load(name: string): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(name);
    if (hit) return Promise.resolve(hit);
    let p = this.loading.get(name);
    if (p) return p;
    p = (async () => {
      const ctx = this.ensure();
      if (!ctx) return null;
      try {
        const res = await fetch(`${this.base}${name}.wav`);
        if (!res.ok) return null;
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(name, buf);
        return buf;
      } catch {
        return null;
      }
    })();
    this.loading.set(name, p);
    return p;
  }

  /** Fire-and-forget cue. Same cue within 40 ms is dropped (multi-hit frames). */
  play(name: string, opts: SfxOptions = {}): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const now = performance.now();
    if (now - (this.lastPlay.get(name) ?? -1e9) < 40) return;
    this.lastPlay.set(name, now);
    void this.load(name).then((buf) => {
      if (!buf || !this.ctx || !this.master) return;
      if (this.ctx.state === 'suspended') return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const rate = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * (opts.pitchVar ?? 0));
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = opts.volume ?? 1;
      src.connect(g).connect(this.master);
      src.start();
    });
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }
}
