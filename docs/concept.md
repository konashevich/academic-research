# Product Specification: Academic Research Assistant (VS Code Extension)

## 1. Overview

The Academic Research Assistant is a VS Code extension for academic writing projects. Its purpose is to help authors discover sources, insert citations, track unresolved evidence needs, and verify manuscript references without leaving the editor.

The extension should work as a general Markdown citation helper, but its primary target environment is the IADE-style academic paper template located at:

```text
/mnt/merged_ssd/Papers/academic-paper-template
```

That template is not just a folder layout. It defines the practical writing workflow:

- `paper.md` is the manuscript.
- `paper.yaml` is the source of truth for project metadata, manuscript path, bibliography path, active journal target, CSL style, and MCP configuration.
- `refs/bibliography.json` is the local CSL JSON bibliography.
- Citations use Pandoc syntax such as `[@citekey]` and `[@key1; @key2]`.
- Zotero MCP and Google Scholar MCP provide reference management and discovery.
- `make verify`, `make sync`, `make pdf`, and `make draft` are the project-level operational commands.
- `.github/instructions/*.instructions.md` stores writing, reference, fact-checking, and build rules for AI-assisted academic work.

Because of this, the extension should be template-aware rather than merely style-aware. It should understand the project structure, use the configured bibliography and build system, and avoid inventing a parallel citation workflow.

## 2. Product Positioning

The extension is not primarily a citation formatter. It is a project-aware academic workflow assistant.

The correct default action is not "insert APA" or "insert BibTeX". The correct default action is:

1. Understand the current academic project.
2. Find or create a real bibliographic record.
3. Insert a Pandoc citation key into the manuscript.
4. Keep `refs/bibliography.json` and Zotero/library state aligned.
5. Verify that the manuscript citations resolve.

Rendered citation style should be handled by Pandoc and CSL during build, using the active target configured in `paper.yaml`.

## 3. Supported Project Modes

### 3.1 Template-Aware Mode

This is the primary mode.

The extension enters template-aware mode when it detects some or all of:

- `paper.yaml`
- `paper.md`
- `refs/bibliography.json`
- `.vscode/mcp.json`
- `.github/instructions/references-workflow.instructions.md`
- `.github/instructions/fact-check-workflow.instructions.md`
- `Makefile` targets such as `verify`, `sync`, `pdf`, or `draft`

In this mode, the extension reads `paper.yaml` and treats it as the source of truth.

### 3.2 Generic Markdown Mode

If no template project is detected, the extension can fall back to a simpler mode:

- Search selected text.
- Offer citation metadata.
- Insert Markdown notes or BibTeX only if explicitly configured.

Generic mode should be secondary. The first useful product should focus on template-aware mode.

## 4. Core Principles

1. **Library first.** Always search the existing project bibliography and Zotero library before importing or proposing a new source.
2. **Pandoc citations by default.** Insert `[@citekey]`, not rendered citation strings.
3. **No fabricated references.** If a source cannot be verified or imported, mark the claim as unresolved instead of inventing metadata.
4. **Keep the author in control.** Claim analysis should report and suggest; it should not rewrite the paper without confirmation.
5. **Use the project's own tools.** Prefer `make verify`, `make sync`, and `make pdf` over duplicate extension-only logic.
6. **Treat citation support as claim-specific.** A source existing in the bibliography is not enough; it must actually support the claim.
7. **Do not interrupt writing.** Diagnostics should be asynchronous, debounced, and quiet by default.

## 5. Core Workflows

### 5.1 Project Detection and Context Loading

When a workspace opens, the extension should:

1. Look for `paper.yaml`.
2. Parse:
   - `project.manuscript`
   - `project.bibliography`
   - `project.language`
   - active `target`
   - active target `csl`
   - MCP host and ports
3. Locate the manuscript and bibliography.
4. Load the local bibliography IDs from `refs/bibliography.json`.
5. Detect available project commands from the `Makefile`.
6. Read optional instruction files enough to surface project rules in the extension UI.

The extension should expose a compact project status view:

- Manuscript file
- Bibliography file
- Active target
- Citation style
- Bibliography item count
- Zotero MCP status
- Scholar MCP status
- Last verification result

### 5.2 Manual Selection Search

This is the recommended MVP workflow.

**Trigger:**

The user highlights text in `paper.md` and runs a command such as:

```text
Academic Research: Find Citation for Selection
```

**Processing:**

1. Extract selected text.
2. Use an LLM or local heuristic to identify the core claim, entities, and search terms.
3. Search sources in this order:
   - local `refs/bibliography.json`
   - Zotero MCP library
   - Google Scholar MCP
   - OpenAlex
   - Semantic Scholar
4. Show candidate papers with enough information for selection:
   - title
   - authors
   - year
   - venue
   - DOI or URL
   - abstract snippet
   - citation count if available
   - source of result
   - whether it is already in the local bibliography
   - whether it is already in Zotero

**Actions:**

- Insert citation at cursor: `[@citekey]`
- Replace `[citation needed]`
- Replace placeholder such as `[@ref1]`
- Add source to Zotero
- Sync bibliography
- Add to reference register for later review

### 5.3 Reference Register Workflow

The original concept proposed `research_drafts.md`. In the template-aware design, a better location is:

```text
refs/reference-register.md
```

This file should act as a human-readable work queue for unresolved evidence needs.

Suggested table format:

```markdown
| ID | Claim | Status | Query | Candidate source | Zotero key | Notes |
|---|---|---|---|---|---|---|
| ref1 | Claim needing support | searching | search terms | Title / DOI |  | Needs peer-reviewed source |
```

Statuses:

- `needed`
- `searching`
- `candidate-found`
- `imported`
- `inserted`
- `verified`
- `rejected`

This aligns with the template's reference workflow:

1. Identify citation gaps.
2. Create a register.
3. Discover sources.
4. Validate source quality.
5. Import into Zotero.
6. Replace placeholders with real citekeys.
7. Verify and build.

### 5.4 Placeholder Citation Workflow

When the extension identifies a claim requiring support but no final source has been selected, it should insert or suggest a placeholder:

```markdown
[@ref1]
```

The placeholder must be tracked in `refs/reference-register.md`.

Later, when a source is chosen and imported, the extension should replace:

```markdown
[@ref1]
```

with:

```markdown
[@QU8VKVB6]
```

The final key should match the `id` in `refs/bibliography.json`.

### 5.5 Automatic Claim Analysis

Automatic analysis should be a second-phase feature, after manual search and verification are stable.

**Trigger:**

```text
Academic Research: Analyse Manuscript Claims
```

or a status bar action.

**Processing:**

1. Read the configured manuscript from `paper.yaml`.
2. Split the manuscript by Markdown structure:
   - headings
   - paragraphs
   - block quotes
   - tables where feasible
3. Ignore YAML front matter, references section, code blocks, and existing bibliography data.
4. Detect factual claims that likely require citation.
5. Check nearby existing citations.
6. Check whether cited keys exist in `refs/bibliography.json`.
7. Report diagnostics without editing by default.

**Diagnostic categories:**

- Missing citation
- Placeholder citation still unresolved
- Citation key missing from bibliography
- Citation syntax issue
- Citation may not support claim
- Unused bibliography item

**UX:**

- Underline only high-confidence issues.
- Use hover text for explanation.
- Use quick fixes for concrete actions:
  - Search for source
  - Add to reference register
  - Insert placeholder
  - Verify citations
  - Sync bibliography

### 5.6 Verification and Build Workflow

The extension should wrap the project's existing commands:

```text
Academic Research: Verify Citations
Academic Research: Sync Bibliography
Academic Research: Build Draft PDF
Academic Research: Build PDF
Academic Research: Switch Target
```

In template-aware mode, these should call:

```bash
make verify
make sync
make draft
make pdf
make switch TO=<target>
```

The extension should parse command output and show useful diagnostics inside VS Code, but the project scripts remain the authority.

## 6. Data Sources

### 6.1 Local Bibliography

Primary for existing project references.

Path comes from:

```yaml
project:
  bibliography: refs/bibliography.json
```

The extension should load CSL JSON and index:

- `id`
- title
- authors
- date/year
- DOI
- URL
- container title / journal

### 6.2 Zotero MCP

Primary for durable reference management.

The extension should use Zotero MCP to:

- search existing library items
- avoid duplicates
- import or create items when supported
- export bibliography content to `refs/bibliography.json`

The extension should never create a local citation key that cannot be resolved through the bibliography.

### 6.3 Google Scholar MCP

Primary external discovery source in the template workflow.

Use for:

- broad literature search
- title and author lookup
- finding DOI or canonical source pages

### 6.4 OpenAlex

Useful secondary source because it is open, structured, and API-friendly.

Use for:

- metadata enrichment
- open access status
- DOI lookup
- citation counts where available
- abstract indexing

### 6.5 Semantic Scholar

Useful secondary source for AI-oriented relevance and citation graph exploration.

Use for:

- influential citation metrics
- related papers
- papers citing or cited by a known paper

## 7. User Interface

### 7.1 Activity Bar View

Add an "Academic Research" view with sections:

- Project Status
- Citation Search
- Reference Register
- Diagnostics
- Build and Verify

### 7.2 Search Results Panel

Each result should show:

- title
- authors/year
- venue
- DOI/URL
- abstract snippet
- source provider
- already in bibliography: yes/no
- already in Zotero: yes/no
- confidence/relevance indicator

Actions should be explicit and small:

- Insert
- Import
- Register
- Open
- Copy DOI

### 7.3 Editor Diagnostics

Diagnostics should be quiet and meaningful. Avoid noisy whole-document underlining.

Recommended severity:

- Error: citation key does not exist in bibliography.
- Warning: likely unsupported claim or unresolved placeholder.
- Information: optional strengthening source or unused bibliography item.

### 7.4 Status Bar

Show compact state:

```text
Academic: lncs | 42 refs | verify ok
```

Clicking opens the project status panel.

## 8. Technical Architecture

### 8.1 Extension Runtime

- Plain JavaScript or TypeScript.
- VS Code Extension API.
- Native `fetch` where possible.
- Minimal dependencies for MVP.

TypeScript is preferable once the project grows, but plain JavaScript with JSDoc is acceptable for an early prototype.

### 8.2 Main Components

```text
src/
  extension.js
  projectDetector.js
  paperYaml.js
  bibliographyIndex.js
  citationSearch.js
  zoteroMcpClient.js
  scholarMcpClient.js
  openAlexClient.js
  semanticScholarClient.js
  diagnostics.js
  registerStore.js
  commands.js
  webview/
```

### 8.3 State

Use VS Code workspace storage for cache only:

- recent searches
- last provider responses
- last verification result
- MCP connectivity state

Do not store authoritative bibliography data only in extension state. The authoritative files remain:

- `paper.yaml`
- `paper.md`
- `refs/bibliography.json`
- `refs/reference-register.md`

### 8.4 Knowledge Graph

The original concept suggested SQLite, IndexedDB, or another embedded graph. That is too heavy for MVP.

Start with:

- CSL JSON bibliography index
- reference register
- citation positions in manuscript
- lightweight in-memory claim map

Add a persistent local database only if real usage shows that the project needs cross-session semantic linking beyond what these files provide.

## 9. MVP Scope

The first version should deliver a narrow, useful loop:

1. Detect a template project.
2. Parse `paper.yaml`.
3. Load and index `refs/bibliography.json`.
4. Search selected text.
5. Search local bibliography first.
6. Query at least one external provider.
7. Insert Pandoc citation syntax.
8. Add unresolved claims to `refs/reference-register.md`.
9. Run `make verify`.
10. Show missing citation diagnostics.

This MVP is valuable even before full automatic claim analysis exists.

## 10. Later Enhancements

- Automatic full-manuscript claim analysis.
- Source-to-claim support checking.
- Citation context quality scoring.
- Duplicate bibliography detection.
- Target-aware warnings for journal-specific reference constraints.
- PDF build preview integration.
- Multi-root workspace support.
- Support for non-template academic projects.
- Better BibTeX citekey strategy configuration.
- Batch replacement of placeholders from `refs/reference-register.md`.

## 11. Open Questions

1. Should the extension call MCP servers directly, or should it rely on the editor/agent MCP integration where available?
2. Should `refs/reference-register.md` be created automatically, or only after the first unresolved citation is registered?
3. Should imported Zotero keys use raw Zotero item keys or Better BibTeX keys when available?
4. Should automatic claim analysis run on demand only, or also in a debounced background mode?
5. How much of `.github/instructions/*.instructions.md` should the extension parse versus simply link to?
6. Should the extension support multiple manuscripts in one project, or follow the single manuscript configured in `paper.yaml`?

## 12. Revised Concept Summary

The extension should become the interactive VS Code layer for the IADE academic paper template.

Its job is to connect manuscript text, source discovery, Zotero, CSL JSON, Pandoc citations, reference verification, and PDF build commands into one coherent writing experience.

The most important design correction is this:

> Insert citekeys and maintain the project's reference system; do not generate final citation formatting inside the editor.

