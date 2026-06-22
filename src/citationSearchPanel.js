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

function renderProviderStatus(status) {
  const state = status.skipped ? "skipped" : status.ok ? "ok" : "warn";
  const detail = status.detail ? `: ${status.detail}` : "";
  return `<span class="${state}">${escapeHtml(status.label)}${escapeHtml(detail)}</span>`;
}

const ACTION_DESCRIPTIONS = {
  importInsert: "Add this paper to Zotero, sync the bibliography, and insert a citation at the cursor.",
  insert: "Insert a citation from the existing bibliography entry at the cursor.",
  syncInsert: "Sync the bibliography from Zotero, then insert a citation at the cursor.",
  register: "Save this claim and candidate source to the reference register for later review.",
  open: "Open the paper in your default browser.",
  copyDoi: "Copy the DOI to your clipboard."
};

const INFO_ICON_SVG = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 7.25v3.5M8 5.25h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

function renderActionButton(label, action, index, options = {}) {
  const description = ACTION_DESCRIPTIONS[action] || "";
  const primaryClass = options.primary ? ' class="primary"' : "";
  const section = options.section ? ` data-section="${options.section}"` : "";
  const infoIcon = description
    ? `<span class="info-icon" tabindex="0" role="button" aria-label="${escapeHtml(description)}" data-tooltip="${escapeHtml(description)}">${INFO_ICON_SVG}</span>`
    : "";

  return `<div class="action-item">
    <button${primaryClass} data-action="${action}" data-index="${index}"${section}>${escapeHtml(label)}</button>
    ${infoIcon}
  </div>`;
}

function renderResult(result, index, options) {
  const meta = [
    formatAuthors(result.authors),
    result.year,
    result.venue
  ].filter(Boolean).join(" | ");
  const badges = [
    result.source,
    result.agentVerdict === "unranked" ? "Unranked" : "",
    Number.isFinite(result.agentScore) ? `Relevance ${result.agentScore}` : "",
    result.agentVerdict && !["weak", "unranked"].includes(result.agentVerdict) ? result.agentVerdict : "",
    result.alreadyInBibliography ? "In bibliography" : "",
    result.alreadyInZotero ? "In Zotero" : "",
    result.doi ? "DOI" : "",
    result.openAccess ? "Open access" : "",
    Number.isFinite(result.citationCount) && result.citationCount > 0 ? `${result.citationCount} citations` : ""
  ].filter(Boolean);
  const abstract = truncateText(result.abstract || "");
  const agentReason = result.agentReason ? `<p class="agent-reason">${escapeHtml(result.agentReason)}</p>` : "";
  const dropped = Boolean(options.dropped);
  const section = options.section || "main";
  const canImport = options.canImportToZotero && result.canImport !== false && !dropped;
  const primaryAction = dropped
    ? (result.alreadyInBibliography && result.citekey
      ? renderActionButton("Insert", "insert", index, { primary: true, section })
      : result.alreadyInZotero && result.citekey
        ? renderActionButton("Sync + Insert", "syncInsert", index, { primary: true, section })
        : renderActionButton("Register", "register", index, { primary: true, section }))
    : result.alreadyInBibliography && result.citekey
      ? renderActionButton("Insert", "insert", index, { primary: true, section })
      : result.alreadyInZotero && result.citekey
        ? renderActionButton("Sync + Insert", "syncInsert", index, { primary: true, section })
        : canImport
          ? renderActionButton("Import + Insert", "importInsert", index, { primary: true, section })
          : renderActionButton("Register", "register", index, { primary: true, section });
  const qualityWarning = !dropped && !result.alreadyInBibliography && !result.alreadyInZotero && !canImport && result.metadataQuality && result.metadataQuality.reasons.length
    ? `<p class="warning">Import disabled: ${escapeHtml(result.metadataQuality.reasons.join(", "))}.</p>`
    : "";

  return `
    <article class="result ${providerClass(result.source)}${dropped ? " dropped" : ""}">
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
      ${agentReason}
      <dl>
        ${result.citekey ? `<div><dt>Citekey</dt><dd>@${escapeHtml(result.citekey)}</dd></div>` : ""}
        ${result.doi ? `<div><dt>DOI</dt><dd>${escapeHtml(result.doi)}</dd></div>` : ""}
        ${result.url ? `<div><dt>URL</dt><dd>${escapeHtml(result.url)}</dd></div>` : ""}
      </dl>
      ${qualityWarning}
      <div class="actions">
        ${primaryAction}
        ${dropped || primaryAction.includes('data-action="register"') ? "" : renderActionButton("Register", "register", index, { section })}
        ${result.url ? renderActionButton("Open", "open", index, { section }) : ""}
        ${result.doi ? renderActionButton("Copy DOI", "copyDoi", index, { section }) : ""}
      </div>
    </article>
  `;
}

function renderCitationSearchHtml({
  nonce,
  sessionId = "",
  claim,
  results,
  droppedResults = [],
  expandDropped = false,
  canImportToZotero = true,
  providerStatuses = []
}) {
  const safeClaim = escapeHtml(truncateText(claim, 900));
  const resultCount = results.length;
  const droppedCount = droppedResults.length;
  const providerStatusHtml = providerStatuses.length
    ? `<div class="provider-status">${providerStatuses.map(renderProviderStatus).join("")}</div>`
    : "";
  const allFilteredHint = resultCount === 0 && droppedCount > 0
    ? `<p class="warning">All candidates were filtered as low relevance. Review hidden results below or narrow your claim.</p>`
    : "";
  const droppedSection = droppedCount
    ? `<section class="dropped-section">
      <button type="button" class="dropped-toggle" id="dropped-toggle" aria-expanded="${expandDropped ? "true" : "false"}">
        Hidden by agent (${droppedCount})
      </button>
      <div class="dropped-panel${expandDropped ? " open" : ""}" id="dropped-panel">
        ${droppedResults.map((result, index) => renderResult(result, index, {
          canImportToZotero,
          dropped: true,
          section: "dropped"
        })).join("")}
      </div>
    </section>`
    : "";

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
      align-items: center;
    }
    .action-item {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .info-icon {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      color: var(--muted);
      cursor: help;
      outline: none;
    }
    .info-icon:hover,
    .info-icon:focus-visible {
      color: var(--vscode-editor-foreground);
      background: color-mix(in srgb, var(--border) 45%, transparent);
    }
    .info-icon::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      width: max-content;
      max-width: 240px;
      padding: 8px 10px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--vscode-editorHoverWidget-background, var(--surface));
      color: var(--vscode-editorHoverWidget-foreground, var(--vscode-editor-foreground));
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
      font-size: 12px;
      line-height: 1.4;
      text-align: left;
      white-space: normal;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.12s ease;
      z-index: 2;
    }
    .info-icon:hover::after,
    .info-icon:focus-visible::after {
      opacity: 1;
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
    .warning {
      margin: 12px 0 0;
      color: var(--vscode-inputValidation-warningForeground, var(--muted));
    }
    .provider-status {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 12px;
    }
    .provider-status span {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 2px 8px;
      color: var(--muted);
      font-size: 11px;
    }
    .provider-status span.warn {
      color: var(--vscode-inputValidation-warningForeground, var(--muted));
    }
    .provider-status span.skipped {
      color: var(--muted);
    }
    .agent-reason {
      margin: 10px 0 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }
    .dropped-section {
      margin-top: 24px;
      border-top: 1px solid var(--border);
      padding-top: 16px;
    }
    .dropped-toggle {
      width: 100%;
      text-align: left;
      font-weight: 600;
    }
    .dropped-panel {
      display: none;
      margin-top: 12px;
    }
    .dropped-panel.open {
      display: block;
    }
    .result.dropped {
      opacity: 0.92;
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
      ${providerStatusHtml}
      ${allFilteredHint}
    </header>
    ${results.length ? results.map((result, index) => renderResult(result, index, { canImportToZotero })).join("") : `<section class="empty">
      <p>No citation candidates found.</p>
      <div class="actions">
        <button class="primary" data-action="registerClaim">Register Claim</button>
      </div>
    </section>`}
    ${droppedSection}
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let pending = false;
    const droppedToggle = document.getElementById("dropped-toggle");
    const droppedPanel = document.getElementById("dropped-panel");
    if (droppedToggle && droppedPanel) {
      droppedToggle.addEventListener("click", () => {
        const open = droppedPanel.classList.toggle("open");
        droppedToggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
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
        sessionId: ${JSON.stringify(sessionId)},
        action: button.dataset.action,
        index: Number(button.dataset.index),
        section: button.dataset.section || "main"
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
