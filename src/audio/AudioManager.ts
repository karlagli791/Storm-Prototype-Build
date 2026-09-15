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
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().then(() => this.tryStartLoop());
      else this.tryStartLoop();
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

  private load(name: string, ext = 'wav'): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(name);
    if (hit) return Promise.resolve(hit);
    let p = this.loading.get(name);
    if (p) return p;
    p = (async () => {
      const ctx = this.ensure();
      if (!ctx) return null;
      try {
        const res = await fetch(`${this.base}${name}.${ext}`);
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

  private lastVoice = new Map<string, number>();
  /** Character voice line: assets/voice/<code>/<cue>.wav, one per character every 250 ms. */
  voice(code: string, cue: string, opts: SfxOptions = {}): void {
    const now = performance.now();
    if (now - (this.lastVoice.get(code) ?? -1e9) < 250) return;
    this.lastVoice.set(code, now);
    this.play(`../voice/${code}/${cue}`, { volume: 0.9, ...opts });
  }

  // --- music -------------------------------------------------------------------------------
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

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }
}
