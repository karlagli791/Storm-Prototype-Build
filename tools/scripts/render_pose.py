import bpy, sys, os, addon_utils, math
argv = sys.argv[sys.argv.index("--")+1:]
code, outdir = argv[0], argv[1]; files = argv[2:]
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("Blender-XFBIN-Importer", default_set=True, persistent=True)
for path in files:
    bpy.ops.import_scene.xfbin(directory=os.path.dirname(path), files=[{"name": os.path.basename(path)}])
arm = bpy.data.objects[f"{code}bod1"]
# remove LOD / bod2 clutter for clarity
for o in list(bpy.data.objects):
    if o.type == 'MESH' and (o.parent != arm or '_lod' in o.name.lower()):
        bpy.data.objects.remove(o, do_unlink=True)
scene = bpy.context.scene
# make sure everything is visible to the view layer
for o in bpy.data.objects:
    if o.name not in scene.collection.all_objects:
        scene.collection.objects.link(o)
for lc in bpy.context.view_layer.layer_collection.children:
    lc.exclude = False
def bbox(tag):
    dg = bpy.context.evaluated_depsgraph_get()
    body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.endswith(' body') and o.parent == arm)
    ev = body.evaluated_get(dg)
    from mathutils import Vector
    pts = [ev.matrix_world @ v.co for v in ev.data.vertices]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    print(f"BBOX {tag}: size x={mx.x-mn.x:.2f} y={mx.y-mn.y:.2f} z={mx.z-mn.z:.2f} min={tuple(round(v,2) for v in mn)} max={tuple(round(v,2) for v in mx)}")
cam_data = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cam_data); scene.collection.objects.link(cam)
cam.location = (0, -4.5, 1.0); cam.rotation_euler = (math.radians(85), 0, 0); scene.camera = cam
light_data = bpy.data.lights.new("sun", 'SUN'); light_data.energy = 3; light = bpy.data.objects.new("sun", light_data); scene.collection.objects.link(light); light.rotation_euler = (math.radians(50), 0, math.radians(30))
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = 480; scene.render.resolution_y = 480; scene.render.resolution_percentage = 100
scene.display.shading.light = 'FLAT'; scene.display.shading.color_type = 'MATERIAL'
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new("w"); scene.world.color = (0.6, 0.6, 0.7)
for o in bpy.data.objects:
    o.hide_render = False; o.hide_viewport = False; o.hide_set(False)
for c in bpy.data.collections:
    c.hide_render = False; c.hide_viewport = False
print("RENDERABLE", [(o.name, o.type, o.visible_get()) for o in scene.objects if o.type in ('MESH','ARMATURE')][:6], "cam", scene.camera.name)
os.makedirs(outdir, exist_ok=True)
def shot(tag):
    bbox(tag)
    scene.render.filepath = os.path.join(outdir, f"{code}_{tag}.png")
    bpy.ops.render.render(write_still=True)
    print("WROTE", scene.render.filepath)
if arm.animation_data: arm.animation_data.action = None
shot("rest")
for name in [f"{code}nut0", f"{code}run1", f"{code}cma00"]:
    act = bpy.data.actions.get(name)
    if not act: continue
    if arm.animation_data is None: arm.animation_data_create()
    arm.animation_data.action = act
    for s in act.slots:
        if s.name_display == arm.name: arm.animation_data.action_slot = s
    scene.frame_set(8)
    shot(name + "_f8")
