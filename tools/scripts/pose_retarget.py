"""Blender helper: pose an armature with another character's CC2 clip by renaming the bone prefix
in the action's F-curve data paths (CC2 skeletons share the body hierarchy: "<code>00t0 spine"...).

    from pose_retarget import apply_pose
    apply_pose(arm, '9ind00t0', ['raw/s4/2sskbod1c.xfbin', ...], clip_suffix='nut0', frame=8)
"""
import bpy, os, re


def _fcurves(action):
    out = []
    if getattr(action, 'layers', None):
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    out.extend(bag.fcurves)
    out.extend(getattr(action, 'fcurves', []))
    return out


def apply_pose(arm, prefix, anim_files, clip_suffix='nut0', frame=8):
    """Import the anim containers, find the first action ending in `clip_suffix`, retarget it to `arm`."""
    import addon_utils
    addon_utils.enable("Blender-XFBIN-Importer", default_set=True, persistent=True)
    before = set(bpy.data.objects)
    for path in anim_files:
        bpy.ops.import_scene.xfbin(directory=os.path.dirname(path), files=[{"name": os.path.basename(path)}])
    src = next((a for a in bpy.data.actions if a.name.endswith(clip_suffix)), None)
    if not src:
        print('pose_retarget: no clip ending in', clip_suffix); return False
    src_prefix = src.name[:4] + '00t0'
    new = bpy.data.actions.new(f'{prefix[:4]}{clip_suffix}_retarget')
    slot = new.slots.new(id_type='OBJECT', name=arm.name)
    bag = new.layers.new('L').strips.new(type='KEYFRAME').channelbags.new(slot)
    n = 0
    for fc in _fcurves(src):
        dp = fc.data_path
        if 'pose.bones' not in dp: continue
        m = re.match(r'pose\.bones\["(.+?)"\]\.(\w+)', dp)
        if not m: continue
        bone = m.group(1).replace(src_prefix, prefix)
        if bone not in arm.pose.bones: continue
        if m.group(2) == 'location' and bone.endswith(('trall', '00t0')): continue
        ndp = f'pose.bones["{bone}"].{m.group(2)}'
        nf = bag.fcurves.new(ndp, index=fc.array_index)
        nf.keyframe_points.add(len(fc.keyframe_points))
        nf.keyframe_points.foreach_set('co', [x for kp in fc.keyframe_points for x in kp.co])
        nf.update(); n += 1
    # remove the imported donor objects
    for o in set(bpy.data.objects) - before:
        bpy.data.objects.remove(o, do_unlink=True)
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    arm.animation_data_clear(); arm.animation_data_create()
    arm.animation_data.action = new; arm.animation_data.action_slot = slot
    bpy.context.scene.frame_set(frame)
    print('pose_retarget:', src.name, '->', prefix, n, 'curves')
    return n > 0
