file_path = r"c:\Users\user\OneDrive\Desktop\Miklens-herbicide-trial-manager-6-main\dist\assets\index-BV3av03z.js"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Position of match at 3869224
start = 3869224
end = start + 3000
print(content[start:end])
