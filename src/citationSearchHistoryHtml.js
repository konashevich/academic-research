"use strict";

const { escapeHtml, truncateText } = require("./citationSearchPanel");

function formatTimestamp(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function renderHistoryItem(batch) {
  const claim = escapeHtml(truncateText(batch.claim || batch.queryText || "(no claim)", 140));
  const when = escapeHtml(formatTimestamp(batch.createdAt));
  const resultCount = Number.isFinite(batch.resultCount) ? batch.resultCount : 0;
  const droppedCount = Number.isFinite(batch.droppedCount) ? batch.droppedCount : 0;
  const countLabel = droppedCount > 0
    ? `${resultCount} shown, ${droppedCount} hidden`
    : `${resultCount} candidate${resultCount === 1 ? "" : "s"}`;

  return `
    <article class="batch" data-id="${escapeHtml(batch.id)}">
      <button type="button" class="batch-open" data-action="open" data-id="${escapeHtml(batch.id)}">
        <span class="batch-claim">${claim}</span>
        <span class="batch-meta">${when} · ${escapeHtml(countLabel)}</span>
      </button>
      <button type="button" class="batch-delete" data-action="delete" data-id="${escapeHtml(batch.id)}" aria-label="Delete search">Delete</button>
    </article>
  `;
}

function renderCitationSearchHistoryHtml({ nonce, batches = [], projectLabel = "" }) {
  const header = projectLabel
    ? `<p class="scope">${escapeHtml(projectLabel)}</p>`
    : "";
  const body = batches.length
    ? batches.map(renderHistoryItem).join("")
    : `<section class="empty">
        <p>No saved citation searches yet.</p>
        <p class="hint">Select text in your manuscript and run Find Citation for Selection.</p>
      </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Citation Searches</title>
  <style>
    :root {
      color-scheme: light dark;
      --border: var(--vscode-panel-border, rgba(127, 127, 127, 0.35));
      --muted: var(--vscode-descriptionForeground);
      --surface: var(--vscode-sideBar-background);
      --hover: var(--vscode-list-hoverBackground);
      --danger: var(--vscode-errorForeground);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px;
      color: var(--vscode-sideBar-foreground);
      background: var(--surface);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .scope {
      margin: 0 0 12px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.4;
    }
    .batch {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px;
      align-items: stretch;
      margin-bottom: 8px;
    }
    .batch-open {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 12px;
      text-align: left;
      background: color-mix(in srgb, var(--surface) 80%, var(--vscode-editor-background));
      color: inherit;
      cursor: pointer;
      font: inherit;
    }
    .batch-open:hover,
    .batch-open:focus-visible {
      background: var(--hover);
      outline: none;
    }
    .batch-claim {
      display: block;
      line-height: 1.4;
      font-weight: 600;
    }
    .batch-meta {
      display: block;
      margin-top: 6px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.35;
    }
    .batch-delete {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0 10px;
      color: var(--danger);
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      white-space: nowrap;
    }
    .batch-delete:hover {
      background: color-mix(in srgb, var(--danger) 12%, transparent);
    }
    .empty {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 14px;
      color: var(--muted);
      line-height: 1.45;
    }
    .hint {
      margin: 10px 0 0;
      font-size: 12px;
    }
  </style>
</head>
<body>
  ${header}
  ${body}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }
      vscode.postMessage({
        type: "historyAction",
        action: button.dataset.action,
        id: button.dataset.id
      });
    });
  </script>
</body>
</html>`;
}

module.exports = {
  renderCitationSearchHistoryHtml,
  formatTimestamp
};
