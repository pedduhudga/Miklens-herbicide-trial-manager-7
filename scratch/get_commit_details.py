import urllib.request
import json
import sys

shas = [
    "578a741b",
    "a34b9eb9",
    "5cb95078",
    "10e1e116",
    "7dbe8424",
    "656b81b7",
    "96405d2f"
]
import os

token = os.environ.get("GITHUB_TOKEN", "YOUR_TOKEN_HERE")

for sha in shas:
    url = f"https://api.github.com/repos/pedduhudga/Miklens-herbicide-trial-manager-6/commits/{sha}"
    req = urllib.request.Request(url)
    req.add_header('Authorization', f'token {token}')
    req.add_header('User-Agent', 'Python-urllib')
    
    try:
        with urllib.request.urlopen(req) as response:
            commit_data = json.loads(response.read().decode())
            print(f"=== {sha} ===")
            print(f"Author: {commit_data['commit']['author']['name']}")
            print(f"Date: {commit_data['commit']['author']['date']}")
            print(f"Message: {commit_data['commit']['message']}")
            print("Files changed:")
            for f in commit_data['files']:
                print(f"  - {f['filename']} ({f['status']}) - additions: {f['additions']}, deletions: {f['deletions']}")
            print("-" * 50)
    except Exception as e:
        print(f"Error fetching {sha}: {e}")
