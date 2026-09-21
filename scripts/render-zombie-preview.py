"""Render nonpublic fixed-angle QA stills for the zombie walker GLB."""

import os
from pathlib import Path

import bpy
from mathutils import Vector


root = Path(__file__).resolve().parents[1]
source = root / "public/game/zombies/zombie-walker-v1.glb"
out = root / "artifacts/zombie-walker-v1/preview"
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
rig = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 16
scene.render.resolution_x = 640
scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.exposure = -0.7
scene.world = bpy.data.worlds.new("QA_World")
scene.world.color = (0.11, 0.13, 0.16)

floor_mat = bpy.data.materials.new("Road")
floor_mat.use_nodes = True
floor_mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (0.055, 0.060, 0.067, 1)
bpy.ops.mesh.primitive_plane_add(size=6)
floor = bpy.context.object
floor.name = "PreviewRoad"
floor.data.materials.append(floor_mat)

camera_data = bpy.data.cameras.new("QA_Camera")
camera = bpy.data.objects.new("QA_Camera", camera_data)
bpy.context.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = 2.55

for name, location, power in [
    ("Key", (-2.2, -2.8, 3.5), 700),
    ("Fill", (2.6, 1.6, 2.9), 500),
]:
    light_data = bpy.data.lights.new(name, "AREA")
    light_data.energy = power
    light_data.shape = "DISK"
    light_data.size = 3.5
    light = bpy.data.objects.new(name, light_data)
    bpy.context.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (Vector((0, 0, 1)) - light.location).to_track_quat("-Z", "Y").to_euler()

fast = os.getenv("ZDR_PREVIEW_FAST") == "1"
for clip in (("Zombie_Walk",) if fast else ("Zombie_Walk", "Zombie_Walk_LookBack")):
    rig.animation_data.action = bpy.data.actions[clip]
    for frame in ((1,) if fast else (1, 16, 31, 46)):
        scene.frame_set(frame)
        for view, location in [("back", (0, -4.0, 1.65)), ("front", (0, 4.0, 1.65)), ("side", (3.7, -0.9, 1.62))]:
            camera.location = location
            camera.rotation_euler = (Vector((0, 0, 0.99)) - camera.location).to_track_quat("-Z", "Y").to_euler()
            scene.render.filepath = str(out / f"{clip}_{frame:02d}_{view}.png")
            bpy.ops.render.render(write_still=True)

print(f"ZOMBIE_PREVIEW_RENDERED {out}")
