import re
import os
import argparse

def extract(dump_path="dump.cs", out_path="msgpack_classes.txt"):
    if not os.path.exists(dump_path):
        print(f"Error: Dump file not found at {dump_path}")
        return

    with open(dump_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
        
    in_msgpack_class = False
    class_name = ""
    fields = []
    
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as out:
        for i in range(len(lines)):
            line = lines[i].strip()
            
            if '[MessagePackObject' in line:
                in_msgpack_class = True
                fields = []
                continue
                
            if in_msgpack_class and ('public class ' in line or 'public struct ' in line):
                class_name = line.split('//')[0].strip()
                continue
                
            if in_msgpack_class and line == '}':
                # End of class definition
                if class_name:
                    out.write(f"{class_name}\n")
                    for k, t, n in fields:
                        out.write(f"  {k}: {t} {n}\n")
                    out.write("\n")
                in_msgpack_class = False
                class_name = ""
                fields = []
                continue
                
            if in_msgpack_class and class_name and '[Key(' in line:
                # Extract key number
                m_key = re.search(r'\[Key\((.*?)\)\]', line)
                if m_key and i + 1 < len(lines):
                    key_idx = m_key.group(1)
                    # The next line usually has the property definition
                    next_line = lines[i+1].strip()
                    # e.g., public int PlayerId; or public string Name { get; set; }
                    m_prop = re.search(r'public\s+([^\s]+)\s+([^\s;{]+)', next_line)
                    if m_prop:
                        fields.append((f"[{key_idx}]", m_prop.group(1), m_prop.group(2)))

    print(f"Extraction complete! Saved to {out_path}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Extract MessagePack classes from Il2CppDumper dump.cs")
    parser.add_argument("--dump-cs", "-i", type=str, default="dump.cs", help="Path to Il2CppDumper dump.cs file")
    parser.add_argument("--output", "-o", type=str, default="msgpack_classes.txt", help="Output path for extracted classes")
    args = parser.parse_args()
    extract(args.dump_cs, args.output)
