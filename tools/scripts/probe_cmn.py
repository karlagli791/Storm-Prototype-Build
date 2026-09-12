import bpy, sys, os, addon_utils
argv = sys.argv[sys.argv.index("--")+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("Blender-XFBIN-Importer", default_set=True, persistent=True)
for path in argv:
    bpy.ops.import_scene.xfbin(directory=os.path.dirname(path), files=[{"name": os.path.basename(path)}])
print("ARMATURES", [(o.name, len(o.data.bones)) for o in bpy.data.objects if o.type == 'ARMATURE'])
print("MESHES", len([o for o in bpy.data.objects if o.type == 'MESH']))
print("ACTIONS", len(bpy.data.actions), sorted(a.name for a in bpy.data.actions))
print("IMAGES", [(im.name, im.size[:]) for im in bpy.data.images])
for im in bpy.data.images:
    if 'celshade' in im.name.lower() and im.size[0] > 0:
        im.filepath_raw = os.path.join(os.getcwd(), 'public', 'assets', 'ui', 'celshade_ramp.png'); im.file_format = 'PNG'; im.save(); print('SAVED RAMP', im.filepath_raw)
