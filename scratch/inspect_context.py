import re

path = r"c:\Users\DELL\Desktop\APPS\Miklens-herbicide-trial-manager-6-main 18th\Herbicide app.html"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "Failed to update photo" in line or "Failed to save AI" in line:
        print(f"Line {i+1}: {line.strip()}")
        # print context
        start = max(0, i-5)
        end = min(len(lines), i+6)
        print("--- CONTEXT ---")
        for j in range(start, end):
            print(f"{j+1}: {lines[j].strip()}")
        print("----------------")
