import os

search_dir = r"c:\Users\DELL\Desktop\APPS\Miklens-herbicide-trial-manager-6-main 18th"
patterns = [
    "Failed to update photo AI status",
    "Failed to save AI observation"
]

for root, dirs, files in os.walk(search_dir):
    # Skip build output directories and .git
    if any(p in root for p in [".git", "node_modules", "dist", "build"]):
        continue
    for file in files:
        if file.endswith((".js", ".jsx", ".html", ".css", ".json")):
            path = os.path.join(root, file)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    for pattern in patterns:
                        if pattern.lower() in content.lower():
                            print(f"Found '{pattern}' in {path}")
            except Exception as e:
                pass
