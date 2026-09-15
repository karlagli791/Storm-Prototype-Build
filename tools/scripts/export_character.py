"""Headless Blender: import CC2 xfbin model + animation containers, prune LODs, rebuild
materials as Principled BSDF with the diffuse texture, keep gameplay clips, export GLB.
usage: blender -b --python export_character.py -- <code> <out.glb> <xfbin...>
"""
import bpy, sys, os, re, addon_utils
argv = sys.argv[sys.argv.index("--") + 1:]
code, out = argv[0], argv[1]
files = argv[2:]

bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("Blender-XFBIN-Importer", default_set=True, persistent=True)
for path in files:
    print("IMPORT", path)
    bpy.ops.import_scene.xfbin(directory=os.path.dirname(path), files=[{"name": os.path.basename(path)}])

arm = bpy.data.objects.get(f"{code}bod1")
if arm is None:
    raise SystemExit(f"armature {code}bod1 not found; have {[o.name for o in bpy.data.objects if o.type=='ARMATURE']}")

# Accessory armatures (e.g. 2sskacc1 sword) get merged: reparent their meshes to the main rig if bone names match.
acc_arms = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.startswith(f"{code}acc")]
for acc in acc_arms:
    for m in [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == acc]:
        if '_lod' in m.name.lower():
            continue
        # keep only if all vertex groups exist on the main armature
        vg = [g.name for g in m.vertex_groups]
        if vg and all(name in arm.data.bones for name in vg):
            m.parent = arm
            for mod in m.modifiers:
                if mod.type == 'ARMATURE':
                    mod.object = arm
            print("merged accessory mesh", m.name, "groups", vg[:4])
        else:
            print("skipped accessory mesh", m.name, "missing bones", [g for g in vg if g not in arm.data.bones][:4])

keep = {arm}
for o in bpy.data.objects:
    if o.type == 'MESH' and o.parent == arm:
        n = o.name.lower()
        if '_lod' in n or 'rasenn' in n or 'shadow' in n:
            continue
        keep.add(o)
for o in list(bpy.data.objects):
    if o not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
print("kept meshes:", [o.name for o in keep if o.type == 'MESH'])

# Rebuild materials: Principled BSDF + first non-celshade image texture found in the add-on material.
for mat in bpy.data.materials:
    img = None
    if mat.node_tree:
        for n in mat.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and 'celshade' not in n.image.name.lower() and 'error' not in n.image.name.lower():
                img = n.image
                break
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    outn = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = 1.0
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.0
    nt.links.new(bsdf.outputs['BSDF'], outn.inputs['Surface'])
    if img:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if 'eye' in mat.name.lower() or 'lod' in mat.name.lower():
            pass
    print("material", mat.name, "->", img.name if img else None)

# Keep only gameplay clips
all_names = [a.name for a in bpy.data.actions]
pat = re.compile(rf"^{code}(spl1_(s|l|e|atk)|skl\w*|sk[a-z]\d\w*|jut\w*|nut0|run1|jmp0|jmp1|lan0|dsf0|dsb0|dsl0|dsr0|dsh0l|dsh0s|dsh1l|grd0|gda0|ghf0|ghl0|ghr0|ght1|git0|git1|dow0|dow1|dmg0f|cma0[0-9]|cmb0[0-9]|cmb1[0-9]|cmr0[0-9]|ent0|hola0|hold0|inn0|spk0f|nxi0|rxn0|ixn0)$")
for act in list(bpy.data.actions):
    if not pat.match(act.name):
        bpy.data.actions.remove(act)
print("actions kept:", sorted(a.name for a in bpy.data.actions))
print("ALL ACTION NAMES BEFORE PRUNE (skl-ish):", sorted(n for n in all_names if "sk" in n))

# Mirror the add-on's PlayAnimation operator: clear animation data and reset every pose bone to
# identity so bones without keys in a clip sit at rest instead of a stale import pose.
if arm.animation_data:
    arm.animation_data_clear()
if arm.data.animation_data:
    arm.data.animation_data_clear()
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'
    pb.location = (0, 0, 0)
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.scale = (1, 1, 1)
bpy.context.view_layer.update()
# The glTF exporter (ACTIONS mode) needs animation_data to exist to temporarily assign each action.
arm.animation_data_create()
# Drop slots that target other clumps (bod2/bod3 LOD rigs, scene) so each action exports once.
for act in bpy.data.actions:
    for slot in list(act.slots):
        if slot.name_display != arm.name:
            try:
                act.slots.remove(slot)
            except Exception as e:
                print("slot remove failed", act.name, slot.name_display, e)
print("slots left e.g.", [(a.name, [s.name_display for s in a.slots]) for a in list(bpy.data.actions)[:3]])

for o in keep:
    o.select_set(True)
bpy.context.view_layer.objects.active = arm

os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    use_selection=True,
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_force_sampling=True,
    export_optimize_animation_size=True,
    export_skins=True,
    export_apply=False,
    export_yup=True,
    export_image_format='AUTO',
    export_materials='EXPORT',
    export_texcoords=True,
    export_normals=True,
)
print("EXPORTED", out, os.path.getsize(out))
