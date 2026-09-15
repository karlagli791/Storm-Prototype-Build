/**
 * Selection.ts — what the menus hand to the battle: mode, two teams of three (leader + two
 * supports with their chosen assist types) and a stage. Encoded into the URL so a reload, the
 * rematch button and the desktop shell all rebuild the same match.
 */
import { CharacterDef, SupportType } from './Types';

export type GameMode = 'cpu' | '2p' | 'training' | 'demo';
export interface StageOption { id: string; name: string; bgm?: number; light?: string; }
export interface TeamPick { leader: CharacterDef; supports: CharacterDef[]; types: SupportType[]; }
export interface Selection { mode: GameMode; p1: TeamPick; p2: TeamPick; stage: StageOption; }

const TYPE_CODE: Record<SupportType, string> = { ATTACK: 'A', GUARD: 'G', BALANCE: 'B' };
const CODE_TYPE: Record<string, SupportType> = { A: 'ATTACK', G: 'GUARD', B: 'BALANCE' };

export function encodeTeam(t: TeamPick): string {
  return [t.leader.code, ...t.supports.map((s, i) => `${s.code}:${TYPE_CODE[t.types[i] ?? s.supportType]}`)].join(',');
}

export function decodeTeam(s: string | null, find: (code: string) => CharacterDef | undefined): TeamPick | null {
  if (!s) return null;
  const parts = s.split(',').filter(Boolean);
  const leader = find(parts[0]);
  if (!leader) return null;
  const supports: CharacterDef[] = [];
  const types: SupportType[] = [];
  for (const p of parts.slice(1)) {
    const [code, t] = p.split(':');
    const d = find(code);
    if (!d) continue;
    supports.push(d);
    types.push(CODE_TYPE[t ?? ''] ?? d.supportType);
  }
  if (!supports.length) return null;
  return { leader, supports, types };
}

export function selectionToParams(sel: Selection): URLSearchParams {
  const q = new URLSearchParams();
  q.set('mode', sel.mode);
  q.set('p1', encodeTeam(sel.p1));
  q.set('p2', encodeTeam(sel.p2));
  q.set('stage', sel.stage.id);
  return q;
}

export function selectionFromParams(q: URLSearchParams, find: (code: string) => CharacterDef | undefined, stages: StageOption[]): Selection | null {
  const p1 = decodeTeam(q.get('p1'), find), p2 = decodeTeam(q.get('p2'), find);
  if (!p1 || !p2) return null;
  const stage = stages.find((s) => s.id === q.get('stage')) ?? stages[0];
  const m = q.get('mode');
  const mode: GameMode = m === '2p' || m === 'training' || m === 'demo' ? m : 'cpu';
  return { mode, p1, p2, stage };
}
