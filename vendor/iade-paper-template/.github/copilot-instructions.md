# AI Agent Instructions for Academic Paper Writing

## Project Overview
<!-- ⚠️  EDIT THIS SECTION for each new project. Describe your research topic, thesis, and institutional context. -->
This is an academic research project. The primary objective and research context should be described here after running `init-project.sh`.

## Writing Standards & Conventions
- **Language**: British English exclusively (e.g., "tokenised", "analyse", "colour"). Adjust if the project uses American English.
- **Tone**: Formal academic tone. Project firm confidence in the arguments presented. Avoid wishy-washy language: do not use "may", "might", "could", "seems", "appears", "suggests", "indicates", "potentially", "possibly", "likely", "arguably", "somewhat", "relatively", "tends to" — unless genuinely expressing epistemic uncertainty about an open question.
- **Citations**: Always include proper academic citations when making factual claims. Use Pandoc citation syntax: `[@citekey]` for single citations, `[@key1; @key2]` for multiple.
- **Formatting**: Academic narrative style — fewer bullet points, more thoughtful prose. No bold text in the body.

## Citation & Reference System
- **Citation syntax**: Pandoc-style `[@citekey]` where citekey matches the `id` field in `refs/bibliography.json`
- **Bibliography format**: CSL JSON array in `refs/bibliography.json`
- **Citation style**: Defined per target in `paper.yaml` (CSL files in `styles/`)
- **Workflow**: See `.github/instructions/references-workflow.instructions.md` for the complete 7-phase reference workflow

## Zotero MCP Server Integration
This project uses a remote Zotero MCP server for bibliography and citation management.

### Available MCP Tools
1. **export_bibliography_content**: Export full Zotero library as CSL JSON
2. **ensure_style_content**: Retrieve CSL citation styles
3. **validate_references_content**: Validate manuscript citations against library
4. **build_exports_content**: Generate DOCX/HTML/PDF with citations and return download tokens
5. **search_items**: Search Zotero library by keywords/DOI/title

### Key Specifications
- **Bibliography format**: CSL JSON — tools expect a raw JSON array `[...]` of CSL items
- **Citekey format**: Use Zotero item keys (e.g., `[@QU8VKVB6]`) or Better BibTeX keys
- **File transfer**: Server returns download tokens/URLs for file retrieval

### Mandatory Workflow
1. **Pre-build validation**: Use `validate_references_content` to check all citations exist
2. **Bibliography sync**: Export fresh bibliography before each build
3. **Error handling**: Check for unresolved citekeys, missing fields, duplicate citations
4. **Library-first**: Always search the Zotero library before creating new items

## Google Scholar MCP Integration
Use the Google Scholar MCP server for discovering new academic sources. Prefer Google Scholar for initial discovery, then import found items into Zotero for permanent storage.

## Build System
- **Configuration**: All build parameters are in `paper.yaml`
- **Build command**: `./build.sh` (reads active target from `paper.yaml`)
- **Switch target**: `make switch TO=ledger` or edit `paper.yaml`
- **Draft mode**: `./build.sh --draft` (skips reference verification)
- **Verification**: `make verify` (check references without building)

## File Organisation
- `paper.md` — the manuscript (single file for most papers)
- `refs/bibliography.json` — CSL JSON bibliography (synced from Zotero)
- `styles/` — CSL style files
- `templates/` — LaTeX header files per journal target
- `scripts/` — build and verification utilities
- `paper.yaml` — project and build configuration
