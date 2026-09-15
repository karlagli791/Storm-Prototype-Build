"""Render select-screen art for characters without Storm 2 UI textures (Mifune, Indra) using the
same CC2 toon look as blender_toon.py: full-body "stand" (transparent), 128 px face icon on the
Storm 2 teal gradient, and a 192 px HUD medallion.

usage: blender -b --python render_portraits.py -- <code> <out_dir> <model.glb | file.blend | bod1.xfbin...>
"""
import bpy, sys, os, math, addon_utils

argv = sys.argv[sys.argv.index("--") + 1:]
code, out_dir = argv[0], argv[1]
rest = argv[2:]
pose_files = []
if '--pose' in rest:
    i = rest.index('--pose'); pose_files = rest[i + 1:]; rest = rest[:i]
files = rest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.makedirs(out_dir, exist_ok=True)
here = os.path.dirname(os.path.abspath(__file__))
ramp_png = os.path.join(os.path.dirname(os.path.dirname(here)), "public", "assets", "ui", "celshade_ramp.png")

if files[0].endswith('.blend'):
    bpy.ops.wm.open_mainfile(filepath=files[0])
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if files[0].endswith('.glb'):
        bpy.ops.import_scene.gltf(filepath=files[0])
    else:
        addon_utils.enable("Blender-XFBIN-Importer", default_set=True, persistent=True)
        for path in files:
            bpy.ops.import_scene.xfbin(directory=os.path.dirname(path), files=[{"name": os.path.basename(path)}])

arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
keep = {arm}
for o in bpy.data.objects:
    if o.type == 'MESH' and (o.parent == arm or any(m.type == 'ARMATURE' for m in o.modifiers)) and not any(k in o.name.lower() for k in ('_lod', 'shadow')):
        keep.add(o)
for o in list(bpy.data.objects):
    if o not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'; pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
if arm.animation_data:
    arm.animation_data_clear()
# idle stance if a clip exists (nut0 / win pose)
act = next((a for a in bpy.data.actions if a.name.endswith('nut0')), None) or next((a for a in bpy.data.actions if 'win' in a.name), None)
if act:
    arm.animation_data_create(); arm.animation_data.action = act
    slot = next((sl for sl in act.slots if sl.name_display == arm.name), None) or (act.slots[0] if len(act.slots) else None)
    if slot: arm.animation_data.action_slot = slot
    print('POSE', act.name, 'slot', slot.name_display if slot else None)
    bpy.context.scene.frame_set(8)
elif pose_files:
    # No idle clip of its own (community rip): borrow another character's nut0 by bone-prefix retarget.
    from pose_retarget import apply_pose
    apply_pose(arm, f'{code}00t0', pose_files, clip_suffix='nut0', frame=8)

# ---------------------------------------------------------------- toon material (same as blender_toon.py)
def build_toon():
    g = bpy.data.node_groups.new("CC2 Toon", 'ShaderNodeTree')
    gi = g.nodes.new('NodeGroupInput'); go = g.nodes.new('NodeGroupOutput')
    g.interface.new_socket("Base Color", in_out='INPUT', socket_type='NodeSocketColor')
    g.interface.new_socket("Shader", in_out='OUTPUT', socket_type='NodeSocketShader')
    diffuse = g.nodes.new('ShaderNodeBsdfDiffuse'); diffuse.inputs['Color'].default_value = (1, 1, 1, 1)
    to_rgb = g.nodes.new('ShaderNodeShaderToRGB'); sep = g.nodes.new('ShaderNodeSeparateColor')
    ramp_tex = g.nodes.new('ShaderNodeTexImage'); comb = g.nodes.new('ShaderNodeCombineXYZ')
    comb.inputs['Y'].default_value = (64 - 8 - 0.5) / 64.0
    img = bpy.data.images.load(ramp_png); img.colorspace_settings.name = 'Non-Color'; ramp_tex.image = img; ramp_tex.interpolation = 'Closest'
    mul = g.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    layer = g.nodes.new('ShaderNodeLayerWeight'); layer.inputs['Blend'].default_value = 0.35
    rim_step = g.nodes.new('ShaderNodeMath'); rim_step.operation = 'GREATER_THAN'; rim_step.inputs[1].default_value = 0.6
    rim_scale = g.nodes.new('ShaderNodeMath'); rim_scale.operation = 'MULTIPLY'; rim_scale.inputs[1].default_value = 0.25
    rim_mix = g.nodes.new('ShaderNodeMix'); rim_mix.data_type = 'RGBA'; rim_mix.blend_type = 'ADD'; rim_mix.inputs[7].default_value = (1, 1, 1, 1)
    emit = g.nodes.new('ShaderNodeEmission')
    L = g.links
    L.new(diffuse.outputs['BSDF'], to_rgb.inputs['Shader']); L.new(to_rgb.outputs['Color'], sep.inputs['Color'])
    L.new(sep.outputs['Red'], comb.inputs['X']); L.new(comb.outputs['Vector'], ramp_tex.inputs['Vector'])
    L.new(ramp_tex.outputs['Color'], mul.inputs[6]); L.new(gi.outputs['Base Color'], mul.inputs[7])
    L.new(layer.outputs['Fresnel'], rim_step.inputs[0]); L.new(rim_step.outputs['Value'], rim_scale.inputs[0])
    L.new(mul.outputs[2], rim_mix.inputs[6]); L.new(rim_scale.outputs['Value'], rim_mix.inputs['Factor'])
    L.new(rim_mix.outputs[2], emit.inputs['Color']); L.new(emit.outputs['Emission'], go.inputs['Shader'])
    return g
toon = build_toon()
for mat in bpy.data.materials:
    if not mat.node_tree: continue
    img = None
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and 'celshade' not in n.image.name.lower() and 'error' not in n.image.name.lower():
            img = n.image; break
    nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); grp = nt.nodes.new('ShaderNodeGroup'); grp.node_tree = toon
    nt.links.new(grp.outputs['Shader'], out.inputs['Surface'])
    if img:
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; nt.links.new(tex.outputs['Color'], grp.inputs['Base Color'])
    else:
        grp.inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1)
ink = bpy.data.materials.new("CC2 Outline"); ink.use_nodes = True
nt = ink.node_tree; nt.nodes.clear(); o = nt.nodes.new('ShaderNodeOutputMaterial'); e = nt.nodes.new('ShaderNodeEmission')
e.inputs['Color'].default_value = (0.04, 0.04, 0.04, 1); nt.links.new(e.outputs['Emission'], o.inputs['Surface']); ink.use_backface_culling = True
for ob in keep:
    if ob.type != 'MESH': continue
    ob.data.materials.append(ink)
    mod = ob.modifiers.new("Outline", 'SOLIDIFY'); mod.thickness = -0.008; mod.offset = 1.0; mod.use_flip_normals = True; mod.use_rim = False
    mod.material_offset = len(ob.data.materials) - 1

# ---------------------------------------------------------------- scene
scene = bpy.context.scene
for ob in bpy.data.objects:
    if ob.name not in scene.collection.all_objects:
        scene.collection.objects.link(ob)
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.film_transparent = True
scene.render.image_settings.color_mode = 'RGBA'
world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.62, 0.78, 0.91, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
sun = bpy.data.lights.new("sun", 'SUN'); sun.energy = 2.2; sun.angle = 0.02
sun_o = bpy.data.objects.new("sun", sun); scene.collection.objects.link(sun_o)
sun_o.rotation_euler = (math.radians(55), math.radians(-10), math.radians(35))

# bounds of the character (world space) for framing
import mathutils
bpy.context.view_layer.update()
mn = mathutils.Vector((1e9, 1e9, 1e9)); mx = mathutils.Vector((-1e9, -1e9, -1e9))
depsgraph = bpy.context.evaluated_depsgraph_get()
for ob in keep:
    if ob.type != 'MESH': continue
    ev = ob.evaluated_get(depsgraph)
    for v in ev.data.vertices:
        w = ev.matrix_world @ v.co
        mn.x = min(mn.x, w.x); mn.y = min(mn.y, w.y); mn.z = min(mn.z, w.z)
        mx.x = max(mx.x, w.x); mx.y = max(mx.y, w.y); mx.z = max(mx.z, w.z)
h = mx.z - mn.z; cz = (mn.z + mx.z) / 2; cx = (mn.x + mx.x) / 2; cy = (mn.y + mx.y) / 2
print('BOUNDS', mn, mx, 'height', h)

cam_data = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cam_data); scene.collection.objects.link(cam); scene.camera = cam
cam_data.lens = 70

def shoot(name, res, target_z, size_z, yaw_deg=22, pitch_deg=88):
    dist = size_z / (2 * math.tan(0.5 * cam_data.angle_y)) * 1.12 if res[1] >= res[0] else size_z / (2 * math.tan(0.5 * cam_data.angle_x)) * 1.12
    yaw = math.radians(yaw_deg)
    cam.location = (cx + dist * math.sin(yaw), cy - dist * math.cos(yaw), target_z + size_z * 0.02)
    cam.rotation_euler = (math.radians(pitch_deg), 0, yaw)
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.filepath = os.path.join(out_dir, name)
    bpy.ops.render.render(write_still=True)
    print('RENDERED', name)

# full body stand (portrait aspect like the Storm 2 art: 768x1248)
scene.render.resolution_percentage = 100
shoot(f"stand_{code}.png", (768, 1248), cz, h * 1.06, yaw_deg=18)
# face: top ~22% of the body
face_c = mx.z - h * 0.09
shoot(f"face_{code}.png", (512, 512), face_c, h * 0.26, yaw_deg=14, pitch_deg=86)
print('DONE')
