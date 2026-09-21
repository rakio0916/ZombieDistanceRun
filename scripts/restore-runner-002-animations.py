"""Restore the four non-Jump runner_002 v4 clips into the v5 Web GLB.

The v5 mesh, skin, materials and Jump clip are retained byte-for-byte. The
source GLBs are explicit CLI inputs so this script never fetches private art.
"""

import argparse
import copy
import hashlib
import json
import struct
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


SOURCE_SHA = "8683bb039947c5a041e2b3948f45afdb351c5a23bbb71a5c214e71cf217d391c"
BASE_SHA = "313c310e2476071f1523de88f0e0e34e6e0dba359d4f45395f80ca44082d9020"
REQUIRED_CLIPS = {"Web_Idle", "Run_03", "Web_Jump", "Web_Stumble", "Web_Caught"}
RESTORED_CLIPS = REQUIRED_CLIPS - {"Web_Jump"}
COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_glb(path, expected_sha):
    raw = path.read_bytes()
    if digest(raw) != expected_sha:
        raise ValueError(f"Unexpected source SHA-256: {path}")
    if len(raw) < 28 or struct.unpack_from("<4sII", raw) != (b"glTF", 2, len(raw)):
        raise ValueError(f"Invalid GLB header: {path}")
    offset = 12
    chunks = []
    while offset < len(raw):
        length, kind = struct.unpack_from("<I4s", raw, offset)
        offset += 8
        chunks.append((kind, raw[offset:offset + length]))
        offset += length
    if offset != len(raw) or len(chunks) != 2 or [part[0] for part in chunks] != [b"JSON", b"BIN\x00"]:
        raise ValueError(f"Unexpected GLB chunks: {path}")
    document = json.loads(chunks[0][1])
    if len(document["buffers"]) != 1 or document["buffers"][0]["byteLength"] > len(chunks[1][1]):
        raise ValueError(f"Invalid GLB buffer: {path}")
    return document, chunks[1][1]


def accessor_values(document, binary, index):
    accessor = document["accessors"][index]
    if accessor.get("componentType") != 5126 or "sparse" in accessor:
        raise ValueError("Animation accessor must be dense FLOAT32")
    view = document["bufferViews"][accessor["bufferView"]]
    if view["buffer"] != 0:
        raise ValueError("Only one buffer is supported")
    dimensions = COMPONENTS[accessor["type"]]
    width = 4 * dimensions
    stride = view.get("byteStride", width)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    limit = view.get("byteOffset", 0) + view["byteLength"]
    values = []
    for item in range(accessor["count"]):
        position = start + item * stride
        if position + width > limit:
            raise ValueError("Animation accessor extends beyond its bufferView")
        values.append(struct.unpack_from("<" + "f" * dimensions, binary, position))
    return values


def animations_by_name(document):
    found = {item["name"]: item for item in document["animations"]}
    if len(found) != len(document["animations"]) or set(found) != REQUIRED_CLIPS:
        raise ValueError("Missing or duplicate animation clips")
    return found


def node_names(document):
    names = [node.get("name") for node in document["nodes"]]
    if None in names or len(set(names)) != len(names):
        raise ValueError("Nodes must have unique names")
    return names


def assert_compatible(source, source_bin, base, base_bin):
    source_names = node_names(source)
    base_names = node_names(base)
    if set(source_names) != set(base_names):
        raise ValueError("Bone/node names differ")
    source_nodes = {node["name"]: node for node in source["nodes"]}
    base_nodes = {node["name"]: node for node in base["nodes"]}
    for name in source_names:
        old, new = source_nodes[name], base_nodes[name]
        for key in ("mesh", "skin", "camera"):
            if old.get(key) != new.get(key):
                raise ValueError(f"Node binding differs: {name}.{key}")
        for key in ("children",):
            old_children = [source_names[index] for index in old.get(key, [])]
            new_children = [base_names[index] for index in new.get(key, [])]
            if old_children != new_children:
                raise ValueError(f"Node hierarchy differs: {name}")
        for key, default in (("translation", [0, 0, 0]), ("rotation", [0, 0, 0, 1]), ("scale", [1, 1, 1])):
            before = old.get(key, default)
            after = new.get(key, default)
            if len(before) != len(after) or max(abs(a - b) for a, b in zip(before, after)) > 1e-5:
                raise ValueError(f"Node bind transform differs: {name}.{key}")
    if len(source["skins"]) != len(base["skins"]):
        raise ValueError("Skin count differs")
    for old_skin, new_skin in zip(source["skins"], base["skins"]):
        if [source_names[i] for i in old_skin["joints"]] != [base_names[i] for i in new_skin["joints"]]:
            raise ValueError("Skin joint order differs")
        old_matrices = accessor_values(source, source_bin, old_skin["inverseBindMatrices"])
        new_matrices = accessor_values(base, base_bin, new_skin["inverseBindMatrices"])
        if len(old_matrices) != len(new_matrices) or any(
            abs(a - b) > 1e-5
            for old, new in zip(old_matrices, new_matrices)
            for a, b in zip(old, new)
        ):
            raise ValueError("Inverse bind matrices differ")
    animations_by_name(source)
    animations_by_name(base)
    return {name: base_names.index(name) for name in source_names}


def movement_summary(document, binary, animation):
    varying_rotations = []
    for channel in animation["channels"]:
        if channel["target"]["path"] != "rotation":
            continue
        sampler = animation["samplers"][channel["sampler"]]
        keys = accessor_values(document, binary, sampler["output"])
        if len(keys) > 1 and any(
            max(abs(a - b) for a, b in zip(keys[0], key)) > 1e-5 for key in keys[1:]
        ):
            varying_rotations.append(document["nodes"][channel["target"]["node"]]["name"])
    return sorted(varying_rotations)


def animation_signature(document, binary, animation):
    signature = []
    for channel in animation["channels"]:
        sampler = animation["samplers"][channel["sampler"]]
        signature.append({
            "node": document["nodes"][channel["target"]["node"]]["name"],
            "path": channel["target"]["path"],
            "interpolation": sampler.get("interpolation", "LINEAR"),
            "times": accessor_values(document, binary, sampler["input"]),
            "values": accessor_values(document, binary, sampler["output"]),
        })
    return sorted(signature, key=lambda item: (item["node"], item["path"]))


def restore(source, source_bin, base, base_bin, node_map):
    result = copy.deepcopy(base)
    output_binary = bytearray(base_bin[:base["buffers"][0]["byteLength"]])
    view_map = {}
    accessor_map = {}

    def copy_accessor(index):
        if index in accessor_map:
            return accessor_map[index]
        accessor = copy.deepcopy(source["accessors"][index])
        if "sparse" in accessor or "bufferView" not in accessor:
            raise ValueError("Sparse or viewless animation accessor")
        old_view_index = accessor["bufferView"]
        if old_view_index not in view_map:
            old_view = source["bufferViews"][old_view_index]
            if old_view["buffer"] != 0:
                raise ValueError("Unexpected animation buffer")
            while len(output_binary) % 4:
                output_binary.append(0)
            start = old_view.get("byteOffset", 0)
            end = start + old_view["byteLength"]
            if end > len(source_bin):
                raise ValueError("Animation bufferView extends beyond BIN")
            new_view = copy.deepcopy(old_view)
            new_view["byteOffset"] = len(output_binary)
            new_view["buffer"] = 0
            view_map[old_view_index] = len(result["bufferViews"])
            result["bufferViews"].append(new_view)
            output_binary.extend(source_bin[start:end])
        accessor["bufferView"] = view_map[old_view_index]
        accessor_map[index] = len(result["accessors"])
        result["accessors"].append(accessor)
        return accessor_map[index]

    for animation in result["animations"]:
        if animation["name"] not in RESTORED_CLIPS:
            continue
        original = animations_by_name(source)[animation["name"]]
        replacement = copy.deepcopy(original)
        for sampler in replacement["samplers"]:
            sampler["input"] = copy_accessor(sampler["input"])
            sampler["output"] = copy_accessor(sampler["output"])
        for channel in replacement["channels"]:
            old_index = channel["target"]["node"]
            channel["target"]["node"] = node_map[source["nodes"][old_index]["name"]]
        animation.clear()
        animation.update(replacement)
    result["buffers"][0]["byteLength"] = len(output_binary)
    return result, bytes(output_binary)


def write_glb(document, binary):
    json_bytes = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * (-len(json_bytes) % 4)
    binary += b"\x00" * (-len(binary) % 4)
    length = 12 + 8 + len(json_bytes) + 8 + len(binary)
    return (struct.pack("<4sII", b"glTF", 2, length)
            + struct.pack("<I4s", len(json_bytes), b"JSON") + json_bytes
            + struct.pack("<I4s", len(binary), b"BIN\x00") + binary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--v4", type=Path, required=True)
    parser.add_argument("--v5", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists() or args.report.exists():
        raise ValueError("Refusing to overwrite a versioned artifact or report")
    source, source_bin = read_glb(args.v4, SOURCE_SHA)
    base, base_bin = read_glb(args.v5, BASE_SHA)
    node_map = assert_compatible(source, source_bin, base, base_bin)
    result, result_bin = restore(source, source_bin, base, base_bin, node_map)
    output = write_glb(result, result_bin)
    if result_bin[:base["buffers"][0]["byteLength"]] != base_bin[:base["buffers"][0]["byteLength"]]:
        raise ValueError("The v5 binary payload changed")
    source_animations = animations_by_name(source)
    base_animations = animations_by_name(base)
    result_animations = animations_by_name(result)
    for name in RESTORED_CLIPS:
        if animation_signature(result, result_bin, result_animations[name]) != animation_signature(source, source_bin, source_animations[name]):
            raise ValueError(f"Restored motion differs: {name}")
    if result_animations["Web_Jump"] != base_animations["Web_Jump"]:
        raise ValueError("v5 Jump clip changed")
    run_bones = movement_summary(result, result_bin, result_animations["Run_03"])
    if len(run_bones) < 8 or not {"LeftUpperLeg", "RightUpperLeg", "LeftUpperArm", "RightUpperArm"}.issubset(run_bones):
        raise ValueError("Restored Run does not move the legs and arms")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(output)
    report = {
        "schema_version": "1.0.0",
        "source_v4_sha256": SOURCE_SHA,
        "base_v5_sha256": BASE_SHA,
        "target_v6_sha256": digest(output),
        "target_v6_size_bytes": len(output),
        "restored_clips": sorted(RESTORED_CLIPS),
        "preserved_clip": "Web_Jump",
        "run_varying_rotation_bones": run_bones,
        "v5_binary_payload_preserved": True,
        "node_and_skin_tolerance": 1e-5,
        "generated_at_jst": datetime.now(ZoneInfo("Asia/Tokyo")).isoformat(),
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
