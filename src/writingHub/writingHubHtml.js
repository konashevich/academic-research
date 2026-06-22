"use strict";

const { escapeHtml } = require("../citationSearchPanel");
const { renderZoteroSetupGuide } = require("./zoteroSetupGuide");

function renderChecklist(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<p class="muted">Checks have not run yet.</p>`;
  }

  return `<ul class="checklist">${items
    .map((item) => {
      const state = item.ok ? "ok" : item.status === "failed" ? "warn" : item.status === "skipped" ? "muted" : "ok";
      const detail = item.detail || item.error ? `: ${escapeHtml(item.detail || item.error || "")}` : "";
      const label = item.label || item.path || item.step || "step";
      return `<li class="${state}"><span>${escapeHtml(label)}${detail}</span></li>`;
    })
    .join("")}</ul>`;
}

function renderHealthChecks(health) {
  if (!health) {
    return "";
  }

  const items = [
    { label: "Zotero MCP", ok: health.zotero?.ok, detail: health.zotero?.detail },
    { label: "Google Scholar MCP", ok: health.scholar?.ok, detail: health.scholar?.detail },
    { label: "OpenAlex", ok: health.openAlex?.ok, detail: health.openAlex?.detail }
  ];

  return renderChecklist(items);
}

function renderStepper(step, stepCount) {
  const labels = ["Welcome", "Infrastructure", "Project", "Deploy"];
  return `<nav class="stepper" aria-label="Setup progress">${labels
    .map((label, index) => {
      const state = index < step ? "done" : index === step ? "active" : "";
      return `<div class="step ${state}"><span class="dot">${index + 1}</span><span class="label">${label}</span></div>`;
    })
    .join("")}<div class="step-meta">${step + 1} / ${stepCount}</div></nav>`;
}

function renderWelcomeStep() {
  return `
    <section class="card">
      <h2>Academic writing, inside your editor</h2>
      <p>This extension helps you find citations, sync a Zotero library, and scaffold a paper project in your workspace.</p>
      <ul class="bullets">
        <li>About 2 minutes to connect Zotero (step-by-step guide on the next screen)</li>
        <li>Portable MCP services — no Docker required</li>
        <li>Deploy the bundled IADE paper template into this workspace</li>
      </ul>
      <div class="actions">
        <button class="primary" data-action="nextStep">Get started</button>
        <button data-action="skipToProject">Set up paper project only</button>
      </div>
    </section>`;
}

function renderInfrastructureStep(view) {
  const prerequisites = view.infra.prerequisites;
  const prereqItems = prerequisites?.checks || [];
  const apiKey = escapeHtml(view.credentials.apiKey || "");
  const libraryId = escapeHtml(view.credentials.libraryId || "");
  const cursorApiKey = escapeHtml(view.credentials.cursorApiKey || "");
  const busyAttr = view.busy ? "disabled" : "";
  const error = view.infra.lastError ? `<p class="warning">${escapeHtml(view.infra.lastError)}</p>` : "";
  const healthHtml = renderHealthChecks(view.infra.health);

  return `
    <section class="card">
      <h2>Infrastructure</h2>
      <p>Connect Zotero and start local search services on your machine.</p>
      ${renderZoteroSetupGuide()}
      ${error}
      <h3>Environment</h3>
      ${renderChecklist(prereqItems.map((item) => ({ label: item.label, ok: item.ok, detail: item.detail })))}
      <h3>Zotero credentials</h3>
      <p class="muted">Use the steps above, then fill in the fields here.</p>
      <div class="form-grid">
        <label>API key<input type="password" name="apiKey" value="${apiKey}" placeholder="24-character key" ${busyAttr} /></label>
        <label>Library ID<input type="text" name="libraryId" value="${libraryId}" placeholder="e.g. 14105076" ${busyAttr} /></label>
      </div>
      <h3>Cursor API key (citation relevance)</h3>
      <p class="muted">Optional. Used to filter search results with a local Cursor agent. Get a key from <a href="https://cursor.com/dashboard/integrations">Cursor Integrations</a>.</p>
      <div class="form-grid">
        <label>Cursor API key<input type="password" name="cursorApiKey" value="${cursorApiKey}" placeholder="cursor_..." ${busyAttr} /></label>
      </div>
      <div class="actions">
        <button data-action="detectLibraryId" ${busyAttr}>Detect library ID</button>
      </div>
      <div class="actions">
        <button data-action="checkEnvironment" ${busyAttr}>Re-check environment</button>
        <button class="primary" data-action="runSetup" ${busyAttr}>Install &amp; verify</button>
        <button data-action="openLogs" ${busyAttr}>Open logs</button>
      </div>
      <h3>Verification</h3>
      ${healthHtml || '<p class="muted">Run install &amp; verify to test services.</p>'}
      ${view.infra.setupComplete ? `<p class="muted">Google Scholar is best-effort; OpenAlex remains the stable external fallback.</p>` : ""}
      <div class="actions">
        <button data-action="prevStep" ${busyAttr}>Back</button>
        <button class="primary" data-action="nextStep" ${view.infra.setupComplete ? "" : "disabled"}>Continue</button>
        <button data-action="skipToProject" ${busyAttr}>Set up paper project without Zotero</button>
        ${view.infra.setupComplete ? `<button data-action="connectAiChat" ${busyAttr}>Connect to AI chat</button>` : ""}
      </div>
    </section>`;
}

function renderProfileOptions(profiles, selectedTarget) {
  return (profiles || [])
    .map((profile) => {
      const suffix = profile.bundled ? " (bundled)" : "";
      const selected = profile.id === selectedTarget ? "selected" : "";
      return `<option value="${escapeHtml(profile.id)}" ${selected}>${escapeHtml(profile.label)}${suffix}</option>`;
    })
    .join("");
}

function checked(name, components) {
  return components[name] ? "checked" : "";
}

function renderProjectStep(view) {
  const project = view.project || {};
  const components = view.components || {};
  const busyAttr = view.busy ? "disabled" : "";

  return `
    <section class="card">
      <h2>Project setup</h2>
      <p>Configure the paper that will be scaffolded into your current workspace.</p>
      <div class="form-grid two-col">
        <label>Paper title<input type="text" name="title" value="${escapeHtml(project.title || "")}" placeholder="Your paper title" ${busyAttr} required /></label>
        <label>Author name<input type="text" name="authorName" value="${escapeHtml(project.authorName || "")}" placeholder="First Author" ${busyAttr} required /></label>
        <label>Affiliation<input type="text" name="affiliation" value="${escapeHtml(project.affiliation || "")}" placeholder="University" ${busyAttr} /></label>
        <label>Email<input type="email" name="email" value="${escapeHtml(project.email || "")}" placeholder="author@example.edu" ${busyAttr} /></label>
        <label>Language
          <select name="language" ${busyAttr}>
            <option value="en-GB" ${project.language === "en-GB" ? "selected" : ""}>en-GB (British English)</option>
            <option value="en-US" ${project.language === "en-US" ? "selected" : ""}>en-US (American English)</option>
          </select>
        </label>
        <label>Initial target
          <select name="target" ${busyAttr}>
            ${renderProfileOptions(view.profiles, project.target)}
          </select>
        </label>
      </div>
      <label>Research context (optional)
        <textarea name="researchContext" rows="4" placeholder="Topic, claims, and constraints for AI assistants." ${busyAttr}>${escapeHtml(project.researchContext || "")}</textarea>
      </label>
      <details class="advanced">
        <summary>Advanced components</summary>
        <div class="toggle-grid">
          <label><input type="checkbox" name="component_manuscript" ${checked("manuscript", components)} ${busyAttr} /> Manuscript scaffold (paper.md)</label>
          <label><input type="checkbox" name="component_bibliography" ${checked("bibliography", components)} ${busyAttr} /> Empty bibliography</label>
          <label><input type="checkbox" name="component_makefile" ${checked("makefile", components)} ${busyAttr} /> Makefile &amp; build scripts</label>
          <label><input type="checkbox" name="component_instructions" ${checked("instructions", components)} ${busyAttr} /> AI instruction files</label>
          <label><input type="checkbox" name="component_vscode" ${checked("vscode", components)} ${busyAttr} /> VS Code MCP config</label>
          <label><input type="checkbox" name="component_csl" ${checked("csl", components)} ${busyAttr} /> Download CSL styles</label>
          <label><input type="checkbox" name="component_gitInit" ${checked("gitInit", components)} ${busyAttr} /> Git init + initial commit</label>
        </div>
      </details>
      <div class="actions">
        <button data-action="manageProfiles" ${busyAttr}>Manage profiles</button>
        <button data-action="prevStep" ${busyAttr}>Back</button>
        <button class="primary" data-action="nextStep" ${busyAttr}>Review &amp; deploy</button>
      </div>
    </section>`;
}

function renderDeployStep(view) {
  const deploy = view.deploy || {};
  const plan = deploy.plan;
  const busyAttr = view.busy ? "disabled" : "";
  const error = deploy.error ? `<p class="warning">${escapeHtml(deploy.error)}</p>` : "";

  let summary = '<p class="muted">Preparing deployment plan…</p>';
  if (plan) {
    const fileCount = (plan.create || []).length;
    const conflictCount = (plan.conflicts || []).length;
    summary = `
      <ul class="bullets">
        <li>Target: <strong>${escapeHtml(view.project.target || "lncs")}</strong></li>
        <li>Files to copy: ${fileCount}</li>
        <li>Conflicts (will skip): ${conflictCount}</li>
        <li>MCP: ${escapeHtml(
          view.infra.setupComplete
            ? view.infra.endpointsLabel || "from infrastructure"
            : "default ports (connect Zotero later for live MCP)"
        )}</li>
      </ul>`;
    if (conflictCount > 0) {
      const conflicts = plan.conflicts || [];
      const hasPaperYaml = conflicts.includes("paper.yaml");
      const hasPaperMd = conflicts.includes("paper.md");
      const hasTemplateConflicts = conflicts.some((item) => item !== "paper.yaml" && item !== "paper.md");

      summary += `<p class="warning">Some files already exist. Choose which ones to overwrite below.</p><div class="checkbox-grid">`;
      if (hasPaperYaml) {
        summary += `<label><input type="checkbox" name="overwritePaperYaml" ${deploy.overwritePaperYaml ? "checked" : ""} ${busyAttr} /> Overwrite paper.yaml</label>`;
      }
      if (hasPaperMd) {
        summary += `<label><input type="checkbox" name="overwritePaperMd" ${deploy.overwritePaperMd ? "checked" : ""} ${busyAttr} /> Overwrite paper.md</label>`;
      }
      if (hasTemplateConflicts) {
        summary += `<label><input type="checkbox" name="overwriteTemplateFiles" ${deploy.overwriteTemplateFiles ? "checked" : ""} ${busyAttr} /> Overwrite existing template files (${conflictCount - (hasPaperYaml ? 1 : 0) - (hasPaperMd ? 1 : 0)})</label>`;
      }
      summary += `</div>`;
    }
  }

  const warningsHtml = deploy.warnings?.length
    ? `<div class="warning"><h3>Warnings</h3><ul class="bullets">${deploy.warnings
        .map((warning) => `<li>${escapeHtml(warning)}</li>`)
        .join("")}</ul></div>`
    : "";

  const progressHtml = deploy.progress?.length
    ? `<h3>Progress</h3>${renderChecklist(
        deploy.progress.map((item) => ({
          label: item.path || item.step,
          status: item.status,
          detail: item.status
        }))
      )}`
    : "";

  const doneActions = deploy.done
    ? `<div class="actions">
        <button class="primary" data-action="openPaperMd">Open paper.md</button>
        <button data-action="continueWriting">Continue writing</button>
      </div>`
    : `<div class="actions">
        <button data-action="prevStep" ${busyAttr}>Back</button>
        <button class="primary" data-action="deployProject" ${busyAttr}>Deploy project</button>
      </div>`;

  const infraReady = view.infra?.setupComplete;
  const infraNote = infraReady
    ? ""
    : `<p class="muted">Zotero is not connected yet. The paper template will deploy with default MCP ports; citation search and bibliography sync will work after you complete the Infrastructure step.</p>`;

  return `
    <section class="card">
      <h2>Review &amp; deploy</h2>
      <p>Deploy the IADE paper template into your current workspace root.</p>
      ${infraNote}
      ${error}
      <h3>Summary</h3>
      ${summary}
      ${warningsHtml}
      ${progressHtml}
      ${doneActions}
    </section>`;
}

function renderWritingHubHtml({ nonce, view }) {
  const stepContent = view.step === "welcome"
    ? renderWelcomeStep()
    : view.step === "infrastructure"
      ? renderInfrastructureStep(view)
      : view.step === "project"
        ? renderProjectStep(view)
        : renderDeployStep(view);

  const status = view.infra.infraStatus ? `<div class="status-pill">${escapeHtml(view.infra.infraStatus)}</div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Academic Writing Hub</title>
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
      --warn: var(--vscode-inputValidation-warningForeground, #c28b00);
      --ok: var(--vscode-testing-iconPassed, #3fb950);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: var(--surface);
    }
    main { max-width: 920px; margin: 0 auto; padding: 24px 28px 40px; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
    h1 { margin: 0; font-size: 22px; }
    h2 { margin: 0 0 10px; font-size: 18px; }
    h3 { margin: 18px 0 8px; font-size: 14px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
    p, li { line-height: 1.5; }
    .muted { color: var(--muted); }
    .warning { color: var(--warn); }
    .card {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 18px 20px;
      background: color-mix(in srgb, var(--subtle) 40%, transparent);
    }
    .stepper {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
      gap: 10px;
      align-items: center;
      margin-bottom: 18px;
    }
    .step { display: flex; align-items: center; gap: 8px; color: var(--muted); }
    .step.active, .step.done { color: var(--vscode-editor-foreground); }
    .dot {
      width: 24px; height: 24px; border-radius: 999px; border: 1px solid var(--border);
      display: inline-flex; align-items: center; justify-content: center; font-size: 12px;
    }
    .step.active .dot, .step.done .dot { background: var(--accent); color: var(--accent-text); border-color: transparent; }
    .step-meta { color: var(--muted); font-size: 12px; white-space: nowrap; }
    .status-pill {
      border: 1px solid var(--border); border-radius: 999px; padding: 4px 10px; font-size: 12px; color: var(--muted);
    }
    .bullets { margin: 12px 0 0; padding-left: 20px; }
    .checklist { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .checklist li { display: flex; gap: 8px; align-items: baseline; }
    .checklist li::before { content: "•"; color: var(--muted); }
    .checklist li.ok::before { content: "✓"; color: var(--ok); }
    .checklist li.warn::before { content: "!"; color: var(--warn); }
    .form-grid { display: grid; gap: 12px; margin-top: 10px; }
    .form-grid.two-col { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    label { display: grid; gap: 6px; font-size: 12px; color: var(--muted); }
    input, select, textarea {
      font: inherit; color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--border); border-radius: 4px; padding: 8px 10px;
    }
    textarea { resize: vertical; min-height: 88px; }
    .toggle-grid { display: grid; gap: 8px; margin-top: 10px; }
    .toggle-grid label { display: flex; align-items: center; gap: 8px; }
    .advanced { margin-top: 14px; }
    .advanced summary { cursor: pointer; color: var(--muted); }
    .setup-guide {
      margin: 14px 0 18px;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 14px;
      background: color-mix(in srgb, var(--subtle) 55%, transparent);
    }
    .setup-guide summary {
      cursor: pointer;
      font-weight: 600;
      color: var(--vscode-editor-foreground);
    }
    .setup-guide-body { margin-top: 10px; }
    .setup-steps {
      margin: 10px 0 0;
      padding-left: 22px;
      display: grid;
      gap: 10px;
    }
    .setup-steps li { line-height: 1.45; }
    .setup-note { margin: 12px 0 0; font-size: 12px; }
    code {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.92em;
      padding: 1px 4px;
      border-radius: 3px;
      background: color-mix(in srgb, var(--subtle) 70%, transparent);
    }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    button {
      border: 1px solid var(--border); border-radius: 4px; padding: 7px 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground); font: inherit; cursor: pointer;
    }
    button:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button:disabled { opacity: 0.55; cursor: wait; }
    button.primary { background: var(--accent); color: var(--accent-text); border-color: transparent; }
    button.primary:hover { background: var(--hover); }
    a { color: var(--vscode-textLink-foreground); }
    @media (max-width: 720px) {
      .form-grid.two-col { grid-template-columns: 1fr; }
      .stepper { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Academic Writing Hub</h1>
      ${status}
    </header>
    ${renderStepper(view.stepIndex, view.stepCount)}
    ${stepContent}
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let busy = ${view.busy ? "true" : "false"};
    function setBusy(next) {
      busy = next;
      document.querySelectorAll("button, input, select, textarea").forEach((element) => {
        if (element.type !== "checkbox") {
          element.disabled = next;
        }
      });
    }
    function fieldValues() {
      const values = {};
      for (const name of ["apiKey", "libraryId", "cursorApiKey", "title", "authorName", "affiliation", "email", "language", "target", "researchContext"]) {
        const field = document.querySelector('[name="' + name + '"]');
        if (field) values[name] = field.value;
      }
      const components = {};
      for (const key of ["manuscript", "bibliography", "makefile", "instructions", "vscode", "csl", "gitInit"]) {
        const checkbox = document.querySelector('[name="component_' + key + '"]');
        if (checkbox) components[key] = checkbox.checked;
      }
      values.components = components;
      const overwritePaperYaml = document.querySelector('[name="overwritePaperYaml"]');
      values.overwritePaperYaml = overwritePaperYaml ? overwritePaperYaml.checked : false;
      const overwritePaperMd = document.querySelector('[name="overwritePaperMd"]');
      values.overwritePaperMd = overwritePaperMd ? overwritePaperMd.checked : false;
      const overwriteTemplateFiles = document.querySelector('[name="overwriteTemplateFiles"]');
      values.overwriteTemplateFiles = overwriteTemplateFiles ? overwriteTemplateFiles.checked : false;
      return values;
    }
    window.addEventListener("message", (event) => {
      const data = event.data || {};
      if (data.type === "hubState") {
        setBusy(Boolean(data.busy));
      }
      if (data.type === "hubComplete") {
        setBusy(false);
      }
    });
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button || busy) return;
      const action = button.dataset.action;
      if (["runSetup", "checkEnvironment", "detectLibraryId", "connectAiChat", "deployProject"].includes(action)) {
        setBusy(true);
      }
      vscode.postMessage({ type: "hubAction", action, ...fieldValues() });
    });
    document.addEventListener("change", (event) => {
      const field = event.target;
      if (!field || !field.name) {
        return;
      }
      if (field.name === "cursorApiKey") {
        vscode.postMessage({ type: "hubAction", action: "saveCursorApiKey", cursorApiKey: field.value });
        return;
      }
      if (field.name.startsWith("overwrite")) {
        vscode.postMessage({ type: "hubAction", action: "refreshDeployPlan", ...fieldValues() });
      }
    });
  </script>
</body>
</html>`;
}

module.exports = {
  renderWritingHubHtml
};
