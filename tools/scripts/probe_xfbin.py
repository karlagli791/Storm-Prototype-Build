import bpy, sys, addon_utils, os
argv = sys.argv[sys.argv.index("--")+1:]
addon_utils.enable("Blender-XFBIN-Importer", default_set=True, persistent=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("Blender-XFBIN-Importer", default_set=True, persistent=True)
for path in argv:
    print("IMPORTING", path)
    bpy.ops.import_scene.xfbin(directory=os.path.dirname(path), files=[{"name": os.path.basename(path)}])
print("=== OBJECTS ===")
for o in bpy.data.objects:
    print(o.type, o.name, "parent=", o.parent.name if o.parent else None)
    if o.type == 'MESH':
        print("   verts", len(o.data.vertices), "polys", len(o.data.polygons), "mats", [m.name for m in o.data.materials if m])
        mods = [m.type for m in o.modifiers]; print("   modifiers", mods)
print("=== ARMATURES ===")
for a in bpy.data.armatures:
    print(a.name, "bones", len(a.bones))
    for b in list(a.bones)[:400]:
        print("   ", b.name)
print("=== ACTIONS ===")
for act in bpy.data.actions:
    print(act.name, "frames", act.frame_range[:], "fcurves", len(act.fcurves))
print("=== IMAGES ===")
for im in bpy.data.images:
    print(im.name, im.size[:], im.source)
