import bpy, sys, os, addon_utils
argv = sys.argv[sys.argv.index("--")+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("Blender-XFBIN-Importer", default_set=True, persistent=True)
for path in argv:
    bpy.ops.import_scene.xfbin(directory=os.path.dirname(path), files=[{"name": os.path.basename(path)}])
for act in list(bpy.data.actions)[:6]:
    print("ACTION", act.name, "fcurves", len(act.fcurves), "slots", [s.name_display for s in act.slots] if hasattr(act, "slots") else None)
    if hasattr(act, "layers"):
        for L in act.layers:
            for st in L.strips:
                for cb in st.channelbags:
                    print("   channelbag slot", cb.slot.name_display if hasattr(cb, "slot") else "?", "fcurves", len(cb.fcurves), [fc.data_path for fc in list(cb.fcurves)[:3]])
arm = bpy.data.objects.get("2nrtbod1")
print("ARM anim", arm.animation_data.action.name if arm and arm.animation_data and arm.animation_data.action else None)
if arm and arm.animation_data:
    print("NLA tracks", [(t.name, [s.action.name for s in t.strips]) for t in arm.animation_data.nla_tracks][:5])
