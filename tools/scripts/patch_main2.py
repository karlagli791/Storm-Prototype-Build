"""Session 5: character select flow, roster, render interpolation, per-frame animation advance."""
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p = os.path.join(root, 'src/main.ts'); s = open(p, encoding='utf-8').read()
def rep(old, new):
    global s
    assert old in s, old[:90]; s = s.replace(old, new, 1)

rep("""import { NARUTO_DEF, SASUKE_DEF } from './combat/CharacterDefs';""",
    """import { NARUTO_DEF, SASUKE_DEF } from './combat/CharacterDefs';
import { ROSTER, findCharacter } from './combat/Roster';
import { CharacterSelect, Selection } from './ui/CharacterSelect';
import { CharacterDef } from './core/Types';""")

rep("""const STAGES = [
  { id: 'sd03a', name: 'HIDDEN LEAF FOREST' },
  { id: 'sd05a', name: 'FOREST OF QUIET MOVEMENT' },
  { id: 'sd01d', name: 'FOREST OF DEATH' },
];""", """export const STAGES = [
  { id: 'sd03a', name: 'HIDDEN LEAF FOREST' },
  { id: 'sd05a', name: 'FOREST OF QUIET MOVEMENT' },
  { id: 'sd01d', name: 'FOREST OF DEATH' },
];""")

rep("""  constructor() {
    const glCanvas""", """  constructor(private readonly selection: Selection) {
    const glCanvas""")

rep("""    const wanted = new URLSearchParams(location.search).get('stage');
    const idx = STAGES.findIndex((st) => st.id === wanted);""",
    """    const wanted = this.selection.stage.id;
    const idx = STAGES.findIndex((st) => st.id === wanted);""")

rep("""    const kb = new KeyboardInputSource(P1_BINDINGS);
    this.p1Source = kb;
    const p1Lead = new Fighter(NARUTO_DEF, new InputManager(kb));
    const p1Sup = new Fighter(SASUKE_DEF, new InputManager(new ScriptedInputSource()));
    this.team1 = new Team('P1', 1, p1Lead, p1Sup, kb);

    // Player 2: AI dummy. Leader Sasuke, support Naruto.
    const aiSrc = new ScriptedInputSource();
    const p2Lead = new Fighter(SASUKE_DEF, new InputManager(aiSrc));
    const p2Sup = new Fighter(NARUTO_DEF, new InputManager(new ScriptedInputSource()));""",
    """    const kb = new KeyboardInputSource(P1_BINDINGS);
    this.p1Source = kb;
    const sel = this.selection;
    const p1Lead = new Fighter(sel.p1.leader, new InputManager(kb));
    const p1Sup = new Fighter(sel.p1.support, new InputManager(new ScriptedInputSource()));
    this.team1 = new Team('P1', 1, p1Lead, p1Sup, kb);

    // Player 2: AI / training dummy with the chosen pair.
    const aiSrc = new ScriptedInputSource();
    const p2Lead = new Fighter(sel.p2.leader, new InputManager(aiSrc));
    const p2Sup = new Fighter(sel.p2.support, new InputManager(new ScriptedInputSource()));""")

# hotkeys: Escape returns to the select screen
rep("""      } else if (e.code === 'F4') {
        e.preventDefault();
        this.ai.enabled = !this.ai.enabled;
        this.log(`AI ${this.ai.enabled ? 'enabled' : 'disabled (training dummy)'}`);
      }""", """      } else if (e.code === 'F4') {
        e.preventDefault();
        this.ai.enabled = !this.ai.enabled;
        this.log(`AI ${this.ai.enabled ? 'enabled' : 'disabled (training dummy)'}`);
      } else if (e.code === 'Escape') {
        returnToSelect();
      }""")

# render interpolation + animation advance in frame()
rep("""    this.effects.update(dt);
    this.camera.update(this.team1.active.position, this.team2.active.position, dt);
    if (background) return;""",
    """    // Render interpolation: the sim runs at a fixed 60 Hz, the display may not. Place every rig
    // between its previous and current tick transform by the accumulator fraction so motion is
    // smooth at any refresh rate, and advance skeletal animation by render time (frozen in hitstop).
    const alpha = this.paused ? 1 : Math.min(1, this.accumulator / FIXED_DT);
    for (const f of [...this.team1.present, ...this.team2.present]) {
      if (f.hitstopFrames > 0 || !f.rig.root.visible) continue;
      f.rig.root.position.lerpVectors(f.prevPosition, f.position, alpha);
      let dy = f.yaw - f.prevYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      f.rig.root.rotation.y = f.prevYaw + dy * alpha;
      if (!this.paused) f.rig.advance(dt);
    }
    this.effects.update(dt);
    this.camera.update(this.team1.active.rig.root.position, this.team2.active.rig.root.position, dt);
    if (background) return;""")

# boot: URL params or select screen
rep("""declare global {
  interface Window {
    storm: Game;
  }
}

window.storm = new Game();""", """declare global {
  interface Window {
    storm: Game;
  }
}

/** Battle setup lives in the URL (?p1=2nrt,2ssk&p2=2kks,2gar&stage=sd03a) so a reload rematches. */
function selectionFromUrl(): Selection | null {
  const q = new URLSearchParams(location.search);
  const pair = (v: string | null) => {
    const [a, b] = (v ?? '').split(',');
    const lead = findCharacter(a), sup = findCharacter(b);
    return lead && sup ? { leader: lead, support: sup } : null;
  };
  const p1 = pair(q.get('p1')), p2 = pair(q.get('p2'));
  const stage = STAGES.find((st) => st.id === q.get('stage')) ?? STAGES[0];
  if (p1 && p2) return { p1, p2, stage };
  return null;
}

function returnToSelect(): void {
  const q = new URLSearchParams(location.search);
  q.delete('p1'); q.delete('p2'); q.delete('stage');
  location.href = `${location.pathname}${q.toString() ? '?' + q.toString() : ''}`;
}

async function boot(): Promise<void> {
  let sel = selectionFromUrl();
  if (!sel) {
    const boot = document.getElementById('boot');
    if (boot) boot.remove();
    sel = await new CharacterSelect(ROSTER, STAGES).run();
    const q = new URLSearchParams(location.search);
    q.set('p1', `${sel.p1.leader.code},${sel.p1.support.code}`);
    q.set('p2', `${sel.p2.leader.code},${sel.p2.support.code}`);
    q.set('stage', sel.stage.id);
    history.replaceState(null, '', `${location.pathname}?${q.toString()}`);
  }
  window.storm = new Game(sel);
}
void NARUTO_DEF; void SASUKE_DEF; void (null as unknown as CharacterDef);
boot();""")
open(p, 'w', encoding='utf-8').write(s); print('patched main.ts')
