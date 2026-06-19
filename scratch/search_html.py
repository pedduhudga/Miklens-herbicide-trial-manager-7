import os

paths = [
    r"c:\Users\DELL\Desktop\APPS\Miklens-herbicide-trial-manager-6-main 18th\Herbicide app.html",
    r"c:\Users\DELL\Desktop\APPS\Miklens-herbicide-trial-manager-6-main 18th\Herbicide app 10.html"
]

patterns = [
    "Failed to update photo AI",
    "Failed to save AI observation",
    "Failed to update photo",
    "Failed to save AI"
]

for path in paths:
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
                for pattern in patterns:
                    if pattern.lower() in content.lower():
                        print(f"Found '{pattern}' in {path}")
        except Exception as e:
            print("Error reading", path, e)
