import bpy, sys, os, addon_utils
from mathutils import Vector
argv = sys.argv[sys.argv.index("--")+1:]
code = argv[0]; files = argv[1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("Blender-XFBIN-Importer", default_set=True, persistent=True)
for path in files:
    bpy.ops.import_scene.xfbin(directory=os.path.dirname(path), files=[{"name": os.path.basename(path)}])
arm = bpy.data.objects[f"{code}bod1"]
print("ARM object rot", [round(v,3) for v in arm.rotation_euler], "scale", [round(v,3) for v in arm.scale], "loc", [round(v,3) for v in arm.location])
def report(tag):
    bpy.context.view_layer.update()
    mw = arm.matrix_world
    head = mw @ arm.pose.bones[f"{code}00t0 head"].head
    pelvis = mw @ arm.pose.bones[f"{code}00t0 pelvis"].head
    lfoot = mw @ arm.pose.bones[f"{code}00t0 l foot"].head
    up = (head - pelvis)
    print(f"{tag}: pelvis={tuple(round(v,2) for v in pelvis)} head={tuple(round(v,2) for v in head)} lfoot={tuple(round(v,2) for v in lfoot)} up_dir={tuple(round(v,2) for v in up.normalized())}")
    root = arm.pose.bones[f"{code}00t0"]
    print("   root bone matrix_basis rot", [round(v,3) for v in root.matrix_basis.to_euler()], "trall", [round(v,3) for v in arm.pose.bones[f"{code}00t0 trall"].matrix_basis.to_euler()])
report("REST(no action)")
for name in [f"{code}nut0", f"{code}run1", f"{code}grd0"]:
    act = bpy.data.actions.get(name)
    if not act: print("missing", name); continue
    if arm.animation_data is None: arm.animation_data_create()
    arm.animation_data.action = act
    slot = None
    for s in act.slots:
        if s.name_display == f"{code}bod1" or s.name_display == arm.name: slot = s
    if slot: arm.animation_data.action_slot = slot
    for fr in (0, 10, 30):
        bpy.context.scene.frame_set(fr)
        report(f"{name} f{fr} slot={slot.name_display if slot else None}")
        root = arm.pose.bones[f"{code}00t0"]
        saved = root.rotation_quaternion.copy(); savedm = root.rotation_mode
        root.rotation_mode = 'QUATERNION'; root.rotation_quaternion = (1,0,0,0)
        report(f"   -> root rot zeroed")
        rhand = arm.matrix_world @ arm.pose.bones[f"{code}00t0 r hand"].head; print("      rhand", tuple(round(v,2) for v in rhand))
        root.rotation_quaternion = saved; root.rotation_mode = savedm
