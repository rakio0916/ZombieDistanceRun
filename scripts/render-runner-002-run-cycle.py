"""Render fixed-camera samples of a runner GLB's complete Run_03 cycle."""

import hashlib
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


source, output_dir, expected_sha = sys.argv[sys.argv.index("--") + 1:sys.argv.index("--") + 4]
source = Path(source).resolve()
output_dir = Path(output_dir).resolve()
if hashlib.sha256(source.read_bytes()).hexdigest() != expected_sha.lower():
    raise RuntimeError("Unexpected source SHA-256")
if output_dir.exists():
    raise RuntimeError("Refusing to overwrite QA images")
output_dir.mkdir(parents=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
action = bpy.data.actions.get("Run_03")
if action is None:
    raise RuntimeError("Run_03 is missing")
armature.animation_data_create()
armature.animation_data.action = action
scene = bpy.context.scene
scene.frame_set(0)
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 8
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.world = scene.world or bpy.data.worlds.new("QA_World")
scene.world.color = (0.035, 0.035, 0.035)

depsgraph = bpy.context.evaluated_depsgraph_get()
points = []
for obj in scene.objects:
    if obj.type != "MESH" or not any(mod.type == "ARMATURE" for mod in obj.modifiers):
        continue
    evaluated = obj.evaluated_get(depsgraph)
    points.extend(evaluated.matrix_world @ vertex.co for vertex in evaluated.data.vertices)
low = Vector(tuple(min(point[i] for point in points) for i in range(3)))
high = Vector(tuple(max(point[i] for point in points) for i in range(3)))
center = (low + high) * 0.5
height = high.z - low.z

bpy.ops.object.camera_add()
camera = bpy.context.object
camera.data.lens = 55
scene.camera = camera
distance = height / (2.0 * math.tan(camera.data.angle_y * 0.5)) * 1.35
camera.location = center + Vector((0, distance, height * 0.04))
camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
for location, energy, size in [
    (center + Vector((-2.5, -3.5, 3.5)), 1200, 4.0),
    (center + Vector((3.0, 1.0, 2.0)), 800, 3.0),
    (center + Vector((0.0, 3.5, 4.0)), 1000, 3.0),
]:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.rotation_euler = (center - location).to_track_quat("-Z", "Y").to_euler()

for frame in (0, 5, 10, 15, 20):
    scene.frame_set(frame)
    scene.render.filepath = str(output_dir / f"run_f{frame:02d}_back.png")
    bpy.ops.render.render(write_still=True)
print(f"RUN_CYCLE_PREVIEW {output_dir}")
