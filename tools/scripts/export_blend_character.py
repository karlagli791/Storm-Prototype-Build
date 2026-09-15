"""Headless Blender: export a community .blend character rip (CC2 bones, e.g. LorisC93's Storm
Connections Indra) to GLB with the same conventions as export_character.py: rest pose reset,
LOD meshes pruned, textures packed. Animations are NOT exported (the rip only carries a win pose);
the engine borrows a moveset from another character with the same skeleton via `animBank`.

usage: blender -b <file.blend> --python export_blend_character.py -- <code> <out.glb>
"""
import bpy, sys, os

argv = sys.argv[sys.argv.index("--") + 1:]
code, out = argv[0], argv[1]

arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
keep = {arm}
for o in bpy.data.objects:
    if o.type == 'MESH' and o.parent == arm and not any(k in o.name.lower() for k in ('_lod', 'shadow')):
        keep.add(o)
for o in list(bpy.data.objects):
    if o not in keep:
        bpy.data.objects.remove(o, do_unlink=True)

# Rest pose, no action
if arm.animation_data:
    arm.animation_data_clear()
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'; pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)

# Make sure every material exposes its base texture to the glTF exporter (Principled BSDF with the
# first image texture wired to Base Color). The rip's node trees are add-on shader groups.
for mat in bpy.data.materials:
    if not mat.node_tree: continue
    img = None
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and 'celshade' not in n.image.name.lower() and 'error' not in n.image.name.lower():
            img = n.image; break
    nt = mat.node_tree; nt.nodes.clear()
    outn = nt.nodes.new('ShaderNodeOutputMaterial'); bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], outn.inputs['Surface'])
    if img:
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if img.packed_file is None:
            try: img.pack()
            except Exception as e: print('pack failed', img.name, e)

# The rip parents meshes to the armature without an Armature modifier; glTF needs the modifier
# (or the parent-type ARMATURE) to write a skin. Add one so the engine gets a skinned mesh.
for o in keep:
    if o.type == 'MESH' and not any(m.type == 'ARMATURE' for m in o.modifiers):
        mod = o.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
        print('armature modifier added', o.name, 'groups', len(o.vertex_groups))
for o in keep:
    o.hide_set(False); o.hide_viewport = False; o.hide_render = False
    o.select_set(True)
bpy.context.view_layer.objects.active = arm
print('SELECTED', [o.name for o in bpy.context.selected_objects], 'armature visible', arm.visible_get())
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_animations=False,
                          export_skins=True, export_apply=False, export_image_format='AUTO', export_yup=True)
print("EXPORTED", out, os.path.getsize(out))
