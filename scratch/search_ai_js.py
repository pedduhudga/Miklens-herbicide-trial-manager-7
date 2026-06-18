import os

path = r"c:\Users\DELL\Desktop\APPS\Miklens-herbicide-trial-manager-6-main 18th\src\services\ai.js"
patterns = [
    "Failed to save AI",
    "Failed to update photo",
    "Failed to save",
    "Failed to update",
    "AI observation",
    "QuotaExceededError"
]

if os.path.exists(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
            for pattern in patterns:
                if pattern.lower() in content.lower():
                    print(f"Found '{pattern}' in {path}")
    except Exception as e:
        print("Error", e)
else:
    print("Does not exist")
