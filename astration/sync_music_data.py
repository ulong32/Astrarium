import os
import sys
import json
import shutil
import urllib.request
import urllib.error
import concurrent.futures
import subprocess
import argparse
import brotli
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

# Keys identified from binary reverse engineering (Loaded from environment variables)
KEY_CONFIG = os.environ.get("KEY_CONFIG", "").encode("utf-8")
KEY_NOTATION = os.environ.get("KEY_NOTATION", "").encode("utf-8")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_NOTATIONS_DIR = os.path.join(BASE_DIR, "assets", "production", "Notations")
OUTPUT_MUSIC_ASSETS_DIR = os.path.join(BASE_DIR, "MusicAssets")
CHARTS_DIR = os.path.join(BASE_DIR, "charts")

ASSET_SERVER = os.environ.get("ASSET_SERVER_URL", "https://example.com")
BASE_URL_NOTATIONS = f"{ASSET_SERVER}/production/Notations/{{music_id}}/{{filename}}"
BASE_URL_MUSIC_BUNDLE = f"{ASSET_SERVER}/production/cri-assets/iOS/{{version}}/music_assets_music/{{music_id}}.bundle"
BASE_URL_ACB_BUNDLE = f"{ASSET_SERVER}/production/cri-assets/iOS/{{version}}/cridata_remote_assets_criaddressables/music_{{music_id}}.acb.bundle"

def decrypt_aes_cbc(ciphertext, key, iv):
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    return decryptor.update(ciphertext) + decryptor.finalize()

def unpad_pkcs7(data):
    if not data:
        return data
    pad_len = data[-1]
    if 1 <= pad_len <= 16 and data[-pad_len:] == bytes([pad_len]) * pad_len:
        return data[:-pad_len]
    return data

def decrypt_data(data, is_config):
    if len(data) < 16:
        raise ValueError("File size is too small (less than 16 bytes IV)")
    iv = data[:16]
    ciphertext = data[16:]
    key = KEY_CONFIG if is_config else KEY_NOTATION
    decrypted = decrypt_aes_cbc(ciphertext, key, iv)
    unpadded = unpad_pkcs7(decrypted)
    
    if is_config:
        content = unpadded.decode('utf-8')
    else:
        decompressed = brotli.decompress(unpadded)
        content = decompressed.decode('utf-8')
    return content

def download_file(url, file_path):
    if os.path.exists(file_path):
        return True, None # Skipped (already exists)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as response:
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "wb") as f:
                f.write(response.read())
            return True, f"Success: {url}"
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False, None # Ignore 404
        return False, f"Failed ({e.code}): {url}"
    except Exception as e:
        return False, f"Error: {url} - {str(e)}"

def is_fully_extracted(music_id):
    chart_dir = os.path.join(CHARTS_DIR, str(music_id))
    # 完全に展開済みとみなす条件（music_config.csvが存在すること）
    config_exists = os.path.exists(os.path.join(chart_dir, "music_config.csv"))
    return config_exists

def download_for_music_id(music_id, version, alt_notations=None):
    if is_fully_extracted(music_id):
        return False, f"[{music_id}] Skipped (Already fully extracted)"

    logs = []
    has_any_success = False

    # Download Notations
    nota_dir = os.path.join(OUTPUT_NOTATIONS_DIR, str(music_id))
    for diff in range(1, 6):
        fname = f"{diff}.enc"
        ok, msg = download_file(BASE_URL_NOTATIONS.format(music_id=music_id, filename=fname), os.path.join(nota_dir, fname))
        if ok: has_any_success = True
        if msg: logs.append(msg)
    
    ok, msg = download_file(BASE_URL_NOTATIONS.format(music_id=music_id, filename="music_config.enc"), os.path.join(nota_dir, "music_config.enc"))
    if ok: has_any_success = True
    if msg: logs.append(msg)

    if alt_notations:
        config_downloaded = False
        for diff, nid_str in alt_notations:
            alt_nota_dir = os.path.join(OUTPUT_NOTATIONS_DIR, nid_str)
            fname = f"{diff}.enc"
            ok, msg = download_file(BASE_URL_NOTATIONS.format(music_id=nid_str, filename=fname), os.path.join(alt_nota_dir, fname))
            if ok: has_any_success = True
            if msg: logs.append(msg)
            
            if not config_downloaded:
                ok, msg = download_file(BASE_URL_NOTATIONS.format(music_id=nid_str, filename="music_config.enc"), os.path.join(alt_nota_dir, "music_config.enc"))
                if ok: has_any_success = True
                if msg: logs.append(msg)
                config_downloaded = True

    # Download Music Assets
    music_dir = os.path.join(OUTPUT_MUSIC_ASSETS_DIR, str(music_id))
    ok, msg = download_file(BASE_URL_MUSIC_BUNDLE.format(music_id=music_id, version=version), os.path.join(music_dir, f"{music_id}.bundle"))
    if ok: has_any_success = True
    if msg: logs.append(msg)

    ok, msg = download_file(BASE_URL_ACB_BUNDLE.format(music_id=music_id, version=version), os.path.join(music_dir, f"music_{music_id}.acb.bundle"))
    if ok: has_any_success = True
    if msg: logs.append(msg)

    log_str = "\n".join(logs)
    if log_str:
        return has_any_success, f"[{music_id}] Downloads:\n{log_str}"
    else:
        # ダウンロード済みもしくは404でメッセージがない場合
        # アセットが存在するかどうかで処理対象か判定
        if os.path.exists(nota_dir) or os.path.exists(music_dir):
            return True, f"[{music_id}] Checked (Files already present locally)"
        return False, None

def extract_for_music_id(music_id, alt_notations=None):
    music_id = str(music_id)
    if is_fully_extracted(music_id):
        return None

    out_dir = os.path.join(CHARTS_DIR, music_id)
    os.makedirs(out_dir, exist_ok=True)
    logs = [f"=== Processing ID: {music_id} ==="]
    has_extracted_something = False

    # 1. Decrypt notations
    files_to_decrypt = ["1", "2", "3", "4", "5", "music_config"]
    for file_name in files_to_decrypt:
        enc_path = os.path.join(OUTPUT_NOTATIONS_DIR, music_id, f"{file_name}.enc")
        csv_path = os.path.join(out_dir, f"{file_name}.csv")
        if os.path.exists(enc_path) and not os.path.exists(csv_path):
            try:
                with open(enc_path, 'rb') as f:
                    enc_data = f.read()
                is_config = (file_name == "music_config")
                content = decrypt_data(enc_data, is_config)
                with open(csv_path, "w", encoding="utf-8") as f:
                    f.write(content)
                logs.append(f"   [OK] Decrypted {file_name}.csv")
                has_extracted_something = True
            except Exception as e:
                logs.append(f"   [Error] Decrypt {file_name}.enc: {e}")

    # Process alt notations
    if alt_notations:
        config_extracted = False
        for diff, nid_str in alt_notations:
            enc_path = os.path.join(OUTPUT_NOTATIONS_DIR, nid_str, f"{diff}.enc")
            csv_path = os.path.join(out_dir, f"{diff}.csv")
            if os.path.exists(enc_path) and not os.path.exists(csv_path):
                try:
                    with open(enc_path, 'rb') as f:
                        enc_data = f.read()
                    content = decrypt_data(enc_data, False)
                    with open(csv_path, "w", encoding="utf-8") as f:
                        f.write(content)
                    logs.append(f"   [OK] Decrypted {diff}.csv (from alt ID {nid_str})")
                    has_extracted_something = True
                except Exception as e:
                    logs.append(f"   [Error] Decrypt {diff}.enc (alt): {e}")

            if not config_extracted:
                enc_config_path = os.path.join(OUTPUT_NOTATIONS_DIR, nid_str, "music_config.enc")
                csv_config_path = os.path.join(out_dir, "music_config.csv")
                if os.path.exists(enc_config_path) and not os.path.exists(csv_config_path):
                    try:
                        with open(enc_config_path, 'rb') as f:
                            enc_data = f.read()
                        content = decrypt_data(enc_data, True)
                        with open(csv_config_path, "w", encoding="utf-8") as f:
                            f.write(content)
                        logs.append(f"   [OK] Decrypted music_config.csv (from alt ID {nid_str})")
                        has_extracted_something = True
                    except Exception as e:
                        logs.append(f"   [Error] Decrypt music_config.enc (alt): {e}")
                config_extracted = True

    # 2. Extract audio
    acb_bundle_path = os.path.join(OUTPUT_MUSIC_ASSETS_DIR, music_id, f"music_{music_id}.acb.bundle")
    # vgmstream wav extraction was removed per specification.
    
    if has_extracted_something:
        return "\n".join(logs)
    return None

def run_sync(master_file, version="1.96.0"):
    music_ids = []
    another_notations = {}
    
    if master_file:
        print(f"Reading master data from: {master_file}")
        try:
            with open(master_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, list) and len(item) > 0:
                            music_ids.append(item[0])
                        elif isinstance(item, dict) and "Id" in item:
                            music_ids.append(item["Id"])
            print(f"Found {len(music_ids)} music IDs in master data.")
            
            # 補助的な譜面データ(AnotherNotationMaster)も読み込む
            another_master_file = os.path.join(os.path.dirname(master_file), "AnotherNotationMaster.json")
            if os.path.exists(another_master_file):
                with open(another_master_file, 'r', encoding='utf-8') as f:
                    another_data = json.load(f)
                    if isinstance(another_data, list):
                        for item in another_data:
                            if isinstance(item, list) and len(item) > 4:
                                mid = item[1]
                                nid_str = item[3]
                                diff = item[4]
                                if mid not in another_notations:
                                    another_notations[mid] = []
                                another_notations[mid].append((diff, nid_str))
                print(f"Loaded alternate notations for {len(another_notations)} music IDs.")
        except Exception as e:
            print(f"Error reading master data: {e}")
            return False
    else:
        print("No master data provided. Using default ranges (1-500, 10000-10200).")
        music_ids.extend(range(1, 501))
        music_ids.extend(range(10000, 10201))

    print(f"Starting download phase for {len(music_ids)} IDs...")
    valid_ids_to_extract = set()

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(download_for_music_id, mid, version, another_notations.get(mid)): mid for mid in music_ids}
        for future in concurrent.futures.as_completed(futures):
            mid = futures[future]
            try:
                should_extract, msg = future.result()
                if should_extract:
                    valid_ids_to_extract.add(mid)
                if msg:
                    print(msg)
            except Exception as e:
                print(f"Exception during download for Music ID {mid}: {e}")

    if not valid_ids_to_extract:
        print("No new data downloaded or needs extraction.")
        return True

    print(f"\nDownload phase completed. Starting extraction phase for {len(valid_ids_to_extract)} IDs...")

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(extract_for_music_id, mid, another_notations.get(mid)): mid for mid in valid_ids_to_extract}
        for future in concurrent.futures.as_completed(futures):
            mid = futures[future]
            try:
                res = future.result()
                if res:
                    print(res)
            except Exception as e:
                print(f"Exception during extraction for Music ID {mid}: {e}")

    print("All tasks completed.")
    return True

def main():
    parser = argparse.ArgumentParser(description="Download and extract music/chart assets.")
    parser.add_argument("--master", type=str, help="Path to MusicMaster.json")
    parser.add_argument("--version", type=str, default="1.96.0", help="App version for URL (default: 1.96.0)")
    args = parser.parse_args()
    
    success = run_sync(args.master, args.version)
    if not success:
        sys.exit(1)

if __name__ == "__main__":
    main()
