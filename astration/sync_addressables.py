import os
import json
import urllib.request
import urllib.error
import concurrent.futures

ASSET_SERVER = os.environ.get("ASSET_SERVER_URL", "https://example.com")
BASE_URL_FORMAT = f"{ASSET_SERVER}/production/{{asset_type}}/iOS/{{version}}"
CATALOG_URL_FORMAT = "{base_url}/catalog_{version}.json"

def download_file(url, file_path):
    if os.path.exists(file_path):
        return True, f"Skipped (already exists): {file_path}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "wb") as f:
                f.write(response.read())
            return True, f"Success: {url}"
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False, f"Failed (404 Not Found): {url}"
        return False, f"Failed ({e.code}): {url}"
    except Exception as e:
        return False, f"Error: {url} - {str(e)}"

def resolve_bundle_url(internal_id, prefixes, asset_type, version):
    # Unity Addressables format: index#suffix
    if '#' in internal_id:
        idx_str, suffix = internal_id.split('#', 1)
        try:
            idx = int(idx_str)
            if idx < len(prefixes):
                resolved_path = prefixes[idx] + suffix
            else:
                resolved_path = internal_id
        except ValueError:
            resolved_path = internal_id
    else:
        resolved_path = internal_id
        
    # Replace internal template with actual CDN URL
    # e.g. "http://2d-assets/iOS/" -> f"{ASSET_SERVER}/production/2d-assets/iOS/1.96.0/"
    target_prefix = f"http://{asset_type}/iOS/"
    actual_base = BASE_URL_FORMAT.format(asset_type=asset_type, version=version) + "/"
    
    if resolved_path.startswith(target_prefix):
        final_url = resolved_path.replace(target_prefix, actual_base)
        
        # Determine local path relative to assets/production/...
        # Remove the actual_base part to get the relative path
        rel_path = final_url.replace(actual_base, "")
        local_path = os.path.join("assets", "production", asset_type, "iOS", version, rel_path)
        
        return final_url, local_path
        
    return None, None

def sync_catalog(asset_type="2d-assets", version="1.96.0", limit=None):
    base_url = BASE_URL_FORMAT.format(asset_type=asset_type, version=version)
    catalog_url = CATALOG_URL_FORMAT.format(base_url=base_url, version=version)
    
    catalog_local_path = os.path.join("assets", "production", asset_type, "iOS", version, f"catalog_{version}.json")
    
    print(f"Fetching catalog for {asset_type} ({version})...")
    ok, msg = download_file(catalog_url, catalog_local_path)
    if not ok:
        print(f"Failed to fetch catalog: {msg}")
        return False
        
    print("Catalog fetched successfully. Parsing...")
    
    with open(catalog_local_path, "r", encoding="utf-8") as f:
        catalog = json.load(f)
        
    prefixes = catalog.get("m_InternalIdPrefixes", [])
    internal_ids = catalog.get("m_InternalIds", [])
    
    # Filter for bundle files
    bundle_ids = [uid for uid in internal_ids if ".bundle" in uid]
    print(f"Found {len(bundle_ids)} bundles in catalog.")
    
    if limit:
        print(f"Applying limit: {limit}")
        bundle_ids = bundle_ids[:limit]
        
    download_tasks = []
    for uid in bundle_ids:
        url, local_path = resolve_bundle_url(uid, prefixes, asset_type, version)
        if url and local_path:
            download_tasks.append((url, local_path))
            
    print(f"Starting download of {len(download_tasks)} bundles...")
    
    success_count = 0
    fail_count = 0
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(download_file, task[0], task[1]): task for task in download_tasks}
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
