import os

src_dir = r"c:\Users\DELL\Desktop\APPS\Miklens-herbicide-trial-manager-6-main 18th\src"
for root, dirs, files in os.walk(src_dir):
    for f in files:
        if f.endswith((".js", ".jsx")):
            p = os.path.join(root, f)
            try:
                with open(p, 'r', encoding='utf-8') as file:
                    lines = file.readlines()
                    for idx, line in enumerate(lines):
                        if "Failed to update" in line or "Failed to save" in line:
                            print(f"{f}:{idx+1} -> {line.strip()}")
            except Exception as err:
                print("Error reading", p, err)
