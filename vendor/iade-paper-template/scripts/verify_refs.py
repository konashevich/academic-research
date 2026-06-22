#!/usr/bin/env python3
"""
verify_refs.py — Verify that all citations in the manuscript exist in the bibliography
and report any unused bibliographic entries.

Usage:
    python3 scripts/verify_refs.py --paper paper.md --bib refs/bibliography.json
    python3 scripts/verify_refs.py  (reads paths from paper.yaml)
"""
import re
import json
import sys
import os
import argparse


def extract_citations(filepath):
    """Extracts all Pandoc-style citations from a Markdown file."""
    citations = set()
    citation_block_regex = re.compile(r'\[([^\]]*@[^\]]*)\]')
    key_regex = re.compile(r'@([a-zA-Z0-9_.-]+)')

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            blocks = citation_block_regex.findall(content)
            for block in blocks:
                keys = key_regex.findall(block)
                for key in keys:
                    citations.add(key)
    except Exception as e:
        print(f"Error reading paper: {e}")
        sys.exit(1)
    return citations


def load_bibliography(filepath):
    """Loads all IDs from a CSL JSON bibliography file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            bib_data = json.load(f)
            # Handle both array and {items: [...]} formats
            if isinstance(bib_data, dict) and 'items' in bib_data:
                bib_data = bib_data['items']
            return {item.get('id') for item in bib_data if 'id' in item}
    except Exception as e:
        print(f"Error reading bibliography: {e}")
        sys.exit(1)


def get_paths_from_yaml():
    """Try to read paths from paper.yaml if available."""
    try:
        import yaml
        yaml_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'paper.yaml')
        if os.path.exists(yaml_path):
            with open(yaml_path) as f:
                config = yaml.safe_load(f)
            paper = config.get('project', {}).get('manuscript', 'paper.md')
            bib = config.get('project', {}).get('bibliography', 'refs/bibliography.json')
            root = os.path.dirname(yaml_path)
            return os.path.join(root, paper), os.path.join(root, bib)
    except ImportError:
        pass
    return None, None


def main():
    parser = argparse.ArgumentParser(description='Verify manuscript citations against bibliography.')
    parser.add_argument('--paper', help='Path to the manuscript Markdown file')
    parser.add_argument('--bib', help='Path to the CSL JSON bibliography file')
    args = parser.parse_args()

    paper_path = args.paper
    bib_path = args.bib

    # Fall back to paper.yaml if args not provided
    if not paper_path or not bib_path:
        yaml_paper, yaml_bib = get_paths_from_yaml()
        paper_path = paper_path or yaml_paper
        bib_path = bib_path or yaml_bib

    if not paper_path or not bib_path:
        print("Error: Provide --paper and --bib, or ensure paper.yaml exists.")
        sys.exit(1)

    if not os.path.exists(paper_path):
        print(f"Paper not found: {paper_path}")
        sys.exit(1)
    if not os.path.exists(bib_path):
        print(f"Bibliography not found: {bib_path}")
        sys.exit(1)

    print(f"Verifying references for: {os.path.basename(paper_path)}")
    print(f"Using bibliography: {os.path.basename(bib_path)}")
    print("-" * 50)

    paper_citations = extract_citations(paper_path)
    bib_ids = load_bibliography(bib_path)

    missing_in_bib = sorted([c for c in paper_citations if c not in bib_ids])
    unused_in_bib = sorted([b for b in bib_ids if b not in paper_citations])

    if not missing_in_bib and not unused_in_bib:
        print("✅ All references are perfectly synchronised.")
        return

    if missing_in_bib:
        print(f"\n❌ MISSING REFERENCES ({len(missing_in_bib)}):")
        print("Citations in the paper but NOT in the bibliography:")
        for key in missing_in_bib:
            print(f"  - @{key}")
    else:
        print("\n✅ All citations in the paper exist in the bibliography.")

    if unused_in_bib:
        print(f"\n⚠️  UNUSED REFERENCES ({len(unused_in_bib)}):")
        print("Items in the bibliography but NOT cited in the paper:")
        for key in unused_in_bib:
            print(f"  - {key}")
    else:
        print("\n✅ No unused references in the bibliography.")

    print("-" * 50)
    if missing_in_bib:
        sys.exit(1)


if __name__ == "__main__":
    main()
