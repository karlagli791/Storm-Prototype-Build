"""Real projected character shadows: the sun casts a shadow map, each fighter carries a transparent
shadow-catcher plane at the floor height (ShadowMaterial) so the body's silhouette lands on the
ground; the blob shadow becomes a faint contact shadow underneath."""
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rw(rel, fn, marker=None):
    p = os.path.join(root, rel); s = open(p, encoding='utf-8').read()
    if marker and marker in s: print('already', rel); return
    s2 = fn(s); assert s2 != s, rel
    open(p, 'w', encoding='utf-8').write(s2); print('patched', rel)
def rep(s, old, new, count=1):
    assert old in s, old[:100]; return s.replace(old, new, count)

def main(s):
    s = rep(s, """    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(20, 40, 15);
    this.scene.add(sun);""", """    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(20, 40, 15);
    // Projected character shadows: the sun renders a 2048 px shadow map over a 40 m window that
    // follows the fighters; only the shadow-catcher planes receive it (the cel stage keeps its look).
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;""")
    s = rep(s, "  audio = new AudioManager();", "  audio = new AudioManager();\n  private sun!: THREE.DirectionalLight;")
    # follow the fighters with the shadow window each frame
    s = rep(s, """    this.effects.update(dt);
    if (!this.applyCinematicCamera())""", """    // Shadow window follows the fighters
    const mid = this.team1.active.rig.root.position.clone().lerp(this.team2.active.rig.root.position, 0.5);
    this.sun.target.position.copy(mid);
    this.sun.position.copy(mid).add(new THREE.Vector3(20, 40, 15));
    this.effects.update(dt);
    if (!this.applyCinematicCamera())""")
    return s
rw('src/main.ts', main, 'sun.castShadow = true')

def rig(s):
    # meshes cast shadows; catcher plane receives them; blob shadow becomes a soft contact shadow
    s = rep(s, """          m.frustumCulled = false;
          m.renderOrder = 10; // after stage shadow sheets (see ArenaEnvironment)""", """          m.frustumCulled = false;
          m.renderOrder = 10; // after stage shadow sheets (see ArenaEnvironment)
          m.castShadow = true;""")
    s = rep(s, """    this.shadow.renderOrder = 3;
    this.root.add(this.shadow);""", """    this.shadow.renderOrder = 3;
    this.root.add(this.shadow);
    // Shadow catcher: invisible plane that only shows the sun's shadow map (the body silhouette).
    this.catcher = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.ShadowMaterial({ opacity: 0.42, transparent: true, depthWrite: false }));
    this.catcher.rotation.x = -Math.PI / 2;
    this.catcher.position.y = 0.03;
    this.catcher.receiveShadow = true;
    this.catcher.renderOrder = 4;
    this.root.add(this.catcher);""")
    s = rep(s, """  readonly shadow: THREE.Mesh;""", """  readonly shadow: THREE.Mesh;
  catcher!: THREE.Mesh;""")
    s = rep(s, """    const h = Math.max(0, height);
    this.shadow.position.y = -h + 0.02;
    const k = 1 - Math.min(0.55, h * 0.12);
    this.shadow.scale.setScalar(k);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.9 * k;""", """    const h = Math.max(0, height);
    this.shadow.position.y = -h + 0.02;
    this.catcher.position.y = -h + 0.03;
    const k = 1 - Math.min(0.55, h * 0.12);
    this.shadow.scale.setScalar(k * 0.8);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.35 * k;""")
    return s
rw('src/render/FighterRig.ts', rig, 'Shadow catcher')
print('ok')
