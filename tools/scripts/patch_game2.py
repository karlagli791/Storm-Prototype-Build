"""Session 6 game wiring: intro, stages, ultimate/awakening overlays, audio, HUD flags, roster extras."""
import os, re
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rw(rel, fn, marker=None):
    p = os.path.join(root, rel); s = open(p, encoding='utf-8').read()
    if marker and marker in s:
        print('already', rel); return
    s2 = fn(s); assert s2 != s, rel
    open(p, 'w', encoding='utf-8').write(s2); print('patched', rel)
def rep(s, old, new, count=1):
    assert old in s, old[:100]; return s.replace(old, new, count)

# ------------------------------------------------------------------ main.ts
def main(s):
    s = rep(s, "import { CharacterSelect, Selection, showVsSplash } from './ui/CharacterSelect';",
               "import { CharacterSelect, Selection, showVsSplash } from './ui/CharacterSelect';\nimport { showUltimateCutIn, screenFlash, showAwakenBanner } from './ui/CutIn';\nimport { AudioManager } from './audio/AudioManager';")
    s = rep(s, """export const STAGES = [
  { id: 'sd03a', name: 'HIDDEN LEAF FOREST' },
  { id: 'sd05a', name: 'FOREST OF QUIET MOVEMENT' },
  { id: 'sd01d', name: 'FOREST OF DEATH' },
];""", """export const STAGES = [
  { id: 'sd03a', name: 'HIDDEN LEAF FOREST' },
  { id: 'sd05a', name: 'FOREST OF QUIET MOVEMENT' },
  { id: 'sd01d', name: 'FOREST OF DEATH' },
  { id: 'sd07a', name: "OROCHIMARU'S HIDEOUT" },
  { id: 'sd08a', name: 'DESERT OF THE WIND' },
  { id: 'sd06a', name: 'HIDDEN LEAF VILLAGE' },
  { id: 'sd11a', name: 'UNRAIKYO' },
];""")
    # audio field + construction
    s = rep(s, "  support: SupportSystem;\n", "  support: SupportSystem;\n  audio = new AudioManager();\n  private prevStates = new Map<number, CombatState>();\n")
    # events → overlays + sfx
    s = rep(s, """    if (kind === 'CLASH' && data.text === 'DASH CLASH!') this.hud.showToast('CLASH', '#cfe9ff', 0.5);
  }""", """    if (kind === 'CLASH' && data.text === 'DASH CLASH!') this.hud.showToast('CLASH', '#cfe9ff', 0.5);
    const who = this.allFighters.find((f) => f.id === data.attackerId);
    switch (kind) {
      case 'HIT': {
        if ((data.damage ?? 0) <= 0) break;
        const heavy = (data.damage ?? 0) >= 80;
        const blade = who?.def.hasBlade;
        this.audio.play(blade ? 'sword_hit' : heavy ? (Math.random() < 0.5 ? 'kick_hit2' : 'punch_hit2') : Math.random() < 0.5 ? 'punch_hit1' : 'kick_hit1', { pitchVar: 0.06 });
        if (heavy) this.audio.play('hit_S', { volume: 0.6 });
        break;
      }
      case 'GUARD_HIT': this.audio.play('guard', { pitchVar: 0.05 }); break;
      case 'GUARD_BREAK': this.audio.play('exp1', { volume: 0.9 }); break;
      case 'PARRY': this.audio.play('flash2'); break;
      case 'CLASH': this.audio.play('chakHit'); break;
      case 'SUB': this.audio.play('change'); break;
      case 'SPARK': this.audio.play('dash2', { volume: 0.8 }); break;
      case 'WALL_SPLAT': this.audio.play('groundHit2'); break;
      case 'SWITCH': this.audio.play(data.text?.includes('SUPPORT') ? 'cutin_support' : 'change'); break;
      case 'SFX': if (data.text) this.audio.play(data.text, { volume: 0.7, pitchVar: 0.05 }); break;
      case 'ULTIMATE': {
        if ((data.damage ?? 0) > 0) {
          screenFlash();
          this.audio.play('exp2');
          this.audio.play(who?.def.ultimateSfx ?? 'raikiriHit', { volume: 0.9 });
          this.hud.showToast(who?.def.ultimateName ?? 'ULTIMATE', '#ffd166', 1.2);
        } else if (who) {
          showUltimateCutIn(who.def, who.team === 1 ? 1 : 2);
          this.audio.play('flash');
          this.audio.play('cutin_support', { volume: 0.5 });
        }
        break;
      }
      case 'AWAKEN': {
        if (who && data.text?.includes('AWAKENING') && !data.text.includes('ended')) {
          showAwakenBanner(who.def);
          this.audio.play('awake_open');
          this.audio.play('awakeFlash', { volume: 0.8 });
        } else this.audio.play('awake_off', { volume: 0.6 });
        break;
      }
    }
  }

  /** State-transition sounds (dash, jump, landing, jutsu, throw, charge, KO). */
  private stateSounds(present: Fighter[]): void {
    for (const f of present) {
      const prev = this.prevStates.get(f.id);
      if (prev === f.state) continue;
      this.prevStates.set(f.id, f.state);
      switch (f.state) {
        case CombatState.DASH_STARTUP: this.audio.play('dash', { volume: 0.7 }); break;
        case CombatState.JUMPING: if (prev !== CombatState.COMBO_STRING && prev !== CombatState.JUTSU) this.audio.play('jump1', { volume: 0.6 }); break;
        case CombatState.NINJA_MOVE:
        case CombatState.HOLLOW_STEP: this.audio.play('jump2', { volume: 0.5 }); break;
        case CombatState.IDLE_NEUTRAL:
        case CombatState.RUNNING: if (prev === CombatState.JUMPING || prev === CombatState.NINJA_MOVE) this.audio.play('landing', { volume: 0.5 }); break;
        case CombatState.JUTSU: this.audio.play(f.def.jutsuSfx ?? 'rasen', { volume: 0.9 }); break;
        case CombatState.THROW: this.audio.play('shuriken', { volume: 0.7 }); break;
        case CombatState.CHAKRA_CHARGE: this.audio.play('charge', { volume: 0.6 }); break;
        case CombatState.COMBO_STRING: this.audio.play(f.def.hasBlade ? 'sword_swing' : 'punch_swing', { volume: 0.45, pitchVar: 0.08 }); break;
        case CombatState.KNOCKDOWN: this.audio.play('down', { volume: 0.6 }); break;
        case CombatState.DEAD: this.audio.play('ko'); break;
        case CombatState.INTRO: if (f.team === 1) this.audio.play('battleStart'); break;
      }
    }
  }""")
    # call stateSounds each step after hitboxes
    s = rep(s, "    this.hitboxes.update([...this.team1.present, ...this.team2.present]);",
               "    this.hitboxes.update([...this.team1.present, ...this.team2.present]);\n    this.stateSounds(present);")
    # intro at round start
    s = rep(s, """    this.team1.active.yaw = this.team1.active.yawToTarget();
    this.team2.active.yaw = this.team2.active.yawToTarget();
    this.projectiles.clear();""", """    this.team1.active.yaw = this.team1.active.yawToTarget();
    this.team2.active.yaw = this.team2.active.yawToTarget();
    // Round intro: both leaders play their entry clip (PL_ACT_BTL_BEFORE_LEADER) before "Go!".
    this.team1.active.enterState(CombatState.INTRO);
    this.team2.active.enterState(CombatState.INTRO);
    for (const f of this.allFighters) { f.awakened = false; f.awakenTimer = 0; f.rig.setAwakened(false); }
    this.prevStates.clear();
    this.projectiles.clear();""")
    # HUD flags
    s = rep(s, "      act: bindingFor(f.state,", "      awakened: f.awakened,\n      ultimateReady: s.chakra >= 90,\n      act: bindingFor(f.state,")
    # shorter splash now that the intro clip plays
    s = rep(s, "  setTimeout(() => { hideSplash(); window.storm.paused = false; }, 2800);", "  setTimeout(() => { hideSplash(); window.storm.paused = false; }, 1900);")
    # select-screen sounds: preload common cues
    s = rep(s, "  window.storm = new Game(sel);\n  window.storm.paused = true;", "  window.storm = new Game(sel);\n  window.storm.audio.preload(['punch_hit1', 'punch_hit2', 'kick_hit1', 'kick_hit2', 'guard', 'dash', 'jump1', 'landing', 'punch_swing', 'battleStart', 'change', 'flash']);\n  window.storm.paused = true;")
    return s
rw('src/main.ts', main, 'showUltimateCutIn')

# ------------------------------------------------------------------ UIOverlay: flags + drawing
def hud(s):
    s = rep(s, "  supportReady: boolean;\n", "  supportReady: boolean;\n  awakened: boolean;\n  ultimateReady: boolean;\n")
    s = rep(s, """    ctx.fillText(f.code.toUpperCase() + '  ' + f.act.replace('PL_ACT_', ''), mirror ? barX + bw : barX, y + 32);
    ctx.restore();""", """    ctx.fillText(f.code.toUpperCase() + '  ' + f.act.replace('PL_ACT_', ''), mirror ? barX + bw : barX, y + 32);
    if (f.awakened || f.ultimateReady) {
      // Storm-style status tags under the name: awakening pulse / ultimate ready
      const t = performance.now() / 1000;
      ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
      const tag = f.awakened ? 'AWAKENED' : 'ULTIMATE READY';
      ctx.fillStyle = f.awakened ? `rgba(255,${140 + Math.round(60 * Math.sin(t * 8))},60,0.95)` : `rgba(255,${210 + Math.round(40 * Math.sin(t * 6))},120,0.95)`;
      ctx.fillText(tag, mirror ? barX + bw - 150 : barX + 150, y + 32);
    }
    ctx.restore();""")
    return s
rw('src/ui/UIOverlay.ts', hud, 'ULTIMATE READY')

# ------------------------------------------------------------------ Roster: air strings, ultimate names, sfx
def roster(s):
    s = rep(s, """  animBank?: string;
  portrait?: string;
}""", """  animBank?: string;
  portrait?: string;
  ultimateName?: string;
  jutsuSfx?: string;
  ultimateSfx?: string;
}""")
    s = rep(s, """  const jutsu: MoveDef = move({""", """  // Aerial string (○ in the air): cmr clips where the character has them, else the ground string's
  // first hits; the last hit spikes the enemy to the ground.
  const air: ComboStringDef = {
    branch: 'AIR',
    moves: [
      move({ name: `${c}_air1`, clip: clip('cmr00'), totalFrames: 20, forwardStep: 1.5, hitboxes: [hb({ id: `${c}a1`, activeStart: 5, activeEnd: 10, damage: 34, ...sock(SOCKET.R_HAND) })] }),
      move({ name: `${c}_air2`, clip: clip('cmr01'), totalFrames: 20, forwardStep: 1.5, hitboxes: [hb({ id: `${c}a2`, activeStart: 5, activeEnd: 10, damage: 34, ...sock(SOCKET.L_HAND) })] }),
      move({ name: `${c}_air3`, clip: clip('cmr02'), totalFrames: 26, forwardStep: 1.0, hitboxes: [hb({ id: `${c}a3`, activeStart: 7, activeEnd: 12, damage: 70, reaction: HitReaction.SPIKE, knockback: 3.0, launch: -16.0, hitstunFrames: 40, ...sock(SOCKET.R_FOOT) })] }),
    ],
  };
  const jutsu: MoveDef = move({""")
    s = rep(s, """    jutsu,
    hurtboxes: [""", """    jutsu,
    airString: air,
    ultimateName: o.ultimateName,
    ultimateClip: `${bank}spl1_s`,
    jutsuSfx: o.jutsuSfx,
    ultimateSfx: o.ultimateSfx,
    hurtboxes: [""")
    s = rep(s, """  supportType: 'BALANCE', color: 0xf2d24a, runSpeed: 9.0, jutsuRange: 12, jutsuArmored: false,
});""", """  supportType: 'BALANCE', color: 0xf2d24a, runSpeed: 9.0, jutsuRange: 12, jutsuArmored: false,
  ultimateName: 'C2: Dragon', jutsuSfx: 'exp1', ultimateSfx: 'exp2',
});""")
    s = rep(s, """  supportType: 'ATTACK', color: 0xd8d0c0, runSpeed: 9.4, blade: true, finisher: 'cmb03',
});""", """  supportType: 'ATTACK', color: 0xd8d0c0, runSpeed: 9.4, blade: true, finisher: 'cmb03',
  ultimateName: 'Samurai Sabre Technique', jutsuSfx: 'sword_swing', ultimateSfx: 'sword_hit',
});""")
    s = rep(s, """  supportType: 'ATTACK', color: 0x2a2a3a, runSpeed: 9.2, finisher: 'cma03', jutsuRange: 11,
});""", """  supportType: 'ATTACK', color: 0x2a2a3a, runSpeed: 9.2, finisher: 'cma03', jutsuRange: 11,
  ultimateName: 'Amaterasu', jutsuSfx: 'goukakyu', ultimateSfx: 'exp2',
});""")
    s = rep(s, """  supportType: 'GUARD', color: 0xb03a2e, runSpeed: 8.6, health: 1050, finisher: 'cma03', jutsuRange: 10,
});""", """  supportType: 'GUARD', color: 0xb03a2e, runSpeed: 8.6, health: 1050, finisher: 'cma03', jutsuRange: 10,
  ultimateName: 'Sand Tsunami', jutsuSfx: 'gar_sand2', ultimateSfx: 'gar_sandHit',
});""")
    s = rep(s, """  supportType: 'BALANCE', color: 0xc9c9c9, runSpeed: 9.6, finisher: 'cma03',
});""", """  supportType: 'BALANCE', color: 0xc9c9c9, runSpeed: 9.6, finisher: 'cma03',
  ultimateName: 'Lightning Blade: Double', jutsuSfx: 'raikiri', ultimateSfx: 'raikiriHit',
});""")
    s = rep(s, """  supportType: 'ATTACK', color: 0xf5c542, runSpeed: 10.2, health: 950,
});""", """  supportType: 'ATTACK', color: 0xf5c542, runSpeed: 10.2, health: 950,
  ultimateName: 'Flying Thunder God: Level 2', jutsuSfx: 'rasen', ultimateSfx: 'rasen2',
});""")
    s = rep(s, """  supportType: 'ATTACK', color: 0x4b2e5a, runSpeed: 9.4, health: 1050, animBank: '2ssk', blade: false,
  portrait: 'assets/ui/player_9ind.png',
});""", """  supportType: 'ATTACK', color: 0x4b2e5a, runSpeed: 9.4, health: 1050, animBank: '2ssk', blade: false,
  portrait: 'assets/ui/player_9ind.png', ultimateName: "Susano'o: Sword of Indra", jutsuSfx: 'adv_chidori', ultimateSfx: 'raikiriHit',
});""")
    s = rep(s, """export const NARUTO_SEL: CharacterDef = { ...NARUTO_DEF, title: 'Hidden Leaf · Jinchuriki of the Nine-Tails', jutsuName: 'Rasengan', ...art('2nrt') };
export const SASUKE_SEL: CharacterDef = { ...SASUKE_DEF, title: 'Taka · Sharingan', jutsuName: 'Chidori', ...art('2ssk') };""",
"""const airFor = (code: string): ComboStringDef => makeTemplateDef({ code, displayName: code, title: '', jutsuName: '', supportType: 'BALANCE', color: 0xffffff }).airString!;
export const NARUTO_SEL: CharacterDef = { ...NARUTO_DEF, title: 'Hidden Leaf · Jinchuriki of the Nine-Tails', jutsuName: 'Rasengan', ...art('2nrt'), airString: airFor('2nrt'), ultimateName: 'Giant Rasengan', ultimateClip: '2nrtspl1_s', jutsuSfx: 'rasen', ultimateSfx: 'rasen2' };
export const SASUKE_SEL: CharacterDef = { ...SASUKE_DEF, title: 'Taka · Sharingan', jutsuName: 'Chidori', ...art('2ssk'), airString: airFor('2ssk'), ultimateName: 'Kirin', ultimateClip: '2sskspl1_s', jutsuSfx: 'adv_chidori', ultimateSfx: 'raikiriHit' };""")
    return s
rw('src/combat/Roster.ts', roster, 'ultimateSfx')

# ------------------------------------------------------------------ CharacterSelect: menu sounds
def sel(s):
    s = rep(s, "import { GamepadState, PAD } from '../core/GamepadState';", "import { GamepadState, PAD } from '../core/GamepadState';\nimport { AudioManager } from '../audio/AudioManager';\nconst menuAudio = new AudioManager();")
    s = rep(s, """  private act(a: string): void {
    if (this.step === 'STAGE') {""", """  private act(a: string): void {
    if (a === 'ok') menuAudio.play('catch_ok', { volume: 0.7 });
    else if (a === 'back') menuAudio.play('menu_cancel', { volume: 0.7 });
    else menuAudio.play('menu_window', { volume: 0.5 });
    if (this.step === 'STAGE') {""")
    return s
rw('src/ui/CharacterSelect.ts', sel, 'menuAudio')
print('ok')
