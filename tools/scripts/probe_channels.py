import bpy, sys, os, addon_utils, collections
argv = sys.argv[sys.argv.index("--")+1:]
code = argv[0]; files = argv[1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("Blender-XFBIN-Importer", default_set=True, persistent=True)
for path in files:
    bpy.ops.import_scene.xfbin(directory=os.path.dirname(path), files=[{"name": os.path.basename(path)}])
arm = bpy.data.objects[f"{code}bod1"]
modes = collections.Counter(pb.rotation_mode for pb in arm.pose.bones)
print("POSE BONE ROTATION MODES", dict(modes))
act = bpy.data.actions.get(f"{code}run1")
for L in act.layers:
    for st in L.strips:
        for cb in st.channelbags:
            paths = collections.Counter(fc.data_path.split('.')[-1] for fc in cb.fcurves)
            print("CHANNELBAG", cb.slot.name_display, dict(paths))
            eul = [fc.data_path for fc in cb.fcurves if fc.data_path.endswith('rotation_euler')][:3]
            quat = [fc.data_path for fc in cb.fcurves if fc.data_path.endswith('rotation_quaternion')][:3]
            print("  euler e.g.", eul); print("  quat e.g.", quat)
            # which bones get euler keys but are in QUATERNION mode?
            bad = set()
            for fc in cb.fcurves:
                if 'pose.bones' in fc.data_path:
                    bn = fc.data_path.split('"')[1]
                    pb = arm.pose.bones.get(bn)
                    if pb and fc.data_path.endswith('rotation_euler') and pb.rotation_mode == 'QUATERNION': bad.add(bn)
                    if pb and fc.data_path.endswith('rotation_quaternion') and pb.rotation_mode != 'QUATERNION': bad.add(bn + '(quat-key,mode=' + pb.rotation_mode + ')')
            print("  MISMATCHED BONES", len(bad), list(bad)[:8])
