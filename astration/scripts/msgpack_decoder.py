import os
import mitmproxy.http

TARGET_ASSET_HOST = os.environ.get("TARGET_ASSET_HOST", "assets.example.com")

class MsgpackDecoder:
    def response(self, flow: mitmproxy.http.HTTPFlow):
        if flow.response and flow.response.content:
            # アセットの保存処理
            if flow.request.pretty_host == TARGET_ASSET_HOST:
                try:
                    safe_path = flow.request.path.split('?')[0].lstrip('/')
                    if not safe_path:
                        safe_path = "root_asset"
                    
                    local_path = os.path.join(os.path.dirname(__file__), "assets", safe_path)
                    os.makedirs(os.path.dirname(local_path), exist_ok=True)
                    
                    with open(local_path, "wb") as f:
                        f.write(flow.response.content)
                    print(f"[Asset Saved] {flow.request.path} ({len(flow.response.content):,} bytes)")
                except Exception as e:
                    print(f"[Asset Save Error] {flow.request.path}: {e}")
                return
                
            # APIのバイナリ保存処理
            is_msgpack = "msgpack" in flow.response.headers.get("Content-Type", "").lower()
            if is_msgpack:
                try:
                    req_path = flow.request.path.split('?')[0].strip('/')
                    safe_path = req_path.replace('/', '_')
                    if not safe_path:
                        safe_path = "root"
                        
                    base_dir = os.path.dirname(__file__)
                    local_path = os.path.join(base_dir, "api", "bin", f"{safe_path}.bin")
                    os.makedirs(os.path.dirname(local_path), exist_ok=True)
                    
                    with open(local_path, "wb") as f:
                        f.write(flow.response.content)
                        
                    print(f"\n[Success] Saved Binary: {flow.request.path}")
                    print(f"  -> Saved to {local_path} ({len(flow.response.content):,} bytes)\n")
                    
                except Exception as e:
                    print(f"[Error] {flow.request.path}: {e}")

addons = [MsgpackDecoder()]
