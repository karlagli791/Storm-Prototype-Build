"""Blender cel-shading study for the CC2 characters.

Builds a "CC2 Toon" node group that mirrors the engine shader: Diffuse -> Shader to RGB ->
celshade ramp (system/celshade.tex row 8 = 3 bands) x base colour, fresnel rim, hard specular,
plus an inverted-hull outline via a Solidify modifier with flipped normals. Renders a turnaround
still with EEVEE and saves a .blend the user can open and keep iterating on.

usage: blender -b --python blender_toon.py -- <code> <out_png> <out_blend> <bod1.xfbin> [more xfbins]
"""
import bpy, sys, os, math, addon_utils

argv = sys.argv[sys.argv.index("--") + 1:]
code, out_png, out_blend = argv[0], argv[1], argv[2]
files = argv[3:]
ramp_png = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "public", "assets", "ui", "celshade_ramp.png")

bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("Blender-XFBIN-Importer", default_set=True, persistent=True)
for path in files:
    bpy.ops.import_scene.xfbin(directory=os.path.dirname(path), files=[{"name": os.path.basename(path)}])

arm = bpy.data.objects[f"{code}bod1"]
keep = {arm}
for o in bpy.data.objects:
    if o.type == 'MESH' and o.parent == arm and not any(k in o.name.lower() for k in ('_lod', 'rasenn', 'shadow')):
        keep.add(o)
for o in list(bpy.data.objects):
    if o not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
# Rest pose (add-on leaves stale pose transforms)
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'; pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
if arm.animation_data:
    arm.animation_data_clear()
# Pose with the idle clip's first frame if available for a natural stance
act = bpy.data.actions.get(f"{code}nut0")
if act:
    arm.animation_data_create(); arm.animation_data.action = act
    for s in act.slots:
        if s.name_display == arm.name: arm.animation_data.action_slot = s
    bpy.context.scene.frame_set(8)

# ---------------------------------------------------------------- node group
def build_toon_group():
    g = bpy.data.node_groups.new("CC2 Toon", 'ShaderNodeTree')
    gi = g.nodes.new('NodeGroupInput'); go = g.nodes.new('NodeGroupOutput')
    g.interface.new_socket("Base Color", in_out='INPUT', socket_type='NodeSocketColor')
    g.interface.new_socket("Rim Color", in_out='INPUT', socket_type='NodeSocketColor')
    g.interface.new_socket("Rim Threshold", in_out='INPUT', socket_type='NodeSocketFloat')
    g.interface.new_socket("Specular", in_out='INPUT', socket_type='NodeSocketFloat')
    g.interface.new_socket("Shader", in_out='OUTPUT', socket_type='NodeSocketShader')
    g.interface.items_tree["Rim Threshold"].default_value = 0.6
    g.interface.items_tree["Specular"].default_value = 0.35
    g.interface.items_tree["Rim Color"].default_value = (1, 1, 1, 1)

    diffuse = g.nodes.new('ShaderNodeBsdfDiffuse')
    to_rgb = g.nodes.new('ShaderNodeShaderToRGB')
    # Lighting ramp: sample the CC2 celshade texture row 8 by light intensity
    ramp_tex = g.nodes.new('ShaderNodeTexImage')
    ramp_img = bpy.data.images.load(ramp_png) if os.path.exists(ramp_png) else None
    if ramp_img:
        ramp_img.colorspace_settings.name = 'Non-Color'
        ramp_tex.image = ramp_img
        ramp_tex.interpolation = 'Closest'
    # build UV = (intensity, row 8/64)
    sep = g.nodes.new('ShaderNodeSeparateColor'); comb = g.nodes.new('ShaderNodeCombineXYZ')
    # PNG row 8 counted from the top; Blender samples V from the bottom
    comb.inputs['Y'].default_value = (64 - 8 - 0.5) / 64.0
    # Fallback ramp when the texture is missing: constant 3-step colour ramp
    cramp = g.nodes.new('ShaderNodeValToRGB'); cramp.color_ramp.interpolation = 'CONSTANT'
    cr = cramp.color_ramp; cr.elements[0].position = 0.0; cr.elements[0].color = (0.30, 0.30, 0.30, 1)
    e1 = cr.elements.new(0.45); e1.color = (0.60, 0.60, 0.60, 1)
    e2 = cr.elements.new(0.72); e2.color = (1.0, 1.0, 1.0, 1)
    mul = g.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    # Fresnel rim (hard step)
    layer = g.nodes.new('ShaderNodeLayerWeight'); layer.inputs['Blend'].default_value = 0.35
    rim_step = g.nodes.new('ShaderNodeMath'); rim_step.operation = 'GREATER_THAN'
    rim_scale = g.nodes.new('ShaderNodeMath'); rim_scale.operation = 'MULTIPLY'; rim_scale.inputs[1].default_value = 0.28
    rim_mix = g.nodes.new('ShaderNodeMix'); rim_mix.data_type = 'RGBA'; rim_mix.blend_type = 'ADD'
    # Hard specular from a glossy shader -> RGB -> step
    glossy = g.nodes.new('ShaderNodeBsdfGlossy'); glossy.inputs['Roughness'].default_value = 0.25
    gl_rgb = g.nodes.new('ShaderNodeShaderToRGB')
    gl_sep = g.nodes.new('ShaderNodeSeparateColor')
    spec_step = g.nodes.new('ShaderNodeMath'); spec_step.operation = 'GREATER_THAN'; spec_step.inputs[1].default_value = 0.75
    spec_scale = g.nodes.new('ShaderNodeMath'); spec_scale.operation = 'MULTIPLY'
    spec_add = g.nodes.new('ShaderNodeMix'); spec_add.data_type = 'RGBA'; spec_add.blend_type = 'ADD'
    emit = g.nodes.new('ShaderNodeEmission'); emit.inputs['Strength'].default_value = 1.0

    L = g.links
    diffuse.inputs['Color'].default_value = (1, 1, 1, 1)
    L.new(diffuse.outputs['BSDF'], to_rgb.inputs['Shader'])
    L.new(to_rgb.outputs['Color'], sep.inputs['Color'])
    L.new(sep.outputs['Red'], comb.inputs['X'])
    if ramp_img:
        L.new(comb.outputs['Vector'], ramp_tex.inputs['Vector'])
        L.new(ramp_tex.outputs['Color'], mul.inputs[6])
    else:
        L.new(sep.outputs['Red'], cramp.inputs['Fac'])
        L.new(cramp.outputs['Color'], mul.inputs[6])
    L.new(gi.outputs['Base Color'], mul.inputs[7])
    # rim
    L.new(layer.outputs['Fresnel'], rim_step.inputs[0])
    L.new(gi.outputs['Rim Threshold'], rim_step.inputs[1])
    L.new(mul.outputs[2], rim_mix.inputs[6])
    L.new(gi.outputs['Rim Color'], rim_mix.inputs[7])
    L.new(rim_step.outputs['Value'], rim_scale.inputs[0])
    L.new(rim_scale.outputs['Value'], rim_mix.inputs['Factor'])
    # spec
    L.new(glossy.outputs['BSDF'], gl_rgb.inputs['Shader'])
    L.new(gl_rgb.outputs['Color'], gl_sep.inputs['Color'])
    L.new(gl_sep.outputs['Red'], spec_step.inputs[0])
    L.new(spec_step.outputs['Value'], spec_scale.inputs[0])
    L.new(gi.outputs['Specular'], spec_scale.inputs[1])
    L.new(rim_mix.outputs[2], spec_add.inputs[6])
    spec_add.inputs[7].default_value = (1, 1, 1, 1)
    L.new(spec_scale.outputs['Value'], spec_add.inputs['Factor'])
    L.new(spec_add.outputs[2], emit.inputs['Color'])
    L.new(emit.outputs['Emission'], go.inputs['Shader'])
    return g

toon = build_toon_group()

# ---------------------------------------------------------------- materials
for mat in bpy.data.materials:
    img = None
    if mat.node_tree:
        for n in mat.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and 'celshade' not in n.image.name.lower() and 'error' not in n.image.name.lower():
                img = n.image; break
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    grp = nt.nodes.new('ShaderNodeGroup'); grp.node_tree = toon
    nt.links.new(grp.outputs['Shader'], out.inputs['Surface'])
    if img:
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
        nt.links.new(tex.outputs['Color'], grp.inputs['Base Color'])
    else:
        grp.inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1)

# Outline material + Solidify inverted hull (front-face culled shell)
ink = bpy.data.materials.new("CC2 Outline"); ink.use_nodes = True
nt = ink.node_tree; nt.nodes.clear()
o = nt.nodes.new('ShaderNodeOutputMaterial'); e = nt.nodes.new('ShaderNodeEmission')
e.inputs['Color'].default_value = (0.04, 0.04, 0.04, 1); nt.links.new(e.outputs['Emission'], o.inputs['Surface'])
ink.use_backface_culling = True
for ob in keep:
    if ob.type != 'MESH': continue
    ob.data.materials.append(ink)
    mod = ob.modifiers.new("Outline", 'SOLIDIFY')
    mod.thickness = -0.012 if ob.name.endswith('body') or 'kao' in ob.name or 'kami' in ob.name else -0.006
    mod.offset = 1.0
    mod.use_flip_normals = True
    mod.use_rim = False
    mod.material_offset = len(ob.data.materials) - 1
    # keep the armature modifier first
    while ob.modifiers.find(mod.name) < len(ob.modifiers) - 1:
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_move_down(modifier=mod.name)

# ---------------------------------------------------------------- scene
scene = bpy.context.scene
for o in bpy.data.objects:
    if o.name not in scene.collection.all_objects:
        scene.collection.objects.link(o)
scene.render.engine = 'BLENDER_EEVEE_NEXT' if hasattr(bpy.types, 'SceneEEVEE') and 'BLENDER_EEVEE_NEXT' in [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.resolution_x = 1280; scene.render.resolution_y = 720; scene.render.resolution_percentage = 100
scene.render.film_transparent = False
world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.62, 0.78, 0.91, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
cam_data = bpy.data.cameras.new("cam"); cam_data.lens = 50
cam = bpy.data.objects.new("cam", cam_data); scene.collection.objects.link(cam)
cam.location = (2.2, -3.4, 1.15); cam.rotation_euler = (math.radians(84), 0, math.radians(33))
scene.camera = cam
sun = bpy.data.lights.new("sun", 'SUN'); sun.energy = 2.2; sun.angle = 0.02
sun_o = bpy.data.objects.new("sun", sun); scene.collection.objects.link(sun_o)
sun_o.rotation_euler = (math.radians(55), math.radians(-10), math.radians(35))
# ground disc
bpy.ops.mesh.primitive_circle_add(vertices=64, radius=6, fill_type='NGON', location=(0, 0, 0))
ground = bpy.context.active_object
gm = bpy.data.materials.new("ground"); gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.36, 0.42, 0.28, 1)
ground.data.materials.append(gm)

os.makedirs(os.path.dirname(out_png), exist_ok=True)
scene.render.filepath = out_png
bpy.ops.render.render(write_still=True)
print("RENDERED", out_png)
bpy.ops.wm.save_as_mainfile(filepath=out_blend, compress=True)
print("SAVED", out_blend)
