import os
import json
import urllib.request
import urllib.error
import concurrent.futures
import gzip

ASSET_SERVER = os.environ.get("ASSET_SERVER_URL", "https://example.com")
BASE_URL_FORMAT = f"{ASSET_SERVER}/production/static-assets/Resources/Textures/Banners/{{path}}.astc.gz"

def download_file(url, file_path, extract_gz=True):
    out_path = file_path[:-3] if (extract_gz and file_path.endswith('.gz')) else file_path
    if os.path.exists(out_path):
        return True, f"Skipped (already exists): {out_path}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            content = response.read()
            if extract_gz and url.endswith('.gz'):
                try:
                    content = gzip.decompress(content)
                except Exception as e:
                    return False, f"Failed to decompress {url}: {e}"
                    
            with open(out_path, "wb") as f:
                f.write(content)
            return True, f"Success: {url} -> {out_path}"
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False, f"Failed (404 Not Found): {url}"
        return False, f"Failed ({e.code}): {url}"
    except Exception as e:
        return False, f"Error: {url} - {str(e)}"

def sync_static_assets(master_dir="mastermemory_tables_decoded"):
    gacha_master_path = os.path.join(master_dir, "GachaMaster.json")
    banner_master_path = os.path.join(master_dir, "BannerMaster.json")

    download_tasks = []

    # Parse GachaMaster
    if os.path.exists(gacha_master_path):
        print("Parsing GachaMaster...")
        try:
            with open(gacha_master_path, "r", encoding="utf-8") as f:
                gacha_data = json.load(f)
                for item in gacha_data:
                    if isinstance(item, list) and len(item) > 0:
                        gacha_id = item[0]
                        path = f"Gacha/{gacha_id}"
                        url = BASE_URL_FORMAT.format(path=path)
                        local_path = os.path.join("assets", "production", "static-assets", "Resources", "Textures", "Banners", f"{path}.astc.gz")
                        download_tasks.append((url, local_path))
        except Exception as e:
            print(f"Error reading GachaMaster: {e}")
    else:
        print(f"GachaMaster not found: {gacha_master_path}")

    # Parse BannerMaster
    if os.path.exists(banner_master_path):
        print("Parsing BannerMaster...")
        try:
            with open(banner_master_path, "r", encoding="utf-8") as f:
                banner_data = json.load(f)
                for item in banner_data:
                    if isinstance(item, list) and len(item) > 9:
                        banner_path = item[9]
                        if banner_path:
                            url = BASE_URL_FORMAT.format(path=banner_path)
                            local_path = os.path.join("assets", "production", "static-assets", "Resources", "Textures", "Banners", f"{banner_path}.astc.gz")
                            download_tasks.append((url, local_path))
        except Exception as e:
            print(f"Error reading BannerMaster: {e}")
    else:
        print(f"BannerMaster not found: {banner_master_path}")

    if not download_tasks:
        print("No static assets found to download.")
        return False

    # Remove duplicates
    unique_tasks = list(dict.fromkeys(download_tasks))
    
    print(f"Starting download of {len(unique_tasks)} static assets...")
    
    success_count = 0
    fail_count = 0
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(download_file, task[0], task[1]): task for task in unique_tasks}
        for future in concurrent.futures.as_completed(futures):
            task = futures[future]
            try:
                ok, msg = future.result()
                if ok:
                    success_count += 1
                else:
                    fail_count += 1
                print(msg)
            except Exception as e:
                print(f"Exception downloading {task[0]}: {e}")
                fail_count += 1
                
    print(f"Sync complete. Success: {success_count}, Failed: {fail_count}")
    return True
