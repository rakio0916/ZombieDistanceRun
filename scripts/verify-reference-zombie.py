"""Sample exported skinned GLB bounds in Blender's Z-up coordinates."""

import json
from pathlib import Path

import bpy

root = Path(__file__).resolve().parents[1]
source = root / "public/game/zombies/zombie-walker-v1.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
rig = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE")
meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name.startswith("ZombieWalkerBody")]
print("ZOMBIE_WALKER_OBJECTS " + json.dumps([{"name": obj.name, "location": list(obj.location), "scale": list(obj.scale), "vertices": len(obj.data.vertices)} for obj in meshes]))
report = {}
for name in ("Zombie_Walk", "Zombie_Walk_LookBack"):
    action = bpy.data.actions[name]
    rig.animation_data_create()
    rig.animation_data.action = action
    frames = []
    for frame in range(1, 62):
        bpy.context.scene.frame_set(frame)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        points = []
        for obj in meshes:
            evaluated = obj.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            points.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
            evaluated.to_mesh_clear()
        mins = [min(point[axis] for point in points) for axis in range(3)]
        maxs = [max(point[axis] for point in points) for axis in range(3)]
        frames.append({"frame": frame, "min": mins, "max": maxs})
    report[name] = {
        "width_m": max(frame["max"][0] - frame["min"][0] for frame in frames),
        "depth_m": max(frame["max"][1] - frame["min"][1] for frame in frames),
        "height_m": max(frame["max"][2] - frame["min"][2] for frame in frames),
        "lowest_point_m": min(frame["min"][2] for frame in frames),
        "frames": len(frames),
    }
print("ZOMBIE_WALKER_BOUNDS " + json.dumps(report))
assert all(data["width_m"] <= 0.94 and data["depth_m"] <= 0.90 for data in report.values())
(root / "assets/zombie-walker-v1.qa.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
