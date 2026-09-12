import mitmproxy.http
import msgpack
import lz4.block

# --- ヘルパー関数群 ---
def default_ext(code, data):
    return msgpack.ExtType(code, data)

def encode_lz4_payload(data_bytes):
    """MsgPackでシリアライズされたバイト列をLZ4圧縮し、ExtType(98)でラップする"""
    CHUNK_SIZE = 32764
    ext_ints = []
    comp_chunks = []
    
    for i in range(0, len(data_bytes), CHUNK_SIZE):
        chunk = data_bytes[i:i+CHUNK_SIZE]
        ext_ints.append(len(chunk))
        comp_chunk = lz4.block.compress(chunk, store_size=False)
        comp_chunks.append(comp_chunk)
        
    ext_data = b"".join(msgpack.packb(size, use_bin_type=True) for size in ext_ints)
    ext_obj = msgpack.ExtType(98, ext_data)
    
    result_array = [ext_obj] + comp_chunks
    return result_array # これ自体がMsgPackのリストの一部となる

def decode_lz4_payload(obj):
    """ExtType(98)でラップされたLZ4ペイロードを解凍する"""
    if isinstance(obj, list) and len(obj) >= 2 and isinstance(obj[0], msgpack.ExtType) and obj[0].code == 98:
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
        return b"".join(decompressed_chunks)
    return None

# --- インターセプタ ---
class AuthInterceptor:
    def response(self, flow: mitmproxy.http.HTTPFlow):
        # APIのMsgPackレスポンスのみを対象とする
        if "msgpack" not in flow.response.headers.get("Content-Type", "").lower():
            return
            
        req_path = flow.request.path.split('?')[0].strip('/')
        
        # 例1: Auth系のAPI (Account/Authenticate) のフック
        if req_path == "api/Account/Authenticate":
            try:
                # 1. ネットワークからのレスポンス(MsgPack)を展開
                unp = msgpack.Unpacker(raw=False, ext_hook=default_ext)
                unp.feed(flow.response.content)
                objects = list(unp)
                
                # 2. オブジェクトを走査してLZ4ペイロードを探す
                for i, obj in enumerate(objects):
                    dec_bytes = decode_lz4_payload(obj)
                    if dec_bytes:
                        # 3. LZ4解凍された中身のMsgPackを展開
                        inner_unp = msgpack.Unpacker(raw=False)
                        inner_unp.feed(dec_bytes)
                        inner_objects = list(inner_unp)
                        
                        # 4. Auth系データ（JWTなど）の抽出と書き換え
                        # api_Account_Authenticate は inner_objects[0] が [JWT文字列, 数値, None] となっている
                        auth_data = inner_objects[0]
                        print(f"[Auth Intercept] Original JWT: {auth_data[0][:30]}...")
                        
                        # ここで auth_data[0] = "新しいJWT" のように書き換えることが可能
                        # auth_data[0] = "ey..."
                        
                        # 5. 再パック (MsgPack -> LZ4 -> MsgPack)
                        modified_inner_bytes = msgpack.packb(auth_data, use_bin_type=True)
                        new_lz4_payload = encode_lz4_payload(modified_inner_bytes)
                        objects[i] = new_lz4_payload
                
                # 6. 書き換えたオブジェクト群をHTTPレスポンスに戻す
                flow.response.content = b"".join(msgpack.packb(o, use_bin_type=True) for o in objects)
                print(f"[Auth Intercept] Successfully patched Account/Authenticate")
                
            except Exception as e:
                print(f"[Auth Intercept] Error: {e}")

        # 例2: Login APIでのプレイヤーデータのフック
        elif req_path == "api/Login":
             try:
                unp = msgpack.Unpacker(raw=False, ext_hook=default_ext)
                unp.feed(flow.response.content)
                objects = list(unp)
                for i, obj in enumerate(objects):
                    dec_bytes = decode_lz4_payload(obj)
                    if dec_bytes:
                        inner_unp = msgpack.Unpacker(raw=False)
                        inner_unp.feed(dec_bytes)
                        inner_objects = list(inner_unp)
                        
                        # Loginレスポンスにはプレイヤーのステータス配列が含まれる
                        # inner_objects[0] = [[0, [PlayerId, Level, ...]]]
                        player_data = inner_objects[0]
                        print(f"[Login Intercept] Player ID: {player_data[0][1][0]}")
                        
                        # データの改ざん
                        # player_data[0][1][1] = 999  # Levelを999に偽装するなど
                        
                        # 再パック
                        modified_inner_bytes = msgpack.packb(player_data, use_bin_type=True)
                        objects[i] = encode_lz4_payload(modified_inner_bytes)
                        
                flow.response.content = b"".join(msgpack.packb(o, use_bin_type=True) for o in objects)
             except Exception as e:
                print(f"[Login Intercept] Error: {e}")

addons = [AuthInterceptor()]
