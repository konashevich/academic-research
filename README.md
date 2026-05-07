# Academic Research Assistant

Template-aware VS Code extension for academic writing projects that follow the IADE paper template structure.

The MVP detects `paper.yaml`, indexes `refs/bibliography.json`, inserts Pandoc citations, tracks unresolved citation needs in `refs/reference-register.md`, and wraps the template's `make verify`, `make sync`, `make draft`, `make pdf`, and `make switch` commands.

When the paper template points to local MCP servers, the extension can also search Zotero, search Google Scholar, and sync `refs/bibliography.json` directly from Zotero MCP.

## Commands

- `Academic Research: Show Project Status`
- `Academic Research: Find Citation for Selection`
- `Academic Research: Add Selection to Reference Register`
- `Academic Research: Verify Citations`
- `Academic Research: Sync Bibliography`
- `Academic Research: Build Draft PDF`
- `Academic Research: Build PDF`
- `Academic Research: Switch Target`

## MCP Integration

For IADE-style projects, MCP connection details come from `paper.yaml`:

```yaml
mcp:
  host: "${ACADEMIC_MCP_HOST:-localhost}"
  zotero_port: 9180
  scholar_port: 3847
```

Implemented MCP features:

- Zotero citation suggestions via `zotero_suggest_citations`
- Zotero item creation for external results via `zotero_create_item`
- Zotero bibliography sync via `zotero_export_bibliography_content`
- Google Scholar search via `search_google_scholar_key_words`

The Zotero export may return CSL IDs prefixed with a library id, such as `17365128/ABC123`. The extension normalizes those to the item key, such as `ABC123`, so inserted Pandoc citations remain compatible with the template verifier.

Optional settings:

- `academicResearch.enableZoteroMcp`
- `academicResearch.enableScholarMcp`
- `academicResearch.enableOpenAlex`
- `academicResearch.openAlexEmail`
- `academicResearch.autoVerifyOnSave`

## Development

```bash
npm test
npm run test:extension
```

`npm run test:extension` launches VS Code under `xvfb-run` against a temporary copy of `/mnt/merged_ssd/Papers/academic-paper-template`.
