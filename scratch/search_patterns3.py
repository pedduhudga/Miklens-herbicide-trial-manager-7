import os

search_dir = r"c:\Users\DELL\Desktop\APPS\Miklens-herbicide-trial-manager-6-main 18th\src"
patterns = [
    "photo AI status",
    "save AI observation",
    "AI observation",
    "photo AI"
]

for root, dirs, files in os.walk(search_dir):
    if any(p in root for p in [".git", "node_modules", "dist", "build"]):
        continue
    for file in files:
        if file.endswith((".js", ".jsx", ".html")):
            path = os.path.join(root, file)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    for pattern in patterns:
                        if pattern.lower() in content.lower():
                            print(f"Found '{pattern}' in {path}")
            except Exception as e:
                pass
