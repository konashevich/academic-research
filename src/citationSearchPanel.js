"use strict";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateText(value, maxLength = 620) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function formatAuthors(authors) {
  if (!Array.isArray(authors) || !authors.length) {
    return "";
  }
  const visible = authors.slice(0, 4).join(", ");
  return authors.length > 4 ? `${visible} et al.` : visible;
}

function providerClass(source) {
  return String(source || "source")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "source";
}

function renderResult(result, index, options) {
  const meta = [
    formatAuthors(result.authors),
    result.year,
    result.venue
  ].filter(Boolean).join(" | ");
  const badges = [
    result.source,
    result.alreadyInBibliography ? "In bibliography" : "",
    result.alreadyInZotero ? "In Zotero" : "",
    result.doi ? "DOI" : "",
    result.openAccess ? "Open access" : "",
    Number.isFinite(result.citationCount) && result.citationCount > 0 ? `${result.citationCount} citations` : ""
  ].filter(Boolean);
  const abstract = truncateText(result.abstract || "");
  const primaryAction = result.alreadyInBibliography && result.citekey
    ? `<button class="primary" data-action="insert" data-index="${index}">Insert</button>`
    : result.alreadyInZotero && result.citekey
      ? `<button class="primary" data-action="syncInsert" data-index="${index}">Sync + Insert</button>`
      : options.canImportToZotero
        ? `<button class="primary" data-action="importInsert" data-index="${index}">Import + Insert</button>`
        : `<button class="primary" data-action="register" data-index="${index}">Register</button>`;

  return `
    <article class="result ${providerClass(result.source)}">
      <div class="result-head">
        <div>
          <h2>${escapeHtml(result.title || "(untitled source)")}</h2>
          ${meta ? `<p class="meta">${escapeHtml(meta)}</p>` : ""}
        </div>
        <div class="badges">
          ${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}
        </div>
      </div>
      ${abstract ? `<p class="abstract">${escapeHtml(abstract)}</p>` : ""}
      <dl>
        ${result.citekey ? `<div><dt>Citekey</dt><dd>@${escapeHtml(result.citekey)}</dd></div>` : ""}
        ${result.doi ? `<div><dt>DOI</dt><dd>${escapeHtml(result.doi)}</dd></div>` : ""}
        ${result.url ? `<div><dt>URL</dt><dd>${escapeHtml(result.url)}</dd></div>` : ""}
      </dl>
      <div class="actions">
        ${primaryAction}
        ${primaryAction.includes('data-action="register"') ? "" : `<button data-action="register" data-index="${index}">Register</button>`}
        ${result.url ? `<button data-action="open" data-index="${index}">Open</button>` : ""}
        ${result.doi ? `<button data-action="copyDoi" data-index="${index}">Copy DOI</button>` : ""}
      </div>
    </article>
  `;
}

function renderCitationSearchHtml({ nonce, claim, results, canImportToZotero = true }) {
  const safeClaim = escapeHtml(truncateText(claim, 900));
  const resultCount = results.length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Citation Search</title>
  <style>
    :root {
      color-scheme: light dark;
      --border: var(--vscode-panel-border, rgba(127, 127, 127, 0.35));
      --muted: var(--vscode-descriptionForeground);
      --surface: var(--vscode-editor-background);
      --subtle: var(--vscode-sideBar-background);
      --accent: var(--vscode-button-background);
      --accent-text: var(--vscode-button-foreground);
      --hover: var(--vscode-button-hoverBackground);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      color: var(--vscode-editor-foreground);
      background: var(--surface);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    main {
      max-width: 1120px;
      margin: 0 auto;
      padding: 24px 28px 36px;
    }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
      margin-bottom: 18px;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 20px;
      font-weight: 650;
    }
    .claim {
      margin: 0;
      max-width: 92ch;
      color: var(--muted);
      line-height: 1.45;
    }
    .count {
      margin-top: 12px;
      color: var(--muted);
      font-size: 12px;
    }
    .result {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 16px;
      margin: 14px 0;
      background: color-mix(in srgb, var(--subtle) 42%, transparent);
    }
    .result-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: start;
    }
    h2 {
      margin: 0;
      font-size: 16px;
      line-height: 1.35;
      font-weight: 650;
    }
    .meta, .abstract {
      line-height: 1.45;
    }
    .meta {
      margin: 6px 0 0;
      color: var(--muted);
    }
    .abstract {
      margin: 14px 0 0;
    }
    .badges {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 6px;
      max-width: 360px;
    }
    .badges span {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 2px 8px;
      color: var(--muted);
      font-size: 11px;
      white-space: nowrap;
    }
    dl {
      display: grid;
      gap: 6px;
      margin: 14px 0 0;
    }
    dl div {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr);
      gap: 10px;
    }
    dt {
      color: var(--muted);
      font-size: 12px;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }
    button {
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 6px 10px;
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      font: inherit;
      cursor: pointer;
    }
    button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    button:disabled {
      cursor: wait;
      opacity: 0.62;
    }
    button.primary {
      border-color: transparent;
      color: var(--accent-text);
      background: var(--accent);
    }
    button.primary:hover {
      background: var(--hover);
    }
    .empty {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 18px;
      color: var(--muted);
      background: color-mix(in srgb, var(--subtle) 42%, transparent);
    }
    @media (max-width: 720px) {
      main { padding: 18px; }
      .result-head { grid-template-columns: 1fr; }
      .badges { justify-content: flex-start; }
      dl div { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Evidence Review</h1>
      <p class="claim">${safeClaim}</p>
      <div class="count">${resultCount} candidate${resultCount === 1 ? "" : "s"}</div>
    </header>
    ${results.length ? results.map((result, index) => renderResult(result, index, { canImportToZotero })).join("") : `<section class="empty">
      <p>No citation candidates found.</p>
      <div class="actions">
        <button class="primary" data-action="registerClaim">Register Claim</button>
      </div>
    </section>`}
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let pending = false;
    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "actionComplete") {
        pending = false;
        document.querySelectorAll("button").forEach((item) => {
          item.disabled = false;
        });
      }
    });
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button || pending) {
        return;
      }
      if (!["open", "copyDoi"].includes(button.dataset.action)) {
        pending = true;
        document.querySelectorAll("button").forEach((item) => {
          item.disabled = true;
        });
      }
      vscode.postMessage({
        type: "action",
        action: button.dataset.action,
        index: Number(button.dataset.index)
      });
    });
  </script>
</body>
</html>`;
}

module.exports = {
  escapeHtml,
  renderCitationSearchHtml,
  truncateText
};
