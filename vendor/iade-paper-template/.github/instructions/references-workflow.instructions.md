---
applyTo: '**'
---

# AI-Assisted Academic Reference Workflow

This workflow defines the complete process for turning a raw draft into a fully cited academic paper using AI agents, Google Scholar MCP, and Zotero MCP.

## Phase 1: Critical Analysis & Gap Identification
**Goal:** Identify where citations are needed.

1. **AI Analysis**: The agent critically analyses the text and inserts placeholder tags (e.g., `[@ref1]`, `[@ref2]`) where statements require evidentiary support.
2. **Manual Review**: The user reviews the suggestions — adding, removing, or editing placeholders.

## Phase 2: Building the Register of References
**Goal:** Create a structured list of what needs to be found.

1. **Create Table**: The agent generates a Markdown table (the "Register") listing each placeholder and describing the specific topic or claim that needs support.
2. **Prioritise**: Mark which references are critical (core argument) vs. supplementary.

## Phase 3: Source Discovery
**Goal:** Find real-world evidence.

1. **AI Search**: The agent uses **Google Scholar MCP** and **web search** to find:
   - Peer-reviewed academic papers (primary targets)
   - Institutional reports and whitepapers
   - Credible technical sources
2. **Fill Register**: The agent populates the Register table with Title, DOI/URL, and relevance notes for each placeholder.

## Phase 4: Validation & Hygiene
**Goal:** Ensure source quality before import.

1. **Link Checking**: Verify that URLs/DOIs resolve (use `scripts/check_urls.py` for batch checking).
2. **Relevance Check**: Discard sources that do not directly support the claim.
3. **Deduplication**: If an item has multiple links, select the canonical URL or DOI.
4. **Quality filter**: Prefer peer-reviewed publications over blog posts or news articles.

## Phase 5: Zotero Integration
**Goal:** Move from links to structured bibliographic records.

1. **Library Check (CRITICAL)**: The agent MUST search the existing Zotero library (via Title/DOI using Zotero MCP) to check if the item already exists.
   - **If exists**: Use the existing Zotero key.
   - **If missing**: Use Zotero MCP to create a new item with full metadata (authors, date, publisher, DOI, URL). Record the new Zotero key.
2. **Full Metadata**: Every imported item must have: title, authors, date, publication venue, DOI (if available).

## Phase 6: The Rewiring
**Goal:** Connect the manuscript to the bibliography database.

1. **Mapping**: Create a map: `Placeholder ID` (`[@ref1]`) → `Final Zotero Key` (`[@QU8VKVB6]`).
2. **Execute Replacement**: Replace all placeholders in the manuscript with their Zotero-based citekeys.
3. **Sync Bibliography**: Run `make sync` to export the latest Zotero library to `refs/bibliography.json`.

## Phase 7: Production & Verification
**Goal:** Final output with verified citations.

1. **Verify**: Run `make verify` to confirm all citations resolve against the bibliography.
2. **Build**: Run `make pdf` to generate the final PDF with the correct journal style.
3. **Review**: Check that all in-text citations render correctly in the PDF output.
