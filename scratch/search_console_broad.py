import os

search_dir = r"c:\Users\DELL\Desktop\APPS\Miklens-herbicide-trial-manager-6-main 18th"
for root, dirs, files in os.walk(search_dir):
    if ".git" in root or "node_modules" in root:
        continue
    for file in files:
        if file.endswith((".js", ".jsx", ".html")):
            path = os.path.join(root, file)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    if "console." in content:
                        lines = content.split("\n")
                        for idx, line in enumerate(lines):
                            if "console.error" in line or "console.warn" in line:
                                if "photo" in line.lower() or "ai" in line.lower() or "save" in line.lower():
                                    print(f"{file}:{idx+1} -> {line.strip()}")
            except Exception as e:
                pass
