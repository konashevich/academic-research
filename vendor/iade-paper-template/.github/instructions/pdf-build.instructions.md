---
applyTo: '**'
---

# PDF Build Rules

Rules for the AI agent when assembling or troubleshooting PDF output.

## Build System
1. **Always use the build system**: Run `./build.sh` or `make pdf`. Never invoke Pandoc manually with ad-hoc flags — the `paper.yaml` configuration is the single source of truth.
2. **Active target**: The current journal target is defined by the `target:` field in `paper.yaml`. To switch: `make switch TO=<target>`.
3. **Draft mode**: Use `./build.sh --draft` (or `make draft`) only for intermediate visual checks. Draft builds skip reference verification.

## Pre-Build Checks
4. **Reference verification is mandatory** for non-draft builds. The build script runs `scripts/verify_refs.py` automatically. If it fails, fix the references before building.
5. **Missing references**: If `verify_refs.py` reports missing keys, either:
   - Find and add the reference to `refs/bibliography.json` via Zotero MCP, or
   - Remove the dangling citation from the manuscript.

## Bibliography
6. **Bibliography file**: `refs/bibliography.json` (CSL JSON format, array of objects).
7. **Sync before publishing**: Before any final or submission build, run `make sync` to pull the latest data from Zotero.
8. **CSL styles**: Stored in `styles/`. The active style is determined by the target profile in `paper.yaml`.

## LaTeX Headers
9. **Templates**: Journal-specific LaTeX headers live in `templates/<target>/header.tex`.
10. **Do not modify headers casually**: These control margins, fonts, headings, and page layout to match journal requirements. Changes should be deliberate and tested.

## Output
11. **Output filename**: `paper_<target>.pdf` (or `paper_<target>_draft.pdf` for drafts).
12. **Keep root clean**: Move experimental or one-off PDFs to a `drafts/` or `old/` directory.
