/**
 * Settings.ts — player options (persisted in localStorage): audio levels, CPU difficulty, round
 * time, camera distance, post-processing, outlines, music track, second-player device.
 */
export type Difficulty = 'EASY' | 'NORMAL' | 'HARD' | 'ULTIMATE';
export interface Settings {
  master: number;      // 0..1
  music: number;       // 0..1
  sfx: number;         // 0..1
  voice: number;       // 0..1
  difficulty: Difficulty;
  roundTime: 60 | 99 | 120 | 0; // 0 = infinite
  cameraScale: number; // 0.8 (closer) .. 1.3 (further)
  postFx: boolean;     // motion blur, shockwaves, impact frames
  outlines: boolean;
  shadows: boolean;
  bgmTrack: number;    // 0 = per stage, 1..N = fixed Storm 4 battle track
  p2Device: 'PAD2' | 'KEYBOARD';
  hudScale: number;
}

const KEY = 'storm.settings.v1';
const DEFAULTS: Settings = {
  master: 0.85, music: 0.5, sfx: 1.0, voice: 0.9,
  difficulty: 'NORMAL', roundTime: 99, cameraScale: 1.0,
  postFx: true, outlines: true, shadows: true, bgmTrack: 0, p2Device: 'PAD2', hudScale: 1.0,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch { /* private mode etc. */ }
  return { ...DEFAULTS };
}

export const SETTINGS: Settings = load();

export function saveSettings(): void {
  try { localStorage.setItem(KEY, JSON.stringify(SETTINGS)); } catch { /* ignore */ }
  for (const fn of listeners) fn(SETTINGS);
}

const listeners: Array<(s: Settings) => void> = [];
/** Subscribe to live changes (volume sliders apply immediately). */
export function onSettings(fn: (s: Settings) => void): void { listeners.push(fn); }

export function resetSettings(): void {
  Object.assign(SETTINGS, DEFAULTS);
  saveSettings();
}
