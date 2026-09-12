import bpy, sys, os, addon_utils
argv = sys.argv[sys.argv.index("--")+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("Blender-XFBIN-Importer", default_set=True, persistent=True)
for path in argv:
    bpy.ops.import_scene.xfbin(directory=os.path.dirname(path), files=[{"name": os.path.basename(path)}])
print("IMAGES", sorted(im.name for im in bpy.data.images))
unt = [m for m in bpy.data.materials if not any(n.type=='TEX_IMAGE' and n.image for n in (m.node_tree.nodes if m.node_tree else []))]
print("UNTEXTURED sample", [m.name for m in unt[:12]])
m = next((m for m in unt if 'flo' in m.name.lower()), unt[0])
print("PROBE MAT", m.name, "props", [k for k in m.keys()], "nodes", [n.type for n in (m.node_tree.nodes if m.node_tree else [])])
d = getattr(m, 'xfbin_material_data', None)
if d is not None:
    print("  xfbin_material_data keys", [p.identifier for p in d.bl_rna.properties][:20])
    for attr in ('texture_groups', 'textures'):
        v = getattr(d, attr, None)
        if v is not None:
            for tg in v:
                print("   ", attr, [getattr(t, 'name', getattr(t, 'texture_name', str(t))) for t in getattr(tg, 'textures', [tg])])
# which meshes use the floor material
for o in bpy.data.objects:
    if o.type == 'MESH' and any(mm and 'flo' in mm.name.lower() for mm in o.data.materials):
        print("FLOOR MESH", o.name, [mm.name for mm in o.data.materials if mm], "uv layers", [u.name for u in o.data.uv_layers])
        break
