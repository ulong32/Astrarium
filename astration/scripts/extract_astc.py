import os
import sys
import struct
import argparse
from PIL import Image
import texture2ddecoder
import concurrent.futures

def extract_astc(file_path, output_path, skip_existing=True):
    if skip_existing and os.path.exists(output_path):
        return False, f"Skipped (already exists): {output_path}"
        
    try:
        with open(file_path, 'rb') as f:
            header = f.read(16)
            if len(header) < 16:
                return False, f"Invalid ASTC (too small): {file_path}"
                
            magic = header[:4]
            if magic != b'\x13\xab\xa1\x5c':
                return False, f"Invalid ASTC magic: {file_path}"
                
            _, bw, bh, bz, x0, x1, x2, y0, y1, y2, z0, z1, z2 = struct.unpack('<4sBBBBBBBBBBBB', header)
            width = x0 + (x1 << 8) + (x2 << 16)
            height = y0 + (y1 << 8) + (y2 << 16)
            
            data = f.read()
            
            # Decode using texture2ddecoder (outputs BGRA)
            rgba = texture2ddecoder.decode_astc(data, width, height, bw, bh)
            
            # texture2ddecoder outputs BGRA format, and Unity textures are often flipped vertically (OpenGL bottom-left origin)
            img = Image.frombytes('RGBA', (width, height), rgba, 'raw', 'BGRA')
            img = img.transpose(Image.FLIP_TOP_BOTTOM)
            
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            img.save(output_path)
            return True, f"Extracted: {file_path} -> {output_path} ({width}x{height})"
            
    except Exception as e:
        return False, f"Error extracting {file_path}: {e}"

def process_directory(input_dir, output_dir, skip_existing=True):
    tasks = []
    for root, _, files in os.walk(input_dir):
        for file in files:
            if file.endswith('.astc'):
                in_path = os.path.join(root, file)
                rel_path = os.path.relpath(root, input_dir)
                base_name = file[:-5]
                
                if rel_path == ".":
                    out_path = os.path.join(output_dir, f"{base_name}.png")
                else:
                    out_path = os.path.join(output_dir, rel_path, f"{base_name}.png")
                    
                tasks.append((in_path, out_path))
                
    if not tasks:
        print("No .astc files found.")
        return 0
        
    print(f"Found {len(tasks)} .astc files. Starting extraction...")
    extracted_count = 0
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(extract_astc, t[0], t[1], skip_existing): t for t in tasks}
        for future in concurrent.futures.as_completed(futures):
            try:
                ok, msg = future.result()
                if ok:
                    extracted_count += 1
                if msg:
                    # Print success messages, or errors
                    print(msg)
            except Exception as e:
                print(f"Extraction task failed: {e}")
                
    print(f"\nExtraction complete! Successfully converted {extracted_count} images.")
    return extracted_count

def main():
    parser = argparse.ArgumentParser(description="Extract raw ASTC files to PNG")
    parser.add_argument("input_dir", type=str, help="Directory containing .astc files")
    parser.add_argument("--output_dir", type=str, default="extracted_assets", help="Base directory for extracted files")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing PNG files")
    
    args = parser.parse_args()
    
    if not os.path.isdir(args.input_dir):
        print(f"Input directory does not exist: {args.input_dir}")
        sys.exit(1)
        
    process_directory(args.input_dir, args.output_dir, not args.overwrite)

if __name__ == "__main__":
    main()
