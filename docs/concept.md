# Product Specification (draft concept): Academic Citation Assistant (VS Code Extension)

## 1. Overview
The Academic Citation Assistant is a custom Visual Studio Code extension designed to streamline the academic writing and research process. By combining Large Language Models (LLMs) with robust academic database APIs, the extension helps researchers find, verify, and insert citations directly within their editor.

It supports two primary workflows:
1. **Manual Selection-Search:** A user-driven approach to search for literature based on highlighted text.
2. **Automatic Claim Analysis:** An AI-driven proactive approach that scans the document to identify unsupported claims and suggests relevant citations, effectively acting as an academic "fact and citation checker."

---

## 2. Core Workflows

### 2.1. Approach A: Manual Selection-Search (The "Draft" Approach)
This workflow allows the user to maintain tight control over the research process, searching for specific concepts as they write.

* **Trigger:** The user highlights a block of text and triggers the command via a keyboard shortcut or the context menu.
* **Processing Mechanism:**
    1. The extension sends the selected text to an LLM.
    2. The LLM extracts core semantic concepts, entities, and keywords, formatting them into an optimised search query.
    3. The extension queries the selected academic databases.
* **UI/Output:**
    * Results are displayed in a native VS Code Webview sidebar panel.
    * Each result displays the Title, Authors, Year, Abstract snippet, Citation Count, and Open Access status.
    * **Action Buttons:**
        * *Insert Citation:* Instantly inserts a BibTeX, APA, or Markdown-formatted citation at the cursor.
        * *Add to Draft:* Saves the metadata and abstract to a dedicated `research_drafts.md` file within the workspace for later review.

### 2.2. Approach B: Automatic Full-Document Claim Analysis
This workflow acts as an automated peer-reviewer, identifying areas where the author has made factual claims or assertions that lack proper attribution.

* **Trigger:** The user clicks a "Run Citation Analysis" button in the status bar or executes a command palette action.
* **Processing Mechanism:**
    1. **Chunking:** The extension reads the active document and splits it into logical chunks using regular expressions (e.g., double line breaks) and token limits. Overlapping windows ensure no context is lost between chunks.
    2. **LLM Claim Detection:** Each chunk is processed by the LLM to identify factual claims requiring academic citations, explicitly ignoring claims already mapped to local citations in the established knowledge graph.
    3. **Highlighting:** The extension uses the VS Code `DiagnosticCollection` API. Unsupported claims are highlighted with a distinct underline.
* **UI/Output:**
    * Hovering over the underlined claim reveals a VS Code Hover widget recommending a citation.
    * A Quick Fix offers to search for supporting literature.
    * Clicking the Quick Fix triggers the Search Mechanism using LLM-generated keywords.

---

## 3. Recommended Academic Databases & Search Mechanisms

### 3.1. OpenAlex API (Primary)
* **Rationale:** Free, requires no subscription, offers advanced filtering, semantic search, and direct access to Open Access PDFs.
* **Mechanism:**
    * Utilise the `/works` endpoint.
    * Implement query parameter: `search=LLM_extracted_keywords`.
    * Apply filters: `filter=has_abstract:true,publication_year:>2010`.

### 3.2. Semantic Scholar Academic Graph (S2AG) API (Secondary)
* **Rationale:** Optimised for AI applications, providing excellent relevance ranking and influential citation metrics.
* **Mechanism:**
    * Utilise the `/graph/v1/paper/search/bulk` or `/search` endpoints.
    * Beneficial for traversing the research graph to find papers citing a foundational paper.

---

## 4. Technical Architecture

* **Language Framework:** Plain JavaScript / Node.js using the `vscode-extension-api`. JSDoc comments can be utilised for type checking without a compilation step.
* **LLM Integration:** Hook into the native VS Code Copilot Chat Extension API (`vscode.lm`) or allow users to input their own API keys.
* **Data Fetcher:** An asynchronous REST client (using native `fetch` or `axios`) to query OpenAlex and Semantic Scholar.
* **State Management:** Use VS Code `workspaceState` to cache search results.
* **Local Knowledge Graph:** Utilise an embedded, serverless database (such as SQLite via Wasm or IndexedDB) to maintain a graph of concepts, entities, and their corresponding citations for the active project to prevent redundant analysis.

---

## 5. User Experience (UX) Considerations

1. **Non-Intrusive Diagnostics:** Diagnostics must update asynchronously (debounced) only after the user stops typing.
2. **Drafting File Structure:** Ensure `research_drafts.md` is formatted cleanly for easy LLM parsing.
3. **Citation Styles:** Support dynamic generation of inline citations based on the document type.