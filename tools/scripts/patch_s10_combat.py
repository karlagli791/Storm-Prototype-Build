"""Session 10 combat: opening strikes home in (hits register in and out of combos), body-column hit
fallback, ranged lunge string (forward tilt / running ○), cancels (jump, jutsu, ultimate, shuriken)
out of strings, release of fighters held by an interrupted cinematic, element impacts."""
import os, re
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rw(rel, fn, marker=None):
    p = os.path.join(root, rel); s = open(p, encoding='utf-8').read()
    if marker and marker in s: print('already', rel); return
    s2 = fn(s); assert s2 != s, rel
    open(p, 'w', encoding='utf-8').write(s2); print('patched', rel)
def rep(s, old, new, count=1):
    assert old in s, old[:120]; return s.replace(old, new, count)

def fsm(s):
    n = s.count("this.startCombo(f, this.branchFromHeld(f))")
    s = s.replace("this.startCombo(f, this.branchFromHeld(f))", "this.startCombo(f, this.pickGroundBranch(f))")
    print('  ground starts routed:', n)
    s = rep(s, "  private stringFor(f: Fighter, branch: ComboBranch): MoveDef[] {", """  /**
   * Which string an attack press starts: in the air → AIR; a fresh forward tilt (≤ 6 frames) or ○
   * while running in from range → FAR (the character's ranged lunge, ATK_FAR); up / down held →
   * launcher / tilt strings; otherwise the neutral string.
   */
  private pickGroundBranch(f: Fighter): ComboBranch {
    const buf = f.input.buffer;
    if (!f.grounded && f.position.y - f.groundY > 0.8) return 'AIR';
    const dist = f.distanceToTarget();
    if (f.def.farString && dist > 2.6 && dist < 11) {
      if (buf.isHeld(InputFlag.UP) && buf.heldFrames(InputFlag.UP) <= 6) return 'FAR';
      if (f.state === CombatState.RUNNING && dist > 4.5) return 'FAR';
    }
    return this.branchFromHeld(f);
  }

  private stringFor(f: Fighter, branch: ComboBranch): MoveDef[] {""")
    s = rep(s, "branch === 'AIR' ? (d.airString?.moves ?? d.neutralString.moves) : d.neutralString.moves;",
               "branch === 'AIR' ? (d.airString?.moves ?? d.neutralString.moves) : branch === 'FAR' ? (d.farString?.moves ?? d.neutralString.moves) : d.neutralString.moves;")
    s = rep(s, "    f.enterState(CombatState.COMBO_STRING);\n    f.beginMove(moves[0], branch, 0);\n    this.faceTarget(f);",
               "    f.enterState(CombatState.COMBO_STRING);\n    f.beginMove(moves[0], branch, 0);\n    f.approachFrames = 0;\n    this.faceTarget(f);")
    s = rep(s, """    // Forward step during the strike, halted when already in contact range
    const dist = f.distanceToTarget();
    if (f.moveFrame >= activeStart - 3 && f.moveFrame <= activeEnd && dist > 1.1) {""", """    // Homing: the opening strike (and a follow-up whose target drifted away) closes the gap before
    // its active frames, like Storm's lock-on melee — so hits register in and out of a combo.
    const dist = f.distanceToTarget();
    const tgt = f.target;
    const far = f.comboBranch === 'FAR';
    const homeRange = far ? 11 : f.comboIndex === 0 ? 7 : 3.8;
    const reach = 1.05;
    if (tgt && tgt.state !== CombatState.DEAD && f.moveFrame < activeStart && dist > reach + 0.1 && dist < homeRange) {
      this.faceTarget(f, 1);
      const maxSp = far ? 28 : 22;
      // Hold the wind-up while still out of reach (up to 16 frames of dash-in), then strike.
      if (f.moveFrame >= activeStart - 4 && dist - reach > (maxSp * Math.max(1, activeStart - f.moveFrame)) / 60 && f.approachFrames < 16) {
        f.moveFrame--;
        f.approachFrames++;
      }
      const framesLeft = Math.max(1, activeStart - f.moveFrame);
      const sp = Math.min(maxSp, ((dist - reach) / framesLeft) * 60);
      f.forward(this.tmpA);
      f.velocity.x = this.tmpA.x * sp;
      f.velocity.z = this.tmpA.z * sp;
      if (f.comboBranch === 'AIR') f.velocity.y = Math.max(-10, Math.min(10, ((tgt.position.y + 0.1 - f.position.y) / framesLeft) * 60));
    } else if (f.moveFrame >= activeStart - 3 && f.moveFrame <= activeEnd && dist > 1.1) {""")
    s = rep(s, """    // Hollow step: directional jump-cancel out of recovery
    if (mag > 0.15 && f.moveFrame > activeEnd && buf.consume(InputFlag.JUMP)) {
      this.startHollowStep(f);
      return;
    }""", """    // Cancels once the strike is out: ultimate, jutsu, jump (ground or air), shuriken.
    if (f.moveFrame >= activeStart) {
      if (buf.consume(InputFlag.ULTIMATE) && f.stats.chakra >= ULTIMATE_MIN_CHAKRA && f.target) {
        this.startUltimate(f);
        return;
      }
      if (buf.consume(InputFlag.JUTSU)) {
        if (f.stats.chakra >= ULTIMATE_MIN_CHAKRA && f.target && f.distanceToTarget() < 14) { this.startUltimate(f); return; }
        if (f.stats.spendChakra(JUTSU_COST)) { this.startJutsu(f); return; }
      }
      if (buf.consume(InputFlag.JUMP)) {
        if (f.grounded) { this.beginJump(f, mag, false); return; }
        if (!f.doubleJumped) { this.beginJump(f, mag, true); return; }
      }
      if (buf.consume(InputFlag.THROW)) {
        f.enterState(CombatState.THROW);
        f.throwDir = null;
        this.faceTarget(f);
        return;
      }
    }""")
    # cinematic holds: mark and release
    s = rep(s, "        t.stunFrames = frames + 10;\n        t.hitstopFrames = 0;\n        this.victimDemoClip(t, `${f.def.code}skl1_dmg1`, frames);",
               "        t.stunFrames = frames + 10;\n        t.hitstopFrames = 0;\n        t.heldBy = f.id;\n        this.victimDemoClip(t, `${f.def.code}skl1_dmg1`, frames);")
    s = rep(s, "        t.stunFrames = frames + 10;\n        this.victimDemoClip(t, `${f.def.code}spl1_dmg`, frames);",
               "        t.stunFrames = frames + 10;\n        t.heldBy = f.id;\n        this.victimDemoClip(t, `${f.def.code}spl1_dmg`, frames);")
    s = re.sub(r"(\n\s+)t\.enterState\(CombatState\.TUMBLE\);", r"\1t.heldBy = 0;\1t.enterState(CombatState.TUMBLE);", s)
    s = rep(s, "  private updateHitstun(f: Fighter, dt: number): void {\n", """  private updateHitstun(f: Fighter, dt: number): void {
    if (f.heldBy) {
      const h = f.target && f.target.id === f.heldBy ? f.target : null;
      if (h && h.cinematic && (h.state === CombatState.ULTIMATE || h.state === CombatState.JUTSU)) return;
      // The cinematic holding this fighter ended early (interrupted, switched out): let go.
      f.heldBy = 0;
      f.hitstopFrames = 0;
      f.stunFrames = Math.min(f.stunFrames, 18);
      f.currentMove = null;
    }
""")
    # element-flavoured impacts for jutsu / ultimate / projectile hits, a light touch on heavy melee
    s = rep(s, "    const dmg = defender.stats.applyDamage(hb.damage * (attacker.awakened ? AWAKEN_DAMAGE_MULT : 1));\n",
               """    const dmg = defender.stats.applyDamage(hb.damage * (attacker.awakened ? AWAKEN_DAMAGE_MULT : 1));
    {
      const el = /_ult/.test(hb.id) ? attacker.def.ultElement ?? attacker.def.element : attacker.def.element;
      const cc = attacker.def.chakraColor ?? (attacker.def.color as number);
      if (el && /_skl|_ult|proj|jutsu/i.test(hb.id)) this.effects.el.impact(el, point.clone(), cc, /_ult/.test(hb.id) ? 2 : 1.3, defender.groundY);
      else if (el && hb.damage >= 80) this.effects.el.impact(el, point.clone(), cc, 0.55, defender.groundY);
    }
""")
    return s
rw('src/combat/CombatStateMachine.ts', fsm, 'pickGroundBranch')

def hitbox(s):
    s = rep(s, """        this.closest.lerp(this.c, 0.5);
        return true;
      }
    }
    return false;
  }""", """        this.closest.lerp(this.c, 0.5);
        return true;
      }
    }
    // Body-column fallback: during the active frames a strike connects when the attacker faces the
    // defender at striking distance, even if the swinging socket misses the hurt spheres (retargeted
    // clips, awakened bodies, short characters).
    const dx = defender.position.x - attacker.position.x, dz = defender.position.z - attacker.position.z;
    const hd = Math.hypot(dx, dz);
    const dy = defender.position.y - attacker.position.y;
    if (hd <= 1.3 + Math.min(1.0, hb.radius * 0.6) && Math.abs(dy) < 1.7) {
      const fx = Math.sin(attacker.yaw), fz = Math.cos(attacker.yaw);
      if (hd < 0.6 || (dx * fx + dz * fz) / hd > 0.3) {
        const k = 0.25 / Math.max(hd, 1e-3);
        this.closest.set(defender.position.x - dx * k, defender.position.y + 1.0, defender.position.z - dz * k);
        return true;
      }
    }
    return false;
  }""")
    return s
rw('src/combat/HitboxManager.ts', hitbox, 'Body-column fallback')

def roster(s):
    s = s.replace("{ neutral: ComboStringDef; up: ComboStringDef; down: ComboStringDef; air: ComboStringDef | null } | null {",
                  "{ neutral: ComboStringDef; up: ComboStringDef; down: ComboStringDef; air: ComboStringDef | null; far: ComboStringDef | null } | null {", 1)
    s = rep(s, "  return { neutral, up, down, air };", """  // Ranged lunge string (ATK_FAR00.. → cmr clips) with a long homing step.
  const farEntries = ['ATK_FAR00', 'ATK_FAR01', 'ATK_FAR02'].map(get).filter((e): e is PrmEntry => !!e && e.hits.length > 0);
  const farMoves = farEntries.map((e, i) => mk(`f${i}`, e)!).map((m) => ({ ...m, forwardStep: Math.max(m.forwardStep, 5) }));
  const far: ComboStringDef | null = farMoves.length ? { branch: 'FAR', moves: farMoves } : null;
  return { neutral, up, down, air, far };""")
    s = rep(s, "for (const st of [fromPrm.neutral, fromPrm.up, fromPrm.down, fromPrm.air])", "for (const st of [fromPrm.neutral, fromPrm.up, fromPrm.down, fromPrm.air, fromPrm.far])")
    s = rep(s, "    airString: fromPrm?.air ?? air,", "    airString: fromPrm?.air ?? air,\n    farString: fromPrm?.far ?? undefined,")
    s = rep(s, "...(nrtPrm ? { neutralString: nrtPrm.neutral, upString: nrtPrm.up, downString: nrtPrm.down } : {})", "...(nrtPrm ? { neutralString: nrtPrm.neutral, upString: nrtPrm.up, downString: nrtPrm.down, farString: nrtPrm.far ?? undefined } : {})")
    s = rep(s, "...(sskPrm ? { neutralString: sskPrm.neutral, upString: sskPrm.up, downString: sskPrm.down } : {})", "...(sskPrm ? { neutralString: sskPrm.neutral, upString: sskPrm.up, downString: sskPrm.down, farString: sskPrm.far ?? undefined } : {})")
    s = rep(s, "    neutralString: st?.neutral ?? def.neutralString,", "    neutralString: st?.neutral ?? def.neutralString, farString: st?.far ?? def.farString,")
    return s
rw('src/combat/Roster.ts', roster, "branch: 'FAR'")
print('combat ok')
