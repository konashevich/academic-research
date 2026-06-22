#!/usr/bin/env python3
"""
check_urls.py — Check URL health in a CSL JSON bibliography file.
Reports 404s, timeouts, and other failures.

Usage:
    python3 scripts/check_urls.py refs/bibliography.json
    python3 scripts/check_urls.py  (reads path from paper.yaml)
"""
import json
import urllib.request
import urllib.error
import socket
import sys
import os


def check_url(url):
    """Checks the status of a URL. Returns status code or error string."""
    url = url.strip()
    if not url:
        return None

    try:
        req = urllib.request.Request(url, method='HEAD', headers={
            'User-Agent': 'Mozilla/5.0 (Academic Reference Checker)'
        })
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.getcode()
    except urllib.error.HTTPError as e:
        return e.code
    except urllib.error.URLError as e:
        return str(e.reason)
    except socket.timeout:
        return "Timeout"
    except Exception as e:
        return str(e)


def get_bib_path():
    """Try to read bibliography path from paper.yaml."""
    try:
        import yaml
        yaml_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'paper.yaml')
        if os.path.exists(yaml_path):
            with open(yaml_path) as f:
                config = yaml.safe_load(f)
            bib = config.get('project', {}).get('bibliography', 'refs/bibliography.json')
            return os.path.join(os.path.dirname(yaml_path), bib)
    except ImportError:
        pass
    return None


def main():
    if len(sys.argv) > 1:
        refs_path = sys.argv[1]
    else:
        refs_path = get_bib_path()

    if not refs_path or not os.path.exists(refs_path):
        print(f"Bibliography not found: {refs_path}")
        print("Usage: python3 scripts/check_urls.py <bibliography.json>")
        sys.exit(1)

    try:
        with open(refs_path, 'r') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error loading JSON: {e}")
        sys.exit(1)

    # Handle both array and {items: [...]} formats
    if isinstance(data, dict) and 'items' in data:
        data = data['items']

    broken_urls = []
    total_checked = 0

    print(f"Checking URLs in {os.path.basename(refs_path)}...")

    for item in data:
        raw_url = item.get("URL")
        if not raw_url:
            continue

        urls = [u.strip() for u in raw_url.split(';') if u.strip()]

        for url in urls:
            total_checked += 1
            status = check_url(url)

            if isinstance(status, int) and status >= 400:
                print(f"  [{status}] {url} (ID: {item.get('id')})")
                broken_urls.append((item.get('id'), url, status))
            elif isinstance(status, str):
                print(f"  [ERR] {url} → {status} (ID: {item.get('id')})")
                broken_urls.append((item.get('id'), url, status))

    print(f"\nChecked {total_checked} URLs.")
    if not broken_urls:
        print("✅ No broken URLs found.")
    else:
        print(f"❌ {len(broken_urls)} broken URL(s) found.")
        sys.exit(1)


if __name__ == "__main__":
    main()
