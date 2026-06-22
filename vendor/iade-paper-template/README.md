# IADE — Integrated Academic Development Environment

> Turning a code editor into an academic writing platform.

VS Code — and its forks (Cursor, Windsurf, Antigravity) — with their agentic AI capabilities have become suitable platforms for far more than writing code. The "D" in IDE stands for *Development*, and development is not exclusive to software. Writing a research paper is a development process: you research, draft, cite, verify, format, and iterate — exactly the workflow that an AI-augmented editor can orchestrate.

This project is the first prototype of an **IADE** — an *Integrated Academic Development Environment*. It demonstrates how to turn a code editor into a complete academic writing workspace where an AI agent handles literature search, reference management, citation verification, and multi-format PDF production, while the human focuses on thinking and writing.

**Write in Markdown. Cite with Zotero. Build to any journal's PDF. Let the AI agent handle the rest.**

---

## Getting Started (For Paper Writers)

> **Pro Tip: Automate creation with Agent Skills**
> There is a Copilot Agent skill example included in this repository at `.github/skills/create-paper/SKILL.md`. You can install this skill globally so your AI agent can create new paper projects for you automatically using the `gh` CLI.
> 
> To install:
> - **In VS Code:** Click the **Gear icon** at the top of the Copilot chat > click **Skills** > select `~/.copilot/skills` > map it to a new skill named `create-paper` and paste the text from `SKILL.md`.
> - **Or via Terminal:** Just copy the `SKILL.md` file from this repository into your system's root `~/.copilot/skills/create-paper/` directory.
> 
> Once installed, you can simply open an empty folder in VS Code and type *"create-paper"* in the Copilot chat. The agent will execute the necessary steps for you. Details on Copilot skills can be found in the [GitHub documentation](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills).

### Step 1: Create your project

On GitHub, click the green **"Use this template"** button → **"Create a new repository"** → give it a name (e.g., `paper-defi-regulation-2026`) → clone it to your machine.

```bash
git clone https://github.com/YOUR_USERNAME/paper-defi-regulation-2026
cd paper-defi-regulation-2026
```

> **Why "Use this template" and not `git clone`?**
> `git clone` copies the entire Git history of *this* template repository and sets its `origin` remote to point here. Your paper is not a fork of this template — it is an independent project. "Use this template" gives you a clean repo with a single initial commit and no upstream relationship. If you must work offline, clone and then run `rm -rf .git && git init` to start fresh.

### Step 2: Run the setup wizard

```bash
./init-project.sh
```

The wizard asks you a few questions interactively:

```
  Paper title: Regulated DeFi on Public Blockchains
  Your name: Jane Doe
  Affiliation: University of Example
  Email: jane@example.edu
  Language: 1) en-GB (British English)  2) en-US (American English)
  Target journal: 1) lncs  2) ledger  3) frontiers  4) report
  MCP server host: localhost
  Zotero MCP port: 9180
  Google Scholar MCP port: 3847
```

It then automatically:
- Fills in `paper.yaml` with your answers
- Creates `paper.md` with YAML front-matter and section scaffolding
- Configures `.vscode/mcp.json` to connect to your Zotero and Scholar MCP servers
- Downloads standard CSL citation styles from the official repository
- Sets British or American English in the spell-checker
- Tests MCP server connectivity
- Initialises Git with an initial commit

### Step 3: Open in VS Code and start writing

```bash
code .
```

Everything is pre-configured. Open `paper.md` and write. Use Copilot Chat for research and reference management. When ready, build your PDF.

### Step 4: Describe your research context

Edit `.github/instructions/research.instructions.md` — write a paragraph about your research topic, thesis, and institutional context. This is the one file the wizard cannot fill for you; it guides the AI agent's understanding of your specific project.

---

## Daily Workflow

### Writing

Edit `paper.md` in VS Code. Use Pandoc-flavoured Markdown with citations:

```markdown
Blockchain technology was introduced by Nakamoto [@nakamoto2008].
Several studies confirm this finding [@smith2020; @jones2021].
```

The VS Code preview (with the bundled CSS) gives you a readable view while writing.

### Managing References

Talk to Copilot Chat — the AI agent follows the workflows defined in `.github/instructions/references-workflow.instructions.md`:

- *"Find papers about zero-knowledge proofs in DeFi"* → searches Google Scholar via MCP
- *"Add this paper to my Zotero library"* → creates the entry via Zotero MCP
- *"Check if I already have a paper by Buterin on account abstraction"* → searches your Zotero library
- *"Verify all my citations"* → runs the verification script

You never need to open the Zotero desktop application during writing. The AI agent handles all search, insert, and validation through the MCP protocol.

### Building PDFs

| What you want | Command |
|---|---|
| Build PDF (active target) | `make pdf` |
| Build for a specific journal | `make pdf TO=ledger` |
| Quick draft (skip ref check) | `make draft` |
| Switch active target permanently | `make switch TO=frontiers` |
| Verify citations only | `make verify` |
| Check URL health in bibliography | `make urls` |
| Sync bibliography from Zotero | `make sync` |

### Switching Journals

The same `paper.md` can produce a correctly formatted PDF for any configured journal. Switching is one command:

```bash
make switch TO=frontiers   # Changes one line in paper.yaml
make pdf                   # Builds with Frontiers formatting
```

If a paper is rejected from one journal and you resubmit to another, you change the target and rebuild. No reformatting, no new scripts, no manual LaTeX editing.

---

## What's Inside

```
.
├── paper.md                    # Your manuscript (Markdown + Pandoc citations)
├── paper.yaml                  # Single config: project metadata, active target, MCP servers
├── build.sh                    # Universal build script (reads paper.yaml)
├── init-project.sh             # Interactive first-run setup wizard
├── Makefile                    # Shortcuts: make pdf, make draft, make verify, etc.
│
├── refs/
│   └── bibliography.json       # CSL JSON bibliography (synced from Zotero)
│
├── styles/                     # Citation Style Language files
│   ├── lncs.csl               # Springer LNCS (downloaded during init)
│   ├── frontiers.csl          # Frontiers journals
│   └── ...                    # Add more from citation-style-language/styles
│
├── templates/                  # LaTeX headers per journal target
│   ├── lncs/header.tex        # Springer LNCS: 10pt, two-column
│   ├── ledger/header.tex      # Ledger Journal: Times, custom headings
│   ├── frontiers/header.tex   # Frontiers: Helvetica, single-column
│   └── report/header.tex      # Generic institutional report
│
├── scripts/
│   ├── verify_refs.py          # Check citations exist in bibliography
│   ├── check_urls.py           # Verify URLs in bibliography are alive
│   └── sync_bibliography.sh    # Sync bibliography from Zotero MCP
│
├── .vscode/
│   ├── settings.json           # Spell-check (en-GB/en-US), markdown config
│   ├── mcp.json                # Zotero + Google Scholar MCP connections
│   ├── extensions.json         # Recommended VS Code extensions
│   └── markdown-preview.css    # Academic-style markdown preview
│
└── .github/
    ├── copilot-instructions.md           # AI agent: main behaviour rules
    └── instructions/
        ├── research.instructions.md      # YOUR research context (edit per project)
        ├── academic-writing.instructions.md    # Writing standards (applied to all files)
        ├── pdf-build.instructions.md           # Build system rules
        ├── references-workflow.instructions.md  # 7-phase reference workflow
        └── fact-check-workflow.instructions.md  # Claim verification protocol
```

---

## Adding a New Journal Target

1. **Get the CSL style**: Download from [citation-style-language/styles](https://github.com/citation-style-language/styles) (10,000+ styles available) → save to `styles/newjournal.csl`
2. **Create a LaTeX header**: `templates/newjournal/header.tex` — define fonts, margins, heading styles to match the journal's author guidelines
3. **Register in `paper.yaml`**:
   ```yaml
   targets:
     newjournal:
       description: "New Journal of Science"
       csl: "styles/newjournal.csl"
       documentclass: article
       classoption: ""
       template: "templates/newjournal/header.tex"
       geometry: "a4paper,margin=2.5cm"
       fontsize: "11pt"
       extra_pandoc_args: []
   ```
4. Build: `make pdf TO=newjournal`

---

## Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| **VS Code** (or Cursor, Windsurf, etc.) | Editor + AI agent host | [code.visualstudio.com](https://code.visualstudio.com/) |
| **GitHub Copilot** | AI agent (Chat + agentic mode) | VS Code extension (subscription required) |
| **Pandoc** | Markdown → PDF conversion | `sudo apt install pandoc` or [pandoc.org](https://pandoc.org/) |
| **LaTeX** | PDF typesetting backend | `sudo apt install texlive-full` (or a smaller subset) |
| **Python 3 + PyYAML** | Scripts, config parsing | `pip install pyyaml` |
| **Zotero + Zotero MCP** | Cross-project reference library | [zotero.org](https://www.zotero.org/) + Docker MCP server |
| **Google Scholar MCP** | Literature discovery | Docker MCP server |

### MCP Infrastructure

The Zotero and Google Scholar MCP servers are persistent infrastructure — they run independently of any individual paper project (typically as Docker containers on a home server or local machine). They serve your entire reference library across all academic projects.

1. Run the Zotero MCP Docker container (exposes SSE endpoint on port 9180)
2. Run the Google Scholar MCP Docker container (exposes SSE endpoint on port 3847)
3. During `init-project.sh`, provide the hostname/IP of the machine running them

The `.vscode/mcp.json` in each project points to these servers. You can also set the `ACADEMIC_MCP_HOST` environment variable globally.

---

## Customisation

### Project-Specific Research Context
Edit `.github/instructions/research.instructions.md` to describe your research topic, thesis, methodology, and institutional context. This is the primary file that differentiates one project from another in terms of AI agent behaviour.

### Writing Rules
Edit `.github/instructions/academic-writing.instructions.md` to adjust:
- Language variant (en-GB / en-US)
- Tone and confidence level
- Citation requirements
- Formatting and structural preferences

### Custom Build Steps
For complex submissions (cover letters, title pages, custom layouts), extend `build.sh` or create a project-specific `build_submission.sh`.

---

## Architecture & Design Decisions

### Why Markdown?
- Version-control friendly (Git diffs are readable)
- AI-agent friendly (easy for LLMs to parse, search, and edit)
- Pandoc-convertible to PDF, DOCX, HTML, LaTeX, EPUB
- Renderable in VS Code preview while writing

### Why Zotero + MCP (not a simpler file-based approach)?
Zotero provides structured metadata (CSL JSON natively), DOI resolution, PDF attachment storage, browser connectors for manual saves, and — critically — cloud sync across machines via zotero.org. The MCP layer makes it AI-native: the agent searches, retrieves, and inserts references without you ever opening the Zotero GUI. A raw JSON file in Git would lack DOI resolution, PDF management, and cross-machine sync.

### Why `paper.yaml` instead of multiple shell scripts?
The previous workflow required a separate build script for each journal target. `paper.yaml` centralises all configuration into one file. Switching journals means editing one line, not duplicating and modifying shell scripts.

### File Format Pipeline

| Stage | Format | Why |
|-------|--------|-----|
| **Authoring** | Markdown (`.md`) | Version-control friendly, AI-parseable, Pandoc-convertible |
| **Bibliography** | CSL JSON (`.json`) | Standard format, Zotero-native, Pandoc-compatible |
| **Citation style** | CSL (`.csl`) | Standard XML, 10,000+ styles at [citation-style-language/styles](https://github.com/citation-style-language/styles) |
| **Typography** | LaTeX headers (`.tex`) | Fine-grained journal-specific formatting |
| **Output** | PDF | Universal academic submission format |

---

## For Contributors

This is an open-source project. Contributions — new journal templates, improved scripts, better agent workflows, documentation — are welcome.

### How to contribute

1. **Fork** this repository (not "Use this template" — you want the upstream relationship)
2. Create a feature branch: `git checkout -b feature/ieee-template`
3. Make your changes
4. Submit a Pull Request back to this repo

### Areas where contributions are especially useful

- **Journal templates**: LaTeX headers + CSL styles for journals you use (IEEE, Elsevier, ACM, Nature, etc.)
- **MCP server documentation**: Setup guides for different hosting environments (Docker Compose, cloud VPS, etc.)
- **Agent workflows**: Improved or new workflows for literature review, peer-review response drafting, etc.
- **Build system**: Support for additional output formats (DOCX for journal systems that require it, HTML for preprints)
- **Platform compatibility**: Testing and fixes for Cursor, Windsurf, Antigravity, or other VS Code forks

### Why fork, not clone?

If you intend to **contribute back** to the IADE template itself, fork the repo. This preserves the upstream relationship so you can submit pull requests. "Use this template" and `git clone` + reinit are for **consumers** starting a new paper — they deliberately sever the upstream link because a paper is an independent project, not a derivative of this template.

---

## Current Limitations

- **VS Code + GitHub Copilot only.** The AI agent instructions use GitHub Copilot's `.github/copilot-instructions.md` and `.github/instructions/*.md` convention. Other AI-augmented editors (Cursor, Windsurf, Google Antigravity / Firebase Studio) use different configuration formats (e.g., `.agent/rules/`, `.cursorrules`) and are not currently supported. Contributions adding multi-platform instruction support are welcome.
- **MCP servers required.** Full reference management requires Zotero MCP and Google Scholar MCP servers running and accessible from your machine.
- **LaTeX required.** PDF generation depends on a LaTeX distribution (texlive). Pandoc alone is insufficient for the typesetting quality expected by journals.

## Licence

MIT. Use freely, adapt for your projects, contribute back if you can.
