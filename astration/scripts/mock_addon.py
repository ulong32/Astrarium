import os
import mitmproxy.http

TARGET_ASSET_HOST = os.environ.get("TARGET_ASSET_HOST", "assets.example.com")

class MockServerAddon:
    def request(self, flow: mitmproxy.http.HTTPFlow):
        # アセットのモック処理
        if flow.request.pretty_host == TARGET_ASSET_HOST:
            safe_path = flow.request.path.split('?')[0].lstrip('/')
            if not safe_path:
                safe_path = "root_asset"
            local_path = os.path.join(os.path.dirname(__file__), "assets", safe_path)
            
            if os.path.exists(local_path):
                try:
                    with open(local_path, "rb") as f:
                        content = f.read()
                    flow.response = mitmproxy.http.Response.make(
                        200,
                        content,
                        {"Content-Type": "application/octet-stream"}
                    )
                    print(f"[Mock Asset] Served {flow.request.path} ({len(content):,} bytes)")
                except Exception as e:
                    print(f"[Mock Asset Error] Failed to serve {local_path}: {e}")
            return # アセットの場合はここで終了
            
        # 以降は MsgPack (API) のモック処理
        req_path = flow.request.path.split('?')[0].strip('/')
        safe_path = req_path.replace('/', '_')
        if not safe_path:
            safe_path = "root"
            
        # 全APIリクエストについてバイナリ (bin) から直接読み込む
        filepath = os.path.join(os.path.dirname(__file__), "api", "bin", f"{safe_path}.bin")
        if os.path.exists(filepath):
            try:
                with open(filepath, "rb") as f:
                    packed_data = f.read()
                    
                headers = { "Content-Type": "application/vnd.msgpack" }
                if "Environment" not in safe_path:
                    headers["x-client-version"] = "2.31.2"
                    headers["x-assets-version"] = "1.12.0"
                    headers["request-context"] = "appId=cid-v1:5627d42b-c47e-4d15-89e2-65ff8546df47"
                    
                flow.response = mitmproxy.http.Response.make(200, packed_data, headers)
                print(f"[Mock Binary] Served {flow.request.path} ({len(packed_data):,} bytes)")
            except Exception as e:
                print(f"[Mock Binary Error] Failed to serve {filepath}: {e}")

addons = [MockServerAddon()]
