import os
import glob
import json
import msgpack
import lz4.block

def default_ext(code, data):
    return msgpack.ExtType(code, data)

def decode_lz4_payload(obj):
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

class APIJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, bytes):
            # Try to decode as utf-8, otherwise hex string
            try:
                return obj.decode('utf-8')
            except:
                return f"<bytes: {obj.hex()}>"
        if isinstance(obj, msgpack.ExtType):
            return f"<ExtType code={obj.code} data={obj.data.hex()}>"
        if hasattr(obj, '__class__') and obj.__class__.__name__ == 'Timestamp':
             # some msgpack libraries return custom types for timestamps
             return str(obj)
        return super().default(obj)

def convert_all():
    bin_dir = os.path.join(os.path.dirname(__file__), "..", "raw_intercepts", "api", "bin")
    out_dir = os.path.join(os.path.dirname(__file__), "..", "raw_intercepts", "api", "json")
    os.makedirs(out_dir, exist_ok=True)
    
    bin_files = glob.glob(os.path.join(bin_dir, "*.bin"))
    print(f"Found {len(bin_files)} bin files.")
    
    for bf in bin_files:
        basename = os.path.basename(bf)
        json_name = basename.replace(".bin", ".json")
        out_path = os.path.join(out_dir, json_name)
        
        try:
            with open(bf, "rb") as f:
                unp = msgpack.Unpacker(f, raw=False, ext_hook=default_ext)
                objects = list(unp)
                
            decoded_objects = []
            for obj in objects:
                dec_bytes = decode_lz4_payload(obj)
                if dec_bytes:
                    try:
                        inner_unp = msgpack.Unpacker(raw=False, ext_hook=default_ext)
                        inner_unp.feed(dec_bytes)
                        inner_objects = list(inner_unp)
                        decoded_objects.append({"lz4_payload": inner_objects})
                    except Exception as e:
                        decoded_objects.append({"lz4_decode_error": str(e)})
                else:
                    decoded_objects.append(obj)
                    
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(decoded_objects, f, indent=2, ensure_ascii=False, cls=APIJSONEncoder)
            print(f"Converted {basename} -> {json_name}")
            
        except Exception as e:
            print(f"Error processing {basename}: {e}")

if __name__ == "__main__":
    convert_all()
