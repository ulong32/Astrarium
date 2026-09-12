import os
import sys
import argparse
import urllib.request
import msgpack
import lz4.block
import subprocess

from parse_mastermemory import parse_mastermemory
from sync_music_data import run_sync
from sync_addressables import sync_catalog as run_sync_catalog
from sync_static_assets import sync_static_assets as run_sync_static_assets

def update_master(bin_file):
    print(f"Updating master data from {bin_file}...")
    try:
        with open(bin_file, 'rb') as f:
            unpacker = msgpack.Unpacker(f, raw=False)
            objects = list(unpacker)
        
        # Depending on how it was intercepted, it could be the first or second object
        lz4_arr = None
        for obj in objects:
            if isinstance(obj, list) and len(obj) >= 2 and isinstance(obj[0], msgpack.ExtType) and obj[0].code == 98:
                lz4_arr = obj
                break
            # Or if it's nested
            elif isinstance(obj, list):
                for item in obj:
                    if isinstance(item, list) and len(item) >= 2 and isinstance(item[0], msgpack.ExtType) and item[0].code == 98:
                        lz4_arr = item
                        break
        
        if not lz4_arr:
            print("Could not find LZ4 block array in the file.")
            return None

        ext = lz4_arr[0]
        comp_data = lz4_arr[1]

        ext_u = msgpack.Unpacker()
        ext_u.feed(ext.data)
        size = next(ext_u)

        dec = lz4.block.decompress(comp_data, uncompressed_size=size)
        decoded_obj = msgpack.unpackb(dec, raw=False)
        
        # Expected structure: [file_path, query_string, id1, id2]
        if isinstance(decoded_obj, list) and len(decoded_obj) >= 2:
            file_path = decoded_obj[0]
            query_string = decoded_obj[1]
            asset_server = os.environ.get("ASSET_SERVER_URL", "https://example.com")
            base_url = f"{asset_server}/master-data/production/"
            full_url = f"{base_url}{file_path}{query_string}"
            
            filename = os.path.basename(file_path)
            print(f"Found URL: {full_url}")
            print(f"Downloading to {filename}...")
            
            urllib.request.urlretrieve(full_url, filename)
            print(f"Successfully downloaded {filename}")
            return filename
        else:
            print("Unexpected decoded object structure.")
            return None

    except Exception as e:
        print(f"Error updating master data: {e}")
        return None

def parse_master(db_file):
    print(f"Parsing master memory DB: {db_file}...")
    if not os.path.exists(db_file):
        print(f"File not found: {db_file}")
        return False
    
    try:
        parse_mastermemory(db_file)
        print("Parsing completed.")
        return True
    except Exception as e:
        print(f"Error parsing master data: {e}")
        return False

def sync_assets(master_json="mastermemory_tables_decoded/MusicMaster.json", version="1.96.0"):
    print(f"Syncing assets using {master_json}...")
    if not os.path.exists(master_json):
        print(f"Master JSON not found: {master_json}")
        return False
    
    success = run_sync(master_json, version)
    if success:
        print("Asset sync completed successfully.")
    else:
        print("Asset sync failed.")
    return success

def run_all(bin_file, version="1.96.0"):
    print(f"Starting full pipeline for {bin_file}...")
    db_file = update_master(bin_file)
    if not db_file:
        print("Pipeline aborted at update-master step.")
        sys.exit(1)
        
    if not parse_master(db_file):
        print("Pipeline aborted at parse-master step.")
        sys.exit(1)
        
    master_json = "mastermemory_tables_decoded/MusicMaster.json"
    if not sync_assets(master_json, version):
        print("Pipeline aborted at sync-assets step.")
        sys.exit(1)
        
    print("Full pipeline executed successfully!")

def extract_bundles(input_dir, output_dir="extracted_assets", audio_format="acb", resolve_cri=False):
    print(f"Extracting bundles from {input_dir}...")
    script_path = os.path.join(os.path.dirname(__file__), "scripts", "extract_bundles.py")
    cmd = [sys.executable, script_path, input_dir, "--output_dir", output_dir, "--audio-format", audio_format]
    if resolve_cri:
        cmd.append("--resolve-cri")
    try:
        subprocess.run(cmd, check=True)
        print("Bundle extraction completed.")
    except Exception as e:
        print(f"Error extracting bundles: {e}")

def extract_astc(input_dir, output_dir="extracted_assets", overwrite=False):
    print(f"Extracting raw ASTC files from {input_dir}...")
    script_path = os.path.join(os.path.dirname(__file__), "scripts", "extract_astc.py")
    cmd = [sys.executable, script_path, input_dir, "--output_dir", output_dir]
    if overwrite:
        cmd.append("--overwrite")
    try:
        subprocess.run(cmd, check=True)
        print("ASTC extraction completed.")
    except Exception as e:
        print(f"Error extracting ASTC files: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Astrarium Data Pipeline")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    parser_update = subparsers.add_parser("update-master", help="Extract URL from intercepted bin and download DB")
    parser_update.add_argument("bin_file", type=str, help="Path to intercepted bin file (e.g., api_data_master.bin)")
    
    parser_parse = subparsers.add_parser("parse-master", help="Parse mastermemory DB into JSON tables")
    parser_parse.add_argument("db_file", type=str, help="Path to mastermemory DB file")
    
    parser_sync = subparsers.add_parser("sync-assets", help="Download and extract music assets")
    parser_sync.add_argument("--master", type=str, default="mastermemory_tables_decoded/MusicMaster.json", help="Path to MusicMaster.json")
    parser_sync.add_argument("--version", type=str, default="1.96.0", help="Asset version")
    
    parser_runall = subparsers.add_parser("run-all", help="Run the full pipeline (update -> parse -> sync)")
    parser_runall.add_argument("bin_file", type=str, help="Path to intercepted bin file")
    parser_runall.add_argument("--version", type=str, default="1.96.0", help="Asset version")
    
    parser_catalog = subparsers.add_parser("sync-catalog", help="Download Unity Addressables bundles from catalog")
    parser_catalog.add_argument("asset_type", type=str, help="Asset type (e.g., 2d-assets, 3d-assets)")
    parser_catalog.add_argument("--version", type=str, default="1.96.0", help="Asset version")
    parser_catalog.add_argument("--limit", type=int, default=None, help="Limit number of bundles to download")

    parser_static = subparsers.add_parser("sync-static-assets", help="Download static assets (Gacha/Banners) from master data")
    parser_static.add_argument("--master-dir", type=str, default="mastermemory_tables_decoded", help="Directory containing decoded master data JSON files")

    parser_extract = subparsers.add_parser("extract-bundles", help="Extract assets from Unity bundles")
    parser_extract.add_argument("input_dir", type=str, help="Directory containing .bundle files")
    parser_extract.add_argument("--output_dir", type=str, default="extracted_assets", help="Base directory for extracted files")
    parser_extract.add_argument("--audio-format", type=str, choices=["acb", "wav"], default="acb", help="Format to extract CRI audio into")
    parser_extract.add_argument("--resolve-cri", action="store_true", help="Resolve CRI Addressable references and place audio files next to their JSON metadata")

    parser_extract_astc = subparsers.add_parser("extract-astc", help="Extract raw .astc files to PNG")
    parser_extract_astc.add_argument("input_dir", type=str, help="Directory containing .astc files")
    parser_extract_astc.add_argument("--output_dir", type=str, default="extracted_assets", help="Base directory for extracted files")
    parser_extract_astc.add_argument("--overwrite", action="store_true", help="Overwrite existing PNG files")

    args = parser.parse_args()
    
    if args.command == "update-master":
        update_master(args.bin_file)
    elif args.command == "parse-master":
        parse_master(args.db_file)
    elif args.command == "sync-assets":
        sync_assets(args.master, args.version)
    elif args.command == "run-all":
        run_all(args.bin_file, args.version)
    elif args.command == "sync-catalog":
        run_sync_catalog(args.asset_type, args.version, args.limit)
    elif args.command == "sync-static-assets":
        run_sync_static_assets(args.master_dir)
    elif args.command == "extract-bundles":
        extract_bundles(args.input_dir, args.output_dir, getattr(args, "audio_format", "acb"), getattr(args, "resolve_cri", False))
    elif args.command == "extract-astc":
        extract_astc(args.input_dir, args.output_dir, args.overwrite)
    else:
        parser.print_help()
