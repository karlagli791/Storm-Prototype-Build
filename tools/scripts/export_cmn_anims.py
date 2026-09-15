"""Export the CC2 common animation bank (1cmnbod1) as a GLB clip library. Track names carry the
1cmn00t0 bone prefix; the engine remaps them to each character's prefix at load time."""
import bpy, sys, os, addon_utils
argv = sys.argv[sys.argv.index("--") + 1:]
out, src = argv[0], argv[1]
extra = argv[2:]  # extra containers whose 1cmnbod1-slot actions (victim demo clips) join the bank
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("Blender-XFBIN-Importer", default_set=True, persistent=True)
bpy.ops.import_scene.xfbin(directory=os.path.dirname(src), files=[{"name": os.path.basename(src)}])
for x in extra:
    try: bpy.ops.import_scene.xfbin(directory=os.path.dirname(os.path.abspath(x)), files=[{"name": os.path.basename(x)}])
    except Exception as e: print("import failed", x, e)
arm = bpy.data.objects["1cmnbod1"]
keep = {arm}
for o in bpy.data.objects:
    if o.type == 'MESH' and o.parent == arm and '_lod' not in o.name.lower():
        keep.add(o)
for o in list(bpy.data.objects):
    if o not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
for mat in bpy.data.materials:
    mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    outn = nt.nodes.new('ShaderNodeOutputMaterial'); bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(bsdf.outputs['BSDF'], outn.inputs['Surface'])
if arm.animation_data: arm.animation_data_clear()
if arm.data.animation_data: arm.data.animation_data_clear()
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'; pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
bpy.context.view_layer.update()
arm.animation_data_create()
for act in bpy.data.actions:
    for slot in list(act.slots):
        if slot.name_display != arm.name:
            try: act.slots.remove(slot)
            except Exception as e: print("slot remove failed", act.name, slot.name_display, e)
for act in list(bpy.data.actions):
    if not any(sl.name_display == arm.name for sl in act.slots): bpy.data.actions.remove(act)
print("clips:", sorted(a.name for a in bpy.data.actions))
for o in keep: o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True, export_optimize_animation_size=True, export_skins=True, export_apply=False, export_yup=True, export_image_format='NONE', export_materials='EXPORT')
print("EXPORTED", out, os.path.getsize(out))
