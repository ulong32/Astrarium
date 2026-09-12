import msgpack
import lz4.block
import sys
import os
import json

class BytesEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, bytes):
            try:
                return obj.decode('utf-8')
            except UnicodeDecodeError:
                return obj.hex()
        if isinstance(obj, msgpack.ExtType):
            return f"ExtType(code={obj.code}, data={obj.data.hex()})"
        if isinstance(obj, msgpack.Timestamp):
            return obj.to_datetime().isoformat()
        return super().default(obj)

def parse_mastermemory(file_path):
    with open(file_path, 'rb') as f:
        data = f.read()

    unpacker = msgpack.Unpacker(raw=True)
    unpacker.feed(data)
    
    try:
        header = unpacker.unpack()
    except Exception as e:
        print(f"Error unpacking header: {e}")
        return
        
    header_end_pos = unpacker.tell()
    print(f"Header ended at byte offset: {header_end_pos}")
    
    output_dir = "mastermemory_tables_decoded"
    os.makedirs(output_dir, exist_ok=True)
    
    for table_name_bytes, (offset, count) in header.items():
        table_name = table_name_bytes.decode('utf-8')
        try:
            start_pos = header_end_pos + offset
            table_unpacker = msgpack.Unpacker(raw=True)
            table_unpacker.feed(data[start_pos:])
            
            meta = table_unpacker.unpack()
            
            items = []
            extracted_type = "UNKNOWN"
            
            if isinstance(meta, msgpack.ExtType) and meta.code == 99:
                # Decode LZ4 MessagePack-CSharp format
                u3 = msgpack.Unpacker(raw=False)
                u3.feed(meta.data)
                uncomp_len = next(u3)
                comp_data = meta.data[u3.tell():]
                decomp = lz4.block.decompress(comp_data, uncompressed_size=uncomp_len)
                
                u4 = msgpack.Unpacker(raw=True)
                u4.feed(decomp)
                items = next(u4)
                extracted_type = "LZ4"
            elif isinstance(meta, list) and len(meta) == 2 and isinstance(meta[0], int) and isinstance(meta[1], bytes):
                # Standard uncompressed format [count, buffer]
                item_count = meta[0]
                buffer = meta[1]
                buffer_unpacker = msgpack.Unpacker(raw=True)
                buffer_unpacker.feed(buffer)
                
                for _ in range(item_count):
                    try:
                        items.append(buffer_unpacker.unpack())
                    except StopIteration:
                        break
                extracted_type = "RAW_BUFFER"
            elif isinstance(meta, list):
                # It is already the list of items
                items = meta
                extracted_type = "LIST"
            else:
                print(f"Unexpected structure for {table_name}: {type(meta)}")
                continue
                
            out_path = os.path.join(output_dir, f"{table_name}.json")
            with open(out_path, 'w', encoding='utf-8') as out_f:
                json.dump(items, out_f, ensure_ascii=False, indent=2, cls=BytesEncoder)
                
            print(f"Extracted {extracted_type} {table_name} ({len(items)} items) -> {out_path}")
            
        except Exception as e:
            print(f"Error extracting table {table_name}: {e}")

if __name__ == "__main__":
    parse_mastermemory("mastermemory_1785728385_1785728385.db")
