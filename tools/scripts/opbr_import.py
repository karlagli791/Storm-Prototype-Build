"""opbr_import.py — One Piece: Fighting Path model rips (DAE/FBX) -> engine GLB + manifest.

The rips are skinned models with a 3ds Max Biped skeleton and *no animation data*, so the
engine animates them procedurally (src/render/OpbrRig.ts). This script keeps every bone the
rip ships with (hair, cloak, sleeve, finger and prop chains stay intact) and only *renames*
the bones the animator needs to a canonical `OP_*` set, then writes a manifest describing:

  - the canonical bone map (after renaming),
  - the secondary-motion chains (hair / cloak / skirt / ribbon / sleeve roots) for spring bones,
  - the model height in metres, so the engine can scale each fighter relative to the others.

Usage (Blender 4.5):
  blender -b -noaudio -P opbr_import.py -- --src <file.dae|fbx> --out <out.glb> --key <key>
"""
import bpy, sys, os, json, re, math

# --------------------------------------------------------------------------- args
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default

SRC = arg('--src')
OUT = arg('--out')
KEY = arg('--key', 'opbr')

# --------------------------------------------------------------------------- helpers
def norm(n):
    """Bone name without the rip's id prefix, spaces folded to underscores."""
    n = re.sub(r'^_\d+_(?:[A-Z]_)?', '', n)
    return n.replace(' ', '_')

# Secondary-motion chains in the Fighting Path rigs (pinyin names from the original studio).
DYN = re.compile(r'toufa|pifeng|qunbai|piaodai|yixiu|bixiu|tuixiu|xiubai|yaodai|shengzi|huzi|'
                 r'hair|cloak|cloth|skirt|coat|hat|weijin|lingdai|dai\d|maozi|feng\d', re.I)
SKIP_CHAIN = re.compile(r'finger|thumb|face|eye|mouth|tongue|jaw|teeth|brow', re.I)


# Bones that actually carry vertex weights. Several rigs ship two arm chains — the Biped control
# chain and a `BN_Arm_*` deform chain — and only the weighted one moves the mesh.
WEIGHTED = set()


def pick_bone(bones, patterns):
    """First bone matching `patterns` in order, preferring bones the skin is actually weighted to."""
    for weighted_only in (True, False):
        for p in patterns:
            rx = re.compile(p, re.I)
            for b in bones:
                if rx.search(norm(b.name)) and (not weighted_only or b.name in WEIGHTED):
                    return b
        if not WEIGHTED:
            break
    return None


def descendants(bone):
    out = []
    stack = list(bone.children)
    while stack:
        b = stack.pop()
        out.append(b)
        stack.extend(b.children)
    return out


def finger_parent(bones, side):
    """Structural fallback for the hand bone: the ancestor of that side's finger bones."""
    fingers = [b for b in bones if re.search(r'finger', norm(b.name), re.I)
               and re.search(r'(^|[_])%s([_0-9]|$)' % side, norm(b.name), re.I)]
    if not fingers:
        return None
    parents = [f.parent for f in fingers if f.parent]
    if not parents:
        return None
    # The bone that is the ancestor of the most finger roots.
    best, best_n = None, 0
    for p in set(parents):
        n = sum(1 for f in fingers if f.parent == p)
        if n > best_n:
            best, best_n = p, n
    return best


def chain_at(bones, root, frac):
    """Walk the longest child chain from `root` and return the bone at `frac` of its length."""
    chain, cur = [root], root
    while cur.children:
        cur = max(cur.children, key=lambda c: sum(d.length for d in descendants(c)) + c.length)
        if SKIP_CHAIN.search(norm(cur.name)):
            break
        chain.append(cur)
    total = sum(b.length for b in chain) or 1.0
    acc = 0.0
    for b in chain:
        acc += b.length
        if acc / total >= frac:
            return b
    return chain[-1]


def resolve(arm, meshes=()):  # noqa: D401
    """Canonical humanoid map for a Fighting Path rig (names vary per character)."""
    bones = list(arm.data.bones)
    WEIGHTED.clear()
    for o in meshes:
        groups = {g.index: g.name for g in o.vertex_groups}
        for v in o.data.vertices:
            for g in v.groups:
                if g.weight > 0.05:
                    WEIGHTED.add(groups.get(g.group, ''))
    m = {}
    m['hips'] = pick_bone(bones, [r'^Bip001_Pelvis$', r'pelvis$', r'^Bip001$'])
    m['spine'] = pick_bone(bones, [r'^Bip001_Spine$', r'^Spine$'])
    m['chest'] = pick_bone(bones, [r'^Bip001_Spine2$', r'^Bip001_Spine1$', r'^Spine2$', r'^Spine1$'])
    m['neck'] = pick_bone(bones, [r'^Bip001_Neck$', r'neck$'])
    m['head'] = pick_bone(bones, [r'^Bip001_Head$', r'^head$'])
    for side, S in (('L', 'L'), ('R', 'R')):
        m[f'shoulder{S}'] = pick_bone(bones, [rf'^Bip001_{side}_Clavicle$', rf'^Clavicle_{side}$'])
        arm_b = pick_bone(bones, [rf'^Bip001_{side}_UpperArm$', rf'^BN_Arm_{side}01$', rf'^BN_Arm01_{side}01$'])
        fore = pick_bone(bones, [rf'^Bip001_{side}_Forearm$', rf'^BN_Arm_{side}04$', rf'^BN_Arm01_{side}04$'])
        hand = pick_bone(bones, [rf'^Bip001_{side}_Hand$', rf'^Bone_{side}hand$', rf'^Hand_{side}_00$',
                                 rf'^BN_Arm_{side}07$', rf'^BN_Arm01_{side}07$'])
        if hand is None or (WEIGHTED and hand.name not in WEIGHTED):
            hand = finger_parent(bones, side) or hand
        # Structural fallback: walk the arm chain from the clavicle.
        if m[f'shoulder{S}'] is not None:
            if arm_b is None:
                arm_b = m[f'shoulder{S}'].children[0] if m[f'shoulder{S}'].children else None
            if arm_b is not None and fore is None:
                fore = chain_at(bones, arm_b, 0.45)
            if arm_b is not None and hand is None:
                hand = chain_at(bones, arm_b, 0.95)
        m[f'arm{S}'], m[f'fore{S}'], m[f'hand{S}'] = arm_b, fore, hand
        thigh = pick_bone(bones, [rf'^Bip001_{side}_Thigh$', rf'^BN_Cal_{side}01$', rf'^Leg_{side}_Bone01$'])
        calf = pick_bone(bones, [rf'^Bip001_{side}_Calf$', rf'^BN_Cal_{side}04$'])
        foot = pick_bone(bones, [rf'^Bip001_{side}_Foot$', rf'^Bone_{side}foot_01$', rf'^BN_Cal_{side}07$'])
        if thigh is not None:
            if calf is None:
                calf = chain_at(bones, thigh, 0.5)
            if foot is None:
                foot = chain_at(bones, thigh, 0.95)
        m[f'thigh{S}'], m[f'calf{S}'], m[f'foot{S}'] = thigh, calf, foot
        m[f'toe{S}'] = pick_bone(bones, [rf'^Bip001_{side}_Toe0$', rf'^BN_Toe_{side}1$'])
    m['weapon'] = pick_bone(bones, [r'^Bip001_Prop1$', r'^Bone_weapon01$', r'^Weapon_Bone01$', r'weapon.*bone|bone.*weapon'])
    # The weapon mesh is the ground truth: whichever bone carries most of its weight *is* the
    # weapon bone, whatever the rip called it (several rigs use plain `Bone0xx` names).
    wb = weapon_bone(meshes, bones)
    if wb is not None:
        m['weapon'] = wb
    return m


def weapon_bone(meshes, bones):
    """Deform bones of the weapon mesh: the dominant one, then the rest of the prop's bones.

    A held weapon is usually split over several bones (Law's Kikoku rides on four), so the engine
    needs all of them to carry the prop into the hand as one rigid piece. They are renamed
    `OP_Weapon`, `OP_Weapon_1`, … here and moved together at runtime.
    """
    by_name = {b.name: b for b in bones}
    totals = {}
    for o in meshes:
        if not re.search(r'weapon|sword|blade|katana', o.name, re.I):
            continue
        groups = {g.index: g.name for g in o.vertex_groups}
        for v in o.data.vertices:
            for g in v.groups:
                n = groups.get(g.group)
                if n in by_name and g.weight > 0.05:
                    totals[n] = totals.get(n, 0.0) + g.weight
    if not totals:
        return None
    ordered = sorted(totals.items(), key=lambda kv: -kv[1])
    cut = ordered[0][1] * 0.05
    extras = [by_name[n] for n, w in ordered[1:] if w >= cut][:8]
    for i, b in enumerate(extras):
        b.name = f'OP_Weapon_{i + 1}'
    return by_name[ordered[0][0]]


CANON = {
    'hips': 'OP_Hips', 'spine': 'OP_Spine', 'chest': 'OP_Chest', 'neck': 'OP_Neck', 'head': 'OP_Head',
    'shoulderL': 'OP_L_Shoulder', 'armL': 'OP_L_Arm', 'foreL': 'OP_L_Fore', 'handL': 'OP_L_Hand',
    'shoulderR': 'OP_R_Shoulder', 'armR': 'OP_R_Arm', 'foreR': 'OP_R_Fore', 'handR': 'OP_R_Hand',
    'thighL': 'OP_L_Thigh', 'calfL': 'OP_L_Calf', 'footL': 'OP_L_Foot', 'toeL': 'OP_L_Toe',
    'thighR': 'OP_R_Thigh', 'calfR': 'OP_R_Calf', 'footR': 'OP_R_Foot', 'toeR': 'OP_R_Toe',
    'weapon': 'OP_Weapon',
}


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ext = os.path.splitext(SRC)[1].lower()
    if ext == '.dae':
        bpy.ops.wm.collada_import(filepath=SRC)
    elif ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=SRC, automatic_bone_orientation=True)
    else:
        raise SystemExit(f'unsupported source {SRC}')

    # Some rips ship Blender primitives left over from the ripping session (Koby carries an
    # Icosphere); they would render as a stray ball around the fighter.
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and re.match(r'^(Icosphere|Sphere|Cube|Plane|Cylinder|Circle)(\.\d+)?$', o.name, re.I):
            print('DROP', o.name)
            bpy.data.objects.remove(o, do_unlink=True)

    arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    if not arms:
        raise SystemExit('no armature in ' + SRC)
    arm = max(arms, key=lambda a: len(a.data.bones))

    # --- materials: base colour from the *_BC texture, alpha-clip where the texture has alpha
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        img = next((n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
        bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf:
            bsdf.inputs['Metallic'].default_value = 0.0
            bsdf.inputs['Roughness'].default_value = 0.8
            if 'Specular IOR Level' in bsdf.inputs:
                bsdf.inputs['Specular IOR Level'].default_value = 0.2
        mat.use_backface_culling = False
        if img:
            img.alpha_mode = 'CHANNEL_PACKED'
            has_alpha = img.depth in (32, 64)
            if has_alpha and re.search(r'hair|cloak|face|weapon|eye', mat.name, re.I):
                mat.blend_method = 'CLIP'
                mat.alpha_threshold = 0.5
            else:
                mat.blend_method = 'OPAQUE'

    # --- canonical bone renaming (every other bone keeps its original name)
    resolved = resolve(arm, meshes)
    bone_map, missing = {}, []
    for key, target in CANON.items():
        b = resolved.get(key)
        if b is None:
            missing.append(key)
            continue
        bone_map[key] = target
        b.name = target

    # --- model size, measured on the evaluated body meshes (weapons/props excluded)
    dg = bpy.context.evaluated_depsgraph_get()
    from mathutils import Vector
    lo = [1e9, 1e9, 1e9]
    hi = [-1e9, -1e9, -1e9]
    for o in meshes:
        if re.search(r'weapon|prop|sword|blade', o.name, re.I):
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        for v in me.vertices:
            w = ev.matrix_world @ v.co
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
        ev.to_mesh_clear()
    height = hi[2] - lo[2]
    # Hair, capes and props make the mesh box unreliable (Shiki's cape alone is 14 units tall),
    # so the engine scales on the head bone instead: eye level * 1.13 ~ standing height.
    head_bone = arm.data.bones.get('OP_Head') if 'OP_Head' in [b.name for b in arm.data.bones] else None
    head_y = (arm.matrix_world @ head_bone.head_local).z if head_bone else height * 0.88

    # The rips come in wildly different units (Karasu is 335 units tall, Koby 0.017), so every
    # model is normalised here: head bone at y = 1. The engine then scales by the character's
    # real height (Roster: OpbrProfile.height) and never has to know the source units.
    if head_y > 1e-6:
        k = 1.0 / head_y
        arm.scale = tuple(v * k for v in arm.scale)
        bpy.context.view_layer.update()
        height *= k
        head_y = 1.0

    # --- secondary-motion chain roots (cloth / hair / ribbons), kept intact for spring bones
    chains = []
    for b in arm.data.bones:
        n = norm(b.name)
        if not DYN.search(n) or SKIP_CHAIN.search(n):
            continue
        if b.parent is not None and DYN.search(norm(b.parent.name)):
            continue  # not a chain root
        depth, cur = 1, b
        while cur.children:
            cur = cur.children[0]
            depth += 1
        if depth >= 2:
            chains.append({'root': b.name, 'len': depth})

    bpy.ops.object.select_all(action='SELECT')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format='GLB', use_selection=True,
        export_apply=False, export_yup=True, export_skins=True,
        export_animations=False, export_morph=False,
        export_image_format='AUTO', export_texture_dir='',
    )

    manifest = {
        'key': KEY,
        'weighted': sorted(n for n in WEIGHTED if n.startswith('OP_')),
        'source': os.path.basename(SRC),
        'height': round(height, 4),
        'headY': round(head_y, 4),
        'bones': bone_map,
        'missing': missing,
        'chains': sorted(chains, key=lambda c: -c['len'])[:24],
        'meshes': [o.name for o in meshes],
    }
    with open(os.path.splitext(OUT)[0] + '.json', 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=1)
    print('OPBR_OK', KEY, 'height=%.3f' % height, 'missing=', missing, 'chains=', len(chains))


main()
