"""Headless Blender: dump the cinematic camera of a character's ultimate jutsu (spl1 container).

The spl1 actions animate `camera01` alongside the body. For each requested action we evaluate the
camera's world transform every frame and write JSON (glTF axes: x, y-up, z) in the same model
space as the exported character GLB, so the engine can place the camera relative to the fighter:

  { "clip": "2nrtspl1_atk", "fps": 30, "lens": 35, "frames": [{ "p": [x,y,z], "q": [x,y,z,w], "fov": deg }, ...] }

usage: blender -b --python export_ultimate_camera.py -- <code> <out.json> <bod1.xfbin> <spl1.xfbin>
"""
import bpy, sys, os, json, math, addon_utils
from mathutils import Matrix, Quaternion

argv = sys.argv[sys.argv.index("--") + 1:]
code, out = argv[0], argv[1]
files = argv[2:]
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("Blender-XFBIN-Importer", default_set=True, persistent=True)
for path in files:
    bpy.ops.import_scene.xfbin(directory=os.path.dirname(path), files=[{"name": os.path.basename(path)}])

arm = bpy.data.objects.get(f'{code}bod1')
cameras = [o for o in bpy.data.objects if o.type == 'CAMERA']
if not cameras or arm is None:
    print('NO CAMERA/ARMATURE', [o.name for o in bpy.data.objects if o.type == 'CAMERA'])
    sys.exit(0)
scene = bpy.context.scene
for ob in bpy.data.objects:
    if ob.name not in scene.collection.all_objects:
        try: scene.collection.objects.link(ob)
        except Exception: pass

# Blender (z-up) -> glTF (y-up): (x, y, z) -> (x, z, -y)
TO_GLTF = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
# Blender cameras look down -Z with +Y up; glTF cameras also look down -Z, so only the axis swap applies.

result = {}
for act in bpy.data.actions:
    if not act.name.startswith(f'{code}spl1_'):
        continue
    # the cinematic camera is either a shared 'camera01' or a per-action '<clip>_cam' object
    cam = None; slot = None
    for c in cameras:
        sl = next((s for s in act.slots if s.name_display == c.name), None)
        if sl is not None:
            cam, slot = c, sl; break
    if slot is None:
        continue
    if cam.animation_data is None:
        cam.animation_data_create()
    cam.animation_data.action = act
    cam.animation_data.action_slot = slot
    aslot = next((s for s in act.slots if s.name_display == arm.name), None)
    if aslot is not None:
        if arm.animation_data is None: arm.animation_data_create()
        arm.animation_data.action = act; arm.animation_data.action_slot = aslot
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    frames = []
    for fr in range(f0, f1 + 1):
        scene.frame_set(fr)
        m = TO_GLTF @ cam.matrix_world
        loc, rot, _ = m.decompose()
        lens = cam.data.lens if cam.type == 'CAMERA' else 35.0
        sensor = cam.data.sensor_width if cam.type == 'CAMERA' else 36.0
        fov = 2 * math.degrees(math.atan(sensor / (2 * lens)))
        frames.append({"p": [round(loc.x, 4), round(loc.y, 4), round(loc.z, 4)], "q": [round(rot.x, 5), round(rot.y, 5), round(rot.z, 5), round(rot.w, 5)], "fov": round(fov, 2)})
    result[act.name] = {"clip": act.name, "fps": scene.render.fps, "frames": frames}
    print('CAMERA', act.name, len(frames), 'frames', 'first', frames[0]['p'], 'fov', frames[0]['fov'])

os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
json.dump(result, open(out, 'w'), separators=(',', ':'))
print('WROTE', out, list(result.keys()))
