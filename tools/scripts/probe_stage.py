import bpy, sys, os, addon_utils
from mathutils import Vector
argv = sys.argv[sys.argv.index("--")+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("Blender-XFBIN-Importer", default_set=True, persistent=True)
for path in argv:
    bpy.ops.import_scene.xfbin(directory=os.path.dirname(path), files=[{"name": os.path.basename(path)}])
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
print("MESHES", len(meshes), "ARMATURES", len([o for o in bpy.data.objects if o.type=='ARMATURE']), "EMPTIES", len([o for o in bpy.data.objects if o.type=='EMPTY']))
tot = 0
mn = Vector((1e9,1e9,1e9)); mx = Vector((-1e9,-1e9,-1e9))
for o in meshes:
    tot += len(o.data.polygons)
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
print("TOTAL POLYS", tot, "BBOX min", tuple(round(v,1) for v in mn), "max", tuple(round(v,1) for v in mx))
for o in meshes[:40]:
    print("  ", o.name, "polys", len(o.data.polygons), "parent", o.parent.name if o.parent else None, "mats", [m.name for m in o.data.materials if m][:3])
print("IMAGES", [(im.name, im.size[:]) for im in bpy.data.images][:40])
print("MATERIALS", len(bpy.data.materials))
