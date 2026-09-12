import os
import msgpack
import lz4.block

def decode_lz4_payload(obj):
    if isinstance(obj, (list, tuple)):
        if len(obj) >= 2 and isinstance(obj[0], msgpack.ExtType) and obj[0].code == 98:
            uncompressed_chunks = []
            
            ext_data = obj[0].data
            unpacker = msgpack.Unpacker(raw=False, strict_map_key=False)
            unpacker.feed(ext_data)
            ext_ints = list(unpacker)
            
            for i, chunk in enumerate(obj[1:]):
                if i < len(ext_ints):
                    uncompressed_size = ext_ints[i]
                    try:
                        decompressed = lz4.block.decompress(chunk, uncompressed_size=uncompressed_size)
                        uncompressed_chunks.append(decompressed)
                    except Exception as e:
                        print(f"LZ4 Decompression error: {e}")
                        uncompressed_chunks.append(chunk)
                else:
                    uncompressed_chunks.append(chunk)
            
            full_uncompressed = b"".join(uncompressed_chunks)
            try:
                unpacker_inner = msgpack.Unpacker(raw=False, strict_map_key=False)
                unpacker_inner.feed(full_uncompressed)
                return [decode_lz4_payload(item) for item in unpacker_inner]
            except Exception as e:
                print(f"MsgPack decode error after LZ4 decompression: {e}")
                return full_uncompressed
        else:
            return [decode_lz4_payload(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: decode_lz4_payload(v) for k, v in obj.items()}
    return obj

def load_bin_as_object(filepath):
    with open(filepath, "rb") as f:
        data = f.read()
    
    unpacker = msgpack.Unpacker(raw=False, strict_map_key=False)
    unpacker.feed(data)
    unpacked_data = [decode_lz4_payload(obj) for obj in unpacker]
    return unpacked_data

if __name__ == "__main__":
    file_to_check = os.path.join("api", "bin", "api_data_user.bin")
    if os.path.exists(file_to_check):
        data = load_bin_as_object(file_to_check)
        print(f"Loaded {file_to_check}. Type: {type(data)}, items: {len(data)}")
    else:
        print("File not found:", file_to_check)
