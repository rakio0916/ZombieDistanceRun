"""Build an original, game-sized zombie walker inspired by the approved design.

Run with Blender: blender -b --python scripts/build-reference-zombie.py
The supplied photograph is never loaded or embedded in the resulting GLB.
"""

import json
import math
import random
import hashlib
from datetime import datetime, timezone, timedelta
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/game/zombies/zombie-walker-v1.glb"
REPORT = ROOT / "assets/zombie-walker-v1.build.json"
random.seed(20260921)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30


def material(name, roughness, texture=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = 0
    vertex = nodes.new("ShaderNodeVertexColor")
    vertex.layer_name = "color"
    if texture:
        image = nodes.new("ShaderNodeTexImage")
        image.image = bpy.data.images.load(str(texture), check_existing=True)
        image.interpolation = "Linear"
        multiply = nodes.new("ShaderNodeMixRGB")
        multiply.blend_type = "MULTIPLY"
        multiply.inputs[0].default_value = 1
        mat.node_tree.links.new(image.outputs["Color"], multiply.inputs[1])
        mat.node_tree.links.new(vertex.outputs["Color"], multiply.inputs[2])
        mat.node_tree.links.new(multiply.outputs["Color"], shader.inputs["Base Color"])
    else:
        mat.node_tree.links.new(vertex.outputs["Color"], shader.inputs["Base Color"])
    mat.node_tree.links.new(shader.outputs["BSDF"], out.inputs["Surface"])
    return mat


TEXTURES = ROOT / "assets/zombie-walker-v1-textures"
fabric = material("WeatheredFabricAndSkin", 0.96, TEXTURES / "skin.png")
hood_fabric = material("RustHoodFabric", 0.97, TEXTURES / "hood.png")
shorts_fabric = material("TornShortsFabric", 0.98, TEXTURES / "shorts.png")
shoe_leather = material("ScuffedLeather", 0.87, TEXTURES / "shoes.png")
eyes = material("CloudedEyes", 0.59)
dark_material = material("DryDarkDetails", 0.98)
parts = []


def finish(mesh, name, bone, color, noise=0.08, mat=None):
    mesh.name = name
    mesh.data.name = name
    mesh.data.materials.clear()
    if mat is None:
        if name in ("TornRustVest", "FallenHood"):
            mat = hood_fabric
        elif name.startswith("TornShorts"):
            mat = shorts_fabric
        elif name.startswith("WornShoe"):
            mat = shoe_leather
        elif name.startswith(("DarkMouth", "EyeSocket")):
            mat = dark_material
        else:
            mat = fabric
    mesh.data.materials.append(mat)
    attr = mesh.data.color_attributes.new(name="color", type="BYTE_COLOR", domain="CORNER")
    for poly in mesh.data.polygons:
        for loop_index in poly.loop_indices:
            co = mesh.data.vertices[mesh.data.loops[loop_index].vertex_index].co
            # Deterministic color variation along fabric/skin; no reference pixels are copied.
            grain = (math.sin(co.x * 93 + co.y * 67 + co.z * 137) * 0.5
                     + math.sin(co.x * 211 - co.y * 77 + co.z * 31) * 0.28)
            stained = max(-1, min(1, grain)) * noise
            attr.data[loop_index].color = tuple(max(0.01, min(1, c * (1 + stained))) for c in color) + (1,)
    uv = mesh.data.uv_layers.active or mesh.data.uv_layers.new(name="UVMap")
    for loop in mesh.data.loops:
        co = mesh.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((co.x * 2.15 + co.y * 0.53) % 1, (co.z * 1.65 + co.y * 0.19) % 1)
    mesh.vertex_groups.new(name=bone).add([v.index for v in mesh.data.vertices], 1, "REPLACE")
    parts.append(mesh)
    return mesh


def ellipsoid(name, bone, center, scale, color, segments=24, rings=14, noise=0.055, mat=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=center)
    obj = bpy.context.object
    for vertex in obj.data.vertices:
        p = vertex.co
        irregular = 1 + 0.023 * math.sin(17 * p.x + 29 * p.y + 11 * p.z)
        p.x *= scale[0] * irregular
        p.y *= scale[1] * irregular
        p.z *= scale[2] * irregular
    return finish(obj, name, bone, color, noise, mat)


def segment(name, bone, a, b, radii, color, sides=14, levels=5, noise=0.085):
    start, end = Vector(a), Vector(b)
    direction = (end - start).normalized()
    tangent = direction.cross(Vector((0, 1, 0)))
    if tangent.length < 0.05:
        tangent = direction.cross(Vector((1, 0, 0)))
    tangent.normalize()
    bitangent = direction.cross(tangent).normalized()
    verts = []
    for level in range(levels):
        t = level / (levels - 1)
        center = start.lerp(end, t)
        radius = radii[0] * (1 - t) + radii[1] * t
        for index in range(sides):
            angle = index * 2 * math.pi / sides
            wobble = 1 + 0.055 * math.sin(level * 5.1 + index * 3.7)
            point = center + (tangent * math.cos(angle) + bitangent * math.sin(angle)) * radius * wobble
            verts.append(tuple(point))
    faces = []
    faces.append(tuple(reversed(range(sides))))
    for level in range(levels - 1):
        for index in range(sides):
            nxt = (index + 1) % sides
            faces.append((level * sides + index, level * sides + nxt,
                          (level + 1) * sides + nxt, (level + 1) * sides + index))
    faces.append(tuple((levels - 1) * sides + index for index in range(sides)))
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    return finish(obj, name, bone, color, noise)


def ragged_vest():
    # A real opening exposes the separate gray torso beneath the rust fabric.
    sides, levels = 32, 12
    verts, faces = [], []
    for level in range(levels):
        t = level / (levels - 1)
        z = 0.95 + t * 0.62
        if level == 0:
            z += 0.06 * math.sin(3.1 * level + 0.88)
        for index in range(sides):
            angle = 2 * math.pi * index / sides
            x = 0.29 * math.sin(angle) * (0.94 + 0.06 * t)
            y = -0.196 * math.cos(angle) * (0.96 + 0.04 * t)
            x += 0.015 * math.sin(index * 3.9 + level * 2.1)
            y += 0.012 * math.sin(index * 2.7 - level * 1.2)
            verts.append((x, y, z))
    for level in range(levels - 1):
        for index in range(sides):
            nxt = (index + 1) % sides
            back = index < 7 or index > 25
            # Torn areas on the back: remove polygons, not just paint dark spots.
            upper_tear = back and 4 <= level <= 6 and 1 <= index <= 5
            lower_tear = back and 1 <= level <= 3 and 27 <= index <= 31
            hem = level == 0 and (index + index // 3) % 5 == 0
            if upper_tear or lower_tear or hem:
                continue
            faces.append((level * sides + index, level * sides + nxt,
                          (level + 1) * sides + nxt, (level + 1) * sides + index))
    data = bpy.data.meshes.new("TornRustVestMesh")
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new("TornRustVest", data)
    bpy.context.collection.objects.link(obj)
    finish(obj, "TornRustVest", "Chest", (0.36, 0.18, 0.16), 0.17)


def bone(edit, name, head, tail, parent=None):
    item = edit.new(name)
    item.head, item.tail = head, tail
    item.parent = parent
    return item


def build_rig():
    data = bpy.data.armatures.new("ZombieWalkerRig")
    obj = bpy.data.objects.new("ZombieWalkerRig", data)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    edit = data.edit_bones
    root = bone(edit, "Root", (0, 0, 0), (0, 0, 0.18))
    hips = bone(edit, "Hips", (0, 0, 0.95), (0, 0, 1.12), root)
    spine = bone(edit, "Spine", (0, 0, 1.10), (0, 0, 1.33), hips)
    chest = bone(edit, "Chest", (0, 0, 1.32), (0, 0, 1.53), spine)
    neck = bone(edit, "Neck", (0, 0, 1.52), (0, 0, 1.66), chest)
    bone(edit, "Head", (0, 0, 1.66), (0, 0, 1.91), neck)
    for side, sign in (("L", -1), ("R", 1)):
        upper_arm = bone(edit, f"UpperArm{side}", (sign * 0.28, 0, 1.47), (sign * 0.33, 0.035, 1.11), chest)
        lower_arm = bone(edit, f"LowerArm{side}", (sign * 0.33, 0.035, 1.11), (sign * 0.37, -0.04, 0.80), upper_arm)
        bone(edit, f"Hand{side}", (sign * 0.37, -0.04, 0.80), (sign * 0.37, -0.04, 0.68), lower_arm)
        upper_leg = bone(edit, f"UpperLeg{side}", (sign * 0.155, 0, 0.92), (sign * 0.16, 0.01, 0.50), hips)
        lower_leg = bone(edit, f"LowerLeg{side}", (sign * 0.16, 0.01, 0.50), (sign * 0.16, -0.02, 0.135), upper_leg)
        bone(edit, f"Foot{side}", (sign * 0.16, -0.02, 0.135), (sign * 0.16, 0.16, 0.07), lower_leg)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return obj


rig = build_rig()
skin = (0.43, 0.40, 0.35)
skin_shadow = (0.31, 0.30, 0.26)
dark = (0.10, 0.092, 0.085)
trousers = (0.17, 0.16, 0.145)
shoes = (0.25, 0.22, 0.19)

ellipsoid("LeanTorsoUnderVest", "Chest", (0, 0, 1.30), (0.25, 0.16, 0.35), skin, 28, 18)
ragged_vest()
ellipsoid("FallenHood", "Chest", (0, -0.14, 1.55), (0.28, 0.12, 0.14), (0.32, 0.15, 0.14), 24, 12, 0.13)
ellipsoid("BaldSkull", "Head", (0, 0.015, 1.78), (0.21, 0.175, 0.23), skin, 32, 20, 0.12)
ellipsoid("SunkenJaw", "Head", (0, 0.132, 1.625), (0.15, 0.075, 0.08), skin_shadow, 18, 10)
ellipsoid("DarkMouth", "Head", (0.012, 0.202, 1.66), (0.072, 0.008, 0.044), dark, 16, 8)
ellipsoid("BrokenNose", "Head", (0, 0.187, 1.75), (0.045, 0.062, 0.067), skin_shadow, 12, 8)
for side, sign in (("L", -1), ("R", 1)):
    ellipsoid(f"BatteredEar{side}", "Head", (sign * 0.211, 0.0, 1.754), (0.035, 0.047, 0.061), skin_shadow, 12, 8)
    ellipsoid(f"EyeSocket{side}", "Head", (sign * 0.078, 0.159, 1.81), (0.068, 0.025, 0.050), dark, 16, 8)
    ellipsoid(f"CloudedEye{side}", "Head", (sign * 0.078, 0.179, 1.807), (0.027, 0.025, 0.026),
              (0.43, 0.42, 0.38), 14, 8, 0.012, eyes)
    ellipsoid(f"CheekDecay{side}", "Head", (sign * 0.143, 0.108, 1.695), (0.040, 0.019, 0.048), skin_shadow, 12, 8)
    segment(f"ThinUpperArm{side}", f"UpperArm{side}", (sign * 0.28, 0, 1.47),
            (sign * 0.33, 0.035, 1.11), (0.092, 0.072), skin)
    segment(f"StainedForearm{side}", f"LowerArm{side}", (sign * 0.33, 0.035, 1.11),
            (sign * 0.37, -0.04, 0.80), (0.075, 0.053), skin_shadow)
    ellipsoid(f"LooseHand{side}", f"Hand{side}", (sign * 0.37, -0.04, 0.74),
              (0.074, 0.048, 0.12), skin, 14, 8)
    for digit in range(3):
        offset = (digit - 1) * 0.042
        segment(f"CrookedFinger{side}{digit}", f"Hand{side}",
                (sign * 0.37 + offset, -0.035, 0.68),
                (sign * 0.37 + offset * 1.2, -0.002 + digit * 0.007, 0.59 + digit * 0.008),
                (0.018, 0.010), skin_shadow, 8, 3)
    segment(f"TornShorts{side}", f"UpperLeg{side}", (sign * 0.155, 0, 0.92),
            (sign * 0.16, 0.01, 0.51 + (0.04 if side == "L" else 0)), (0.16, 0.125), trousers, 18, 7)
    segment(f"ExposedShin{side}", f"LowerLeg{side}", (sign * 0.16, 0.01, 0.50),
            (sign * 0.16, -0.02, 0.135), (0.093, 0.078), skin, 18, 7)
    ellipsoid(f"WornShoe{side}", f"Foot{side}", (sign * 0.16, 0.087, 0.086),
              (0.111, 0.205, 0.077), shoes, 20, 12, 0.11)

# Join the original pieces so each material is one draw primitive while preserving vertex weights.
bpy.ops.object.select_all(action="DESELECT")
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
body = bpy.context.object
body.name = "ZombieWalkerBody"
skin_modifier = body.modifiers.new("ZombieWalkerSkin", "ARMATURE")
skin_modifier.object = rig
body.parent = rig


def action(name, look_back=False):
    item = bpy.data.actions.new(name)
    item.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = item
    for frame in range(1, 62, 3):
        phase = (frame - 1) * math.tau / 60
        for pose in rig.pose.bones:
            pose.rotation_mode = "XYZ"
            pose.rotation_euler = (0, 0, 0)
            pose.location = (0, 0, 0)
        for side, phase_shift in (("L", 0), ("R", math.pi)):
            stride = math.sin(phase + phase_shift)
            lift = max(0, math.cos(phase + phase_shift))
            rig.pose.bones[f"UpperLeg{side}"].rotation_euler.x = 0.245 * stride
            rig.pose.bones[f"LowerLeg{side}"].rotation_euler.x = -0.27 * lift
            rig.pose.bones[f"Foot{side}"].rotation_euler.x = 0.16 * stride - 0.13 * lift
            rig.pose.bones[f"UpperArm{side}"].rotation_euler.x = -0.09 * stride
            rig.pose.bones[f"LowerArm{side}"].rotation_euler.x = -0.055 + 0.055 * stride
        rig.pose.bones["Hips"].location.z = -0.013 + 0.013 * math.cos(phase * 2)
        rig.pose.bones["Spine"].rotation_euler = (0.065, 0.015 * math.sin(phase), 0.024 * math.sin(phase))
        rig.pose.bones["Chest"].rotation_euler = (0.09, 0, 0.020 * math.sin(phase))
        if look_back:
            # Glance over the right shoulder, then return before the loop seam.
            strength = max(0, math.sin(phase)) ** 2
            rig.pose.bones["Chest"].rotation_euler.z += 0.08 * strength
            rig.pose.bones["Neck"].rotation_euler.z = 0.16 * strength
            rig.pose.bones["Head"].rotation_euler.z = 0.92 * strength
        for pose in rig.pose.bones:
            pose.keyframe_insert(data_path="rotation_euler", frame=frame, group=pose.name)
            pose.keyframe_insert(data_path="location", frame=frame, group=pose.name)
    bpy.context.scene.frame_set(1)
    return item


walk = action("Zombie_Walk")
glance = action("Zombie_Walk_LookBack", look_back=True)
rig.animation_data.action = walk
bpy.context.scene.frame_set(1)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
REPORT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
body.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT), export_format="GLB", use_selection=True,
    export_materials="EXPORT", export_vertex_color="MATERIAL",
    export_normals=True, export_texcoords=True, export_skins=True, export_animations=True,
    export_animation_mode="ACTIONS", export_force_sampling=True, export_yup=True,
)
report = {
    "model": OUTPUT.name,
    "source": "original Blender geometry and generated material textures; no input photograph pixels",
    "triangles": sum(len(poly.vertices) - 2 for poly in body.data.polygons),
    "mesh_objects": 1,
    "bones": len(rig.data.bones),
    "materials": [item.name for item in body.data.materials],
    "clips": [walk.name, glance.name],
    "size_bytes": OUTPUT.stat().st_size,
    "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest().upper(),
    "generated_at_jst": datetime.now(timezone(timedelta(hours=9))).isoformat(),
    "textures": {
        path.name: {"size_bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest().upper()}
        for path in sorted(TEXTURES.glob("*.png"))
    },
}
REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
print("ZOMBIE_WALKER_BUILT " + json.dumps(report))
