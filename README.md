# Academic Research Assistant

Template-aware VS Code extension for academic writing projects that follow the IADE paper template structure.

The MVP detects `paper.yaml`, indexes `refs/bibliography.json`, inserts Pandoc citations, tracks unresolved citation needs in `refs/reference-register.md`, and wraps the template's `make verify`, `make sync`, `make draft`, `make pdf`, and `make switch` commands.

## Quick start (new users)

1. Install the extension in VS Code or Cursor.
2. Run **Academic Research: Open Writing Hub** (opens automatically on first launch).
3. Complete the **Infrastructure** step:
   - installs portable MCP services via `uv`/`uvx` (no Docker required)
   - stores your Zotero API key securely
   - starts Zotero MCP and Google Scholar MCP locally
4. Use citation commands in your Markdown manuscript.

You need a [Zotero API key](https://www.zotero.org/settings/keys/new) with library read/write access and your numeric library ID.

## Commands

- `Academic Research: Open Writing Hub`
- `Academic Research: Show Project Status`
- `Academic Research: Find Citation for Selection`
- `Academic Research: Add Selection to Reference Register`
- `Academic Research: Verify Citations`
- `Academic Research: Sync Bibliography`
- `Academic Research: Build Draft PDF`
- `Academic Research: Build PDF`
- `Academic Research: Switch Target`

## MCP Integration

### Bundled mode (default)

The extension manages local MCP processes:

- **Zotero MCP** via `uvx zotero-mcp --transport sse` (default port `8000`)
- **Google Scholar MCP** via vendored server in `vendor/google-scholar-mcp/` (dynamic port)
- **OpenAlex** via built-in HTTPS client (no local server)

Credentials live in VS Code `SecretStorage`. Ports are written to settings after startup.

After setup, use **Connect to AI chat** in the Hub to merge `.vscode/mcp.json` and `.cursor/mcp.json` in your workspace for Cursor/VS Code MCP clients.

### External mode (advanced)

Set `academicResearch.mcpMode` to `external` and configure host/ports manually. Legacy `paper.yaml` `mcp:` values still override when present.

Implemented MCP features:

- Zotero citation suggestions via `zotero_suggest_citations`
- Zotero item creation for external results via `zotero_create_item`
- Zotero bibliography sync via `zotero_resolve_citekeys` for citekeys used in the manuscript (not the full library)
- Google Scholar search via `search_google_scholar_key_words`

The Zotero sync exports citekeys from the manuscript, `refs/reference-register.md`, and any key being imported. It uses `zotero_resolve_citekeys` with Better BibTeX and per-item `zotero_item_metadata` fallbacks. If any requested key cannot be refreshed, sync fails and `refs/bibliography.json` is left unchanged.

With Zotero MCP disabled, **Sync Bibliography** only prunes the local file to project citekeys using existing entries; it does not download new metadata.

### Settings

- `academicResearch.mcpMode` — `bundled` or `external`
- `academicResearch.setupComplete` — set after successful infrastructure verification
- `academicResearch.enableZoteroMcp`
- `academicResearch.enableScholarMcp`
- `academicResearch.enableOpenAlex`
- `academicResearch.openAlexEmail`
- `academicResearch.mcpHost`, `academicResearch.zoteroPort`, `academicResearch.scholarPort`
- `academicResearch.autoVerifyOnSave`

## Development

```bash
npm test
npm run test:integration
npm run test:extension
```

Optional live Zotero MCP test (skipped unless enabled):

```bash
ACADEMIC_RESEARCH_LIVE_ZOTERO=1 \
ACADEMIC_RESEARCH_TEST_CITEKEYS=YOURKEY \
ACADEMIC_RESEARCH_ZOTERO_PORT=9180 \
npm run test:integration
```

`npm run test:extension` launches VS Code under `xvfb-run` against a temporary copy of `/mnt/merged_ssd/Papers/academic-paper-template`.
