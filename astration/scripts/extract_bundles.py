import os
import sys
import argparse
import json
import shutil
import subprocess
import UnityPy


def find_vgmstream():
    """Locate vgmstream-cli executable from environment variable, PATH, or local tools dir."""
    env_path = os.environ.get("VGMSTREAM_PATH")
    if env_path and os.path.exists(env_path):
        return env_path
    for name in ["vgmstream-cli", "vgmstream-cli.exe", "vgmstream"]:
        w = shutil.which(name)
        if w:
            return w
    local_tool = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools", "vgmstream", "vgmstream-cli.exe")
    if os.path.exists(local_tool):
        return local_tool
    return None


def stringify_path_ids(node):
    """Recursively convert every `m_PathID` integer in a typetree dict/list into a
    string before it gets json.dump'd.

    Unity path IDs are signed 64-bit integers. Python (and this script's own
    json.dump call) preserve them exactly - the precision loss only happens later,
    in whatever JS-based tool eventually consumes this JSON (JSON.parse/res.json()
    round-trip big integers through IEEE754 doubles and silently corrupt anything
    over ~9e15, which two different real IDs can collide into). Stringifying at the
    source means every downstream consumer gets a safe value for free instead of
    needing to know about this gotcha.
    """
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "m_PathID" and isinstance(v, int):
                node[k] = str(v)
            else:
                stringify_path_ids(v)
    elif isinstance(node, list):
        for item in node:
            stringify_path_ids(item)
    return node


def sanitize_name(name):
    return "".join(c for c in name if c.isalnum() or c in (' ', '.', '_', '-')).rstrip()


def record_path_id(manifest, obj, rel_path, asset_type):
    """Track path_id -> output file location so cross-bundle references (e.g. a
    Material's `_MainTex` pointing at a Texture2D that lives in a completely
    different, shared bundle) can be resolved later. Without this, once a texture is
    saved under its human-readable m_Name, the pathID that every other asset uses to
    refer to it is gone for good.
    """
    if manifest is not None:
        manifest[str(obj.path_id)] = {"file": rel_path, "type": asset_type}


def process_object(obj, output_dir, skip_existing, manifest=None, bundle_rel=""):
    extracted = False
    try:
        if obj.type.name in ["Texture2D", "Sprite"]:
            data = obj.read()
            name = getattr(data, "name", "") or str(obj.path_id)
            # Prevent invalid filenames
            name = sanitize_name(name)
            out_path = os.path.join(output_dir, f"{name}.png")
            rel_out = os.path.join(bundle_rel, f"{name}.png") if bundle_rel else f"{name}.png"

            if skip_existing and os.path.exists(out_path):
                record_path_id(manifest, obj, rel_out, obj.type.name)
                return False

            # Extract image
            img = data.image
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            img.save(out_path)
            extracted = True
            record_path_id(manifest, obj, rel_out, obj.type.name)

            # Sidecar metadata: wrap mode / filter mode / sRGB / texture format are not
            # part of the PNG at all, but matter for faithfully reproducing tiling
            # noise/distortion textures (REPEAT vs CLAMP) and correctly interpreting
            # channel data (e.g. whether the source was authored in linear space).
            if obj.type.name == "Texture2D":
                try:
                    tex_tree = obj.read_typetree()
                    ts = tex_tree.get("m_TextureSettings", {}) or {}
                    meta = {
                        "m_PathID": str(obj.path_id),
                        "m_TextureFormat": tex_tree.get("m_TextureFormat"),
                        "m_sRGBTexture": tex_tree.get("m_sRGBTexture"),
                        "m_ColorSpace": tex_tree.get("m_ColorSpace"),
                        "m_WrapU": ts.get("m_WrapU", ts.get("m_WrapMode")),
                        "m_WrapV": ts.get("m_WrapV", ts.get("m_WrapMode")),
                        "m_FilterMode": ts.get("m_FilterMode"),
                    }
                    meta_path = os.path.join(output_dir, f"{name}.meta.json")
                    with open(meta_path, "w", encoding="utf-8") as f:
                        json.dump(meta, f, indent=2, ensure_ascii=False)
                except Exception:
                    # Metadata is a nice-to-have; never let it block the PNG extraction.
                    pass
            
        elif obj.type.name == "TextAsset":
            data = obj.read()
            name = getattr(data, "name", "") or str(obj.path_id)
            name = sanitize_name(name)
            out_path = os.path.join(output_dir, f"{name}.txt")
            rel_out = os.path.join(bundle_rel, f"{name}.txt") if bundle_rel else f"{name}.txt"

            if skip_existing and os.path.exists(out_path):
                record_path_id(manifest, obj, rel_out, obj.type.name)
                return False

            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "wb") as f:
                f.write(data.script)
            extracted = True
            record_path_id(manifest, obj, rel_out, obj.type.name)
            
        elif obj.type.name == "AudioClip":
            data = obj.read()
            name = getattr(data, "name", "") or str(obj.path_id)
            name = "".join(c for c in name if c.isalnum() or c in (' ', '.', '_', '-')).rstrip()
            
            samples = data.samples
            for sample_name, sample_data in samples.items():
                sample_name = "".join(c for c in sample_name if c.isalnum() or c in (' ', '.', '_', '-')).rstrip()
                out_path = os.path.join(output_dir, f"{sample_name}")
                if not out_path.endswith(('.wav', '.mp3', '.ogg', '.m4a')):
                    out_path += ".wav"
                    
                if skip_existing and os.path.exists(out_path):
                    continue
                    
                os.makedirs(os.path.dirname(out_path), exist_ok=True)
                with open(out_path, "wb") as f:
                    f.write(sample_data)
                extracted = True

        elif obj.type.name in ["MonoBehaviour", "ParticleSystem", "ParticleSystemRenderer", "Material", "Transform", "RectTransform"]:
            try:
                tree = obj.read_typetree()
                if tree:
                    # Some types might not have a direct name attribute on read(), so fallback safely
                    read_obj = obj.read()
                    name = getattr(read_obj, "name", "") or tree.get("m_Name", "") or str(obj.path_id)
                    name = sanitize_name(name)
                    out_path = os.path.join(output_dir, f"{name}.json")
                    rel_out = os.path.join(bundle_rel, f"{name}.json") if bundle_rel else f"{name}.json"

                    if skip_existing and os.path.exists(out_path):
                        record_path_id(manifest, obj, rel_out, obj.type.name)
                        return False

                    os.makedirs(os.path.dirname(out_path), exist_ok=True)
                    # Stringify every m_PathID in the tree before dumping - see
                    # stringify_path_ids() docstring for why this matters downstream.
                    stringify_path_ids(tree)
                    with open(out_path, "w", encoding="utf-8") as f:
                        json.dump(tree, f, indent=2, ensure_ascii=False)
                    extracted = True
                    record_path_id(manifest, obj, rel_out, obj.type.name)
            except Exception:
                pass

    except Exception as e:
        # Some assets might be encrypted or unsupported, just ignore
        pass
        
    return extracted

def extract_bundle(bundle_path, output_dir, skip_existing, manifest=None, bundle_rel=""):
    extracted_count = 0
    try:
        env = UnityPy.load(bundle_path)
        for obj in env.objects:
            if process_object(obj, output_dir, skip_existing, manifest=manifest, bundle_rel=bundle_rel):
                extracted_count += 1
    except Exception as e:
        print(f"Failed to load bundle {bundle_path}: {e}")
    return extracted_count

def main():
    parser = argparse.ArgumentParser(description="Extract Unity bundles using UnityPy.")
    parser.add_argument("input_dir", type=str, help="Directory containing .bundle files")
    parser.add_argument("--output_dir", type=str, default="extracted_assets", help="Base directory for extracted files")
    parser.add_argument("--audio-format", type=str, choices=["acb", "wav"], default="acb", help="Format to extract CRI audio into")
    parser.add_argument("--resolve-cri", action="store_true", help="Resolve CRI Addressable references and place audio files next to their JSON metadata")
    parser.add_argument("--skip-existing", action="store_true", default=True, help="Skip extraction if the output file already exists (enabled by default)")
    parser.add_argument("--overwrite", action="store_false", dest="skip_existing", help="Overwrite existing files (disables --skip-existing)")
    
    args = parser.parse_args()
    
    if not os.path.isdir(args.input_dir):
        print(f"Input directory does not exist: {args.input_dir}")
        sys.exit(1)
        
    input_dir_abs = os.path.abspath(args.input_dir)
    output_dir_abs = os.path.abspath(args.output_dir)
    
    total_bundles = 0
    total_extracted = 0

    # Global path_id -> output file manifest, accumulated across every bundle in this
    # run. A per-card export's Material can reference a Texture2D/Sprite that lives in
    # a completely different, shared bundle (e.g. this game's holo/kira/noise texture
    # bundles) - once that texture is written out under its human-readable m_Name, the
    # pathID is the ONLY thing left that still connects the two. Without this manifest,
    # such cross-bundle references can never be resolved again after extraction.
    manifest = {}

    bundle_files = []
    for root, _, files in os.walk(input_dir_abs):
        for file in files:
            if file.endswith((".bundle", ".astc.gz", ".astc")):
                bundle_path = os.path.join(root, file)
                bundle_files.append((root, file, bundle_path))
                
    # Pass 1: non-CRI files
    raw_cri_files = []
    for root, file, bundle_path in bundle_files:
        is_raw_cri = False
        with open(bundle_path, "rb") as f:
            header = f.read(4)
            if header in (b"@UTF", b"CPK "):
                is_raw_cri = True
                
        # Clean up the base name for the target directory
        base_name = file
        if base_name.endswith('.bundle'): base_name = base_name[:-7]
        if base_name.endswith('.acb'): base_name = base_name[:-4]
        if base_name.endswith('.cpk'): base_name = base_name[:-4]
        if base_name.endswith('.astc.gz'): base_name = base_name[:-8]
        if base_name.endswith('.astc'): base_name = base_name[:-5]
        
        if is_raw_cri:
            raw_cri_files.append((root, file, bundle_path, header, base_name))
        else:
            rel_path = os.path.relpath(root, input_dir_abs)
            if rel_path == ".":
                target_dir = os.path.join(output_dir_abs, base_name)
            else:
                target_dir = os.path.join(output_dir_abs, rel_path, base_name)
                
            bundle_rel = os.path.relpath(target_dir, output_dir_abs)
            print(f"Extracting {file} -> {bundle_rel}...")
            count = extract_bundle(bundle_path, target_dir, args.skip_existing, manifest=manifest, bundle_rel=bundle_rel)
            if count > 0:
                total_bundles += 1
                total_extracted += count
                
    # Build mapping if resolve-cri
    cri_mapping = {}
    if args.resolve_cri:
        print("\nBuilding CRI reference mapping from extracted JSON metadata...")
        for root, _, files in os.walk(output_dir_abs):
            for file in files:
                if file.endswith(".json"):
                    json_path = os.path.join(root, file)
                    try:
                        with open(json_path, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            refs = data.get("references", {}).get("RefIds", [])
                            for ref in refs:
                                if ref.get("type", {}).get("class") == "CriAddressableAssetImpl":
                                    file_name = ref.get("data", {}).get("fileName")
                                    if file_name:
                                        cri_mapping[file_name] = root
                    except Exception:
                        pass
        print(f"Found {len(cri_mapping)} CRI Addressable references.")
        
    # Pass 2: CRI files
    import shutil
    for root, file, bundle_path, header, base_name in raw_cri_files:
        ext = ".acb" if header == b"@UTF" else ".cpk"
        out_name = base_name + ext
        
        # Default target_dir
        rel_path = os.path.relpath(root, input_dir_abs)
        if rel_path == ".":
            target_dir = os.path.join(output_dir_abs, base_name)
        else:
            target_dir = os.path.join(output_dir_abs, rel_path, base_name)
            
        # Resolve target_dir if mapping exists
        if args.resolve_cri and out_name in cri_mapping:
            target_dir = cri_mapping[out_name]
            print(f"Extracting RAW CRI file {file} -> [RESOLVED] {os.path.relpath(target_dir, output_dir_abs)}...")
        else:
            print(f"Extracting RAW CRI file {file} -> {os.path.relpath(target_dir, output_dir_abs)}...")
            
        os.makedirs(target_dir, exist_ok=True)
        target_file = os.path.join(target_dir, out_name)
        
        if args.skip_existing and os.path.exists(target_file):
            print(f"  -> Skipped existing file {out_name}")
            continue
            
        shutil.copy2(bundle_path, target_file)
        
        if args.audio_format == "wav" and header == b"@UTF":
            vgmstream_exe = find_vgmstream()
            if not vgmstream_exe:
                print(f"  -> Warning: vgmstream-cli not found in PATH, VGMSTREAM_PATH, or tools/. Kept {out_name} as ACB.")
            else:
                try:
                    subprocess.run([vgmstream_exe, "-S", "0", "-o", os.path.join(target_dir, "?s_?n.wav"), target_file], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    # If successful, delete the acb file
                    if os.path.exists(target_file):
                        os.remove(target_file)
                except Exception as e:
                    print(f"  -> Failed to convert {out_name} to wav: {e}")
                
        total_bundles += 1
        total_extracted += 1

    # Write the global path_id -> file manifest once, after every bundle (including
    # shared/common ones like a "charactercardshadertexture" directory) has been
    # processed. A downstream linking step (e.g. this game's per-card viewer backend)
    # can consult this to resolve a Material's `_MainTex`/`_Holo_Tex_RGB`-style pathID
    # reference to a file, even when that file lives in an entirely different bundle
    # than the one being viewed. This script only records the mapping - it
    # deliberately doesn't try to merge/copy files across per-card output folders,
    # since it processes bundles independently and has no notion of "which card wants
    # which shared texture".
    manifest_path = os.path.join(output_dir_abs, "_path_id_manifest.json")
    try:
        existing_manifest = {}
        if args.skip_existing and os.path.exists(manifest_path):
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if content:
                        existing_manifest = json.loads(content)
            except (json.JSONDecodeError, ValueError):
                print(f"Warning: corrupt manifest at {manifest_path}, rebuilding")
        existing_manifest.update(manifest)
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(existing_manifest, f, indent=2, ensure_ascii=False)
        print(f"Wrote path_id manifest ({len(existing_manifest)} entries) -> {manifest_path}")
    except Exception as e:
        print(f"Warning: failed to write path_id manifest: {e}")

    print(f"\nExtraction complete! Processed {total_bundles} bundles, extracted {total_extracted} assets.")
    print(f"Output saved to: {output_dir_abs}")

if __name__ == "__main__":
    main()
