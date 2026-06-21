file_path = r"c:\Users\user\OneDrive\Desktop\Miklens-herbicide-trial-manager-6-main\dist\assets\index-BV3av03z.js"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

import re
matches = [m.start() for m in re.finditer(r'function r9\b', content)]
print(f"Found {len(matches)} matches for function r9")

for m in matches:
    print(content[m:m+1000])
