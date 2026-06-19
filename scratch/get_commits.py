import urllib.request
import json
import sys
import os

url = "https://api.github.com/repos/pedduhudga/Miklens-herbicide-trial-manager-6/commits?per_page=15"
token = os.environ.get("GITHUB_TOKEN", "YOUR_TOKEN_HERE")

req = urllib.request.Request(url)
req.add_header('Authorization', f'token {token}')
req.add_header('User-Agent', 'Python-urllib')

try:
    with urllib.request.urlopen(req) as response:
        commits = json.loads(response.read().decode())
        for c in commits:
            sha = c['sha']
            date = c['commit']['author']['date']
            msg = c['commit']['message']
            print(f"=== COMMIT: {sha[:8]} ===")
            print(f"Date: {date}")
            print(f"Message: {msg}")
            print("-" * 40)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
