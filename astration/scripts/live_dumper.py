import os
import datetime
import json
import msgpack
import lz4.block
from mitmproxy import http

DUMP_DIR = os.path.join(os.path.dirname(__file__), "..", "live_dumps")
os.makedirs(DUMP_DIR, exist_ok=True)

class APIJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, bytes):
            return f"<bytes: {obj.hex()}>"
        if isinstance(obj, msgpack.ExtType):
            if obj.code == 98:
                return {"lz4_payload": "<binary data, see unpacked if handled>"}
            return f"<ExtType code={obj.code}>"
        if isinstance(obj, msgpack.Timestamp):
            return obj.to_datetime().isoformat()
        return super().default(obj)

def decode_lz4_recursive(obj):
    """再帰的にExtType(98)を探してLZ4解凍する"""
    if isinstance(obj, list):
        # ExtType(98)によるLZ4ペイロードのパターン: [ExtType(98), data, data...]
        if len(obj) >= 2 and isinstance(obj[0], msgpack.ExtType) and obj[0].code == 98:
            try:
                ext_unpacker = msgpack.Unpacker(raw=False)
                ext_unpacker.feed(obj[0].data)
                ext_ints = list(ext_unpacker)
                chunks = obj[1:]
                decompressed_chunks = []
                for i in range(len(chunks)):
                    comp_chunk = chunks[i]
                    uncomp_size = ext_ints[i]
                    dec = lz4.block.decompress(comp_chunk, uncompressed_size=uncomp_size)
                    decompressed_chunks.append(dec)
                
                full_decompressed = b"".join(decompressed_chunks)
                
                # 解凍したデータをさらにMsgPackとしてパース
                unpacker = msgpack.Unpacker(raw=False)
                unpacker.feed(full_decompressed)
                unpacked_items = list(unpacker)
                # パースした中身も再帰的にチェック
                return [decode_lz4_recursive(item) for item in unpacked_items]
            except Exception as e:
                return f"<lz4 decode error: {e}>"
        else:
            return [decode_lz4_recursive(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: decode_lz4_recursive(v) for k, v in obj.items()}
    return obj

def process_payload(content: bytes) -> list:
    """MsgPackバイナリをパースし、可能ならLZ4解凍してJSONシリアライズ可能な構造にする"""
    if not content:
        return []
    try:
        unpacker = msgpack.Unpacker(raw=False)
        unpacker.feed(content)
        parsed = list(unpacker)
        return decode_lz4_recursive(parsed)
    except Exception as e:
        return [f"<msgpack decode error: {e}>"]

def save_dump(prefix: str, api_path: str, content: bytes, flow_id: str):
    """
    api_path: 例 '/api/Login' -> 'api_Login'
    """
    if not content:
        return
        
    safe_path = api_path.strip("/").replace("/", "_")
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    # flow_idの下4桁を使って同名被りを防ぐ
    short_id = flow_id[:4]
    
    base_name = f"{ts}_{safe_path}_{short_id}_{prefix}"
    
    # エンドポイントごとにフォルダを分ける
    api_dir = os.path.join(DUMP_DIR, safe_path)
    os.makedirs(api_dir, exist_ok=True)
    
    bin_path = os.path.join(api_dir, f"{base_name}.bin")
    json_path = os.path.join(api_dir, f"{base_name}.json")
    
    # 1. 生バイナリの保存
    with open(bin_path, "wb") as f:
        f.write(content)
        
    # 2. パース＆JSON保存
    parsed_obj = process_payload(content)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(parsed_obj, f, cls=APIJSONEncoder, indent=2, ensure_ascii=False)


class LiveDumper:
    def request(self, flow: http.HTTPFlow):
        # APIホストかつ、/api/ から始まるリクエストを対象とする
        if "wds-stellarium.com" in flow.request.pretty_host and "/api/" in flow.request.path:
            api_path = flow.request.path.split("?")[0]
            save_dump("Req", api_path, flow.request.content, flow.id)

    def response(self, flow: http.HTTPFlow):
        if "wds-stellarium.com" in flow.request.pretty_host and "/api/" in flow.request.path:
            api_path = flow.request.path.split("?")[0]
            save_dump("Res", api_path, flow.response.content, flow.id)

addons = [
    LiveDumper()
]
