import os

search_dir = r"c:\Users\DELL\Desktop\APPS\Miklens-herbicide-trial-manager-6-main 18th"
patterns = [
    "Failed to update photo AI",
    "Failed to save AI observation"
]

for root, dirs, files in os.walk(search_dir):
    # Do NOT skip dist/build here, to find where it is compiled
    if ".git" in root or "node_modules" in root:
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
