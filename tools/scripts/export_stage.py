"""Headless Blender: import a CC2 stage xfbin, drop LODs/collision helpers, rebuild textured
materials, bake a uniform scale, export a static GLB.
usage: blender -b --python export_stage.py -- <out.glb> <scale> <stage.xfbin>
"""
import bpy, sys, os, addon_utils, re
from mathutils import Vector
argv = sys.argv[sys.argv.index("--") + 1:]
out, scale = argv[0], float(argv[1]); files = argv[2:]
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("Blender-XFBIN-Importer", default_set=True, persistent=True)
for path in files:
    bpy.ops.import_scene.xfbin(directory=os.path.dirname(path), files=[{"name": os.path.basename(path)}], import_modelhit=False)

keep = []
for o in list(bpy.data.objects):
    if o.type != 'MESH':
        continue
    n = o.name.lower()
    matnames = ' '.join(m.name.lower() for m in o.data.materials if m)
    if '_lod' in n or 'modelhit' in n or n.startswith('hit') or 'collision' in n or re.search(r'(^|_)hit(_|$|\d)', n) or re.search(r'(^|_)hit(_|$|\d)', matnames):
        bpy.data.objects.remove(o, do_unlink=True)
        continue
    keep.append(o)

# CC2 stages place instanced props (trees etc.) through bones. Bake that deformation now so the
# export is fully static: apply every Armature modifier at rest pose, then detach from parents
# keeping the world transform, and hang everything off one scaled root.
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for o in keep:
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    for m in list(o.modifiers):
        if m.type == 'ARMATURE':
            try:
                bpy.ops.object.modifier_apply(modifier=m.name)
            except Exception as e:
                print("modifier apply failed", o.name, e); o.modifiers.remove(m)
    o.select_set(False)
for o in keep:
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
    o.vertex_groups.clear()
for o in list(bpy.data.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)
root = bpy.data.objects.new("stage_root", None)
bpy.context.scene.collection.objects.link(root)
root.scale = (scale, scale, scale)
for o in keep:
    o.parent = root
# Report floor-ish meshes
for o in sorted(keep, key=lambda o: -len(o.data.polygons))[:12]:
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    mn = Vector(map(min, *bb)); mx = Vector(map(max, *bb))
    print(f"BIG {o.name} polys={len(o.data.polygons)} bbox=({mn.x:.1f},{mn.y:.1f},{mn.z:.1f})..({mx.x:.1f},{mx.y:.1f},{mx.z:.1f}) mats={[m.name for m in o.data.materials if m][:2]}")

# Materials -> Principled + first image
alpha_cache = {}
for mat in bpy.data.materials:
    img = None
    if mat.node_tree:
        for n in mat.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and 'celshade' not in n.image.name.lower() and 'error' not in n.image.name.lower():
                img = n.image; break
    if img is None:
        # Fallback: the add-on could not build this shader; match a texture by name fragment
        # (materials are named like "<group>_<texture>_<n>", images like "<texture>_0").
        mname = mat.name.lower()
        best = None
        for im in bpy.data.images:
            base = im.name.lower().rsplit('_', 1)[0] if '_' in im.name else im.name.lower()
            if len(base) >= 5 and base in mname and (best is None or len(base) > len(best[0])):
                best = (base, im)
        if best:
            img = best[1]
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    outn = nt.nodes.new('ShaderNodeOutputMaterial'); bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = 1.0
    if 'Specular IOR Level' in bsdf.inputs: bsdf.inputs['Specular IOR Level'].default_value = 0.0
    nt.links.new(bsdf.outputs['BSDF'], outn.inputs['Surface'])
    if img:
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        # Link alpha whenever the texture actually carries transparency (ground overlays, light
        # sheets, foliage cards). Cached per image.
        if img.name not in alpha_cache:
            has_alpha = False
            if img.channels == 4 and img.size[0] > 0:
                try:
                    import numpy as np
                    px = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
                    img.pixels.foreach_get(px)
                    has_alpha = bool(px[3::4].min() < 0.98)
                except Exception as e:
                    print("alpha probe failed", img.name, e)
            alpha_cache[img.name] = has_alpha
        if alpha_cache[img.name]:
            nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
            if hasattr(mat, 'surface_render_method'):
                mat.surface_render_method = 'BLENDED'
            else:
                mat.blend_method = 'BLEND'
            print("ALPHA material", mat.name, "<-", img.name)

bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects:
    o.select_set(True)
bpy.context.view_layer.objects.active = root
os.makedirs(os.path.dirname(out), exist_ok=True)
# Keep the GLB under GitHub's 100 MB file limit: stage textures above 1024 px are downscaled.
MAX_TEX = 1024
for img in bpy.data.images:
    try:
        w, h = img.size
        if w > MAX_TEX or h > MAX_TEX:
            f = MAX_TEX / max(w, h)
            img.scale(max(4, int(w * f)), max(4, int(h * f)))
            print("downscaled", img.name, (w, h), "->", img.size[:])
    except Exception as e:
        print("scale failed", img.name, e)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_animations=False, export_apply=True, export_skins=False, export_yup=True, export_image_format='AUTO', export_materials='EXPORT', export_texcoords=True, export_normals=True)
print("MATERIALS untextured:", sum(1 for m in bpy.data.materials if not any(n.type=='TEX_IMAGE' and n.image for n in (m.node_tree.nodes if m.node_tree else []))), "of", len(bpy.data.materials))
print("EXPORTED", out, os.path.getsize(out), "meshes", len(keep))
