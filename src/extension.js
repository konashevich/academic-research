"use strict";

const path = require("path");
const childProcess = require("child_process");
const vscode = require("vscode");

const { detectAcademicProject } = require("./projectDetector");
const { loadBibliography, searchBibliography } = require("./bibliographyIndex");
const { findCitationIssues } = require("./citationDiagnostics");
const { planCitationInsertion } = require("./citationInsertion");
const { appendRegisterEntry } = require("./registerStore");
const { searchOpenAlex } = require("./openAlexClient");
const { ZoteroMcpClient } = require("./zoteroMcpClient");
const { ScholarMcpClient } = require("./scholarMcpClient");

let diagnostics;
let statusBarItem;
let statusProvider;
let outputChannel;

class ProjectStatusProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.project = null;
    this.bibliographyCount = 0;
    this.lastVerification = "not run";
  }

  refresh(project, bibliographyCount, lastVerification) {
    this.project = project;
    this.bibliographyCount = bibliographyCount ?? this.bibliographyCount;
    this.lastVerification = lastVerification || this.lastVerification;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(item) {
    return item;
  }

  getChildren() {
    if (!this.project || !this.project.found) {
      return [
        treeItem("Mode", "Generic Markdown"),
        treeItem("Status", this.project ? this.project.reason : "No workspace detected")
      ];
    }

    const config = this.project.config;
    const activeTarget = config.activeTarget || {};

    return [
      treeItem("Mode", "Template-aware"),
      treeItem("Manuscript", path.relative(this.project.rootDir, this.project.paths.manuscript)),
      treeItem("Bibliography", path.relative(this.project.rootDir, this.project.paths.bibliography)),
      treeItem("Target", config.target || "not set"),
      treeItem("CSL", activeTarget.csl || "not set"),
      treeItem("References", String(this.bibliographyCount)),
      treeItem("Verify", this.lastVerification)
    ];
  }
}

function treeItem(label, description) {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.description = description;
  item.tooltip = `${label}: ${description}`;
  return item;
}

function activate(context) {
  diagnostics = vscode.languages.createDiagnosticCollection("academicResearch");
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80);
  statusBarItem.command = "academicResearch.showProjectStatus";
  statusBarItem.show();
  outputChannel = vscode.window.createOutputChannel("Academic Research");

  statusProvider = new ProjectStatusProvider();
  context.subscriptions.push(
    diagnostics,
    statusBarItem,
    outputChannel,
    vscode.window.registerTreeDataProvider("academicResearch.projectStatus", statusProvider),
    vscode.commands.registerCommand("academicResearch.showProjectStatus", showProjectStatus),
    vscode.commands.registerCommand("academicResearch.findCitationForSelection", findCitationForSelection),
    vscode.commands.registerCommand("academicResearch.verifyCitations", verifyCitations),
    vscode.commands.registerCommand("academicResearch.syncBibliography", syncBibliography),
    vscode.commands.registerCommand("academicResearch.buildDraftPdf", () => runMakeTarget("draft")),
    vscode.commands.registerCommand("academicResearch.buildPdf", () => runMakeTarget("pdf")),
    vscode.commands.registerCommand("academicResearch.switchTarget", switchTarget),
    vscode.commands.registerCommand("academicResearch.addSelectionToRegister", addSelectionToRegister),
    vscode.workspace.onDidSaveTextDocument((document) => {
      const enabled = vscode.workspace.getConfiguration("academicResearch").get("autoVerifyOnSave", true);
      if (enabled && document.languageId === "markdown") {
        refreshDiagnosticsForDocument(document).catch((error) => logError("Auto verification failed", error));
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => refreshStatus()),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      refreshStatus();
      if (editor) {
        refreshDiagnosticsForDocument(editor.document).catch((error) => logError("Active editor diagnostics failed", error));
      }
    })
  );

  refreshStatus();
  refreshDiagnosticsForActiveDocument().catch((error) => logError("Initial diagnostics failed", error));
}

function deactivate() {}

function getWorkspaceRoot(resource) {
  const folder = resource ? vscode.workspace.getWorkspaceFolder(resource) : null;
  if (folder) {
    return folder.uri.fsPath;
  }

  const firstFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  return firstFolder ? firstFolder.uri.fsPath : null;
}

function getCurrentProject() {
  const activeUri = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri;
  const root = getWorkspaceRoot(activeUri);

  if (!root) {
    return {
      mode: "generic",
      found: false,
      reason: "No workspace folder is open"
    };
  }

  try {
    return detectAcademicProject(root);
  } catch (error) {
    return {
      mode: "generic",
      rootDir: root,
      found: false,
      reason: error.message
    };
  }
}

function loadProjectBibliography(project) {
  if (!project.found || !project.exists.bibliography) {
    return [];
  }

  return loadBibliography(project.paths.bibliography);
}

function refreshStatus(lastVerification) {
  const project = getCurrentProject();
  let count = 0;

  try {
    count = loadProjectBibliography(project).length;
  } catch (error) {
    logError("Could not load bibliography", error);
  }

  if (project.found) {
    const target = project.config.target || "no target";
    const verifyState = lastVerification || statusProvider.lastVerification || "not run";
    statusBarItem.text = `$(book) Academic: ${target} | ${count} refs | ${verifyState}`;
    statusBarItem.tooltip = "Show Academic Research project status";
  } else {
    statusBarItem.text = "$(book) Academic: generic";
    statusBarItem.tooltip = project.reason;
  }

  statusProvider.refresh(project, count, lastVerification);
  return project;
}

async function showProjectStatus() {
  const project = refreshStatus();

  if (!project.found) {
    vscode.window.showInformationMessage(`Academic Research: ${project.reason}`);
    return;
  }

  const activeTarget = project.config.activeTarget || {};
  const lines = [
    `Mode: template-aware`,
    `Root: ${project.rootDir}`,
    `Manuscript: ${path.relative(project.rootDir, project.paths.manuscript)}`,
    `Bibliography: ${path.relative(project.rootDir, project.paths.bibliography)}`,
    `Target: ${project.config.target || "not set"}`,
    `CSL: ${activeTarget.csl || "not set"}`,
    `Language: ${project.config.project.language}`,
    `Make targets: ${project.makeTargets.join(", ") || "none detected"}`
  ];

  const open = "Open Output";
  const picked = await vscode.window.showInformationMessage(lines.join("\n"), { modal: true }, open);
  if (picked === open) {
    outputChannel.appendLine(lines.join("\n"));
    outputChannel.show();
  }
}

function getSelectedText() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    return null;
  }

  return editor.document.getText(selection).trim();
}

function resultDetail(result) {
  const authors = Array.isArray(result.authors) ? result.authors.slice(0, 3).join(", ") : "";
  const suffix = result.authors && result.authors.length > 3 ? " et al." : "";
  return [authors ? `${authors}${suffix}` : "", result.year, result.venue].filter(Boolean).join(" | ");
}

function resultDescription(result) {
  if (result.alreadyInBibliography) {
    return `@${result.citekey} | ${result.source}`;
  }
  return result.doi ? `${result.source} | DOI ${result.doi}` : result.source;
}

async function findCitationForSelection() {
  const editor = vscode.window.activeTextEditor;
  const selectedText = getSelectedText();

  if (!editor || !selectedText) {
    vscode.window.showWarningMessage("Select manuscript text first.");
    return;
  }

  const project = getCurrentProject();
  if (!project.found) {
    vscode.window.showWarningMessage("Template-aware citation search needs a workspace with paper.yaml.");
    return;
  }

  let bibliography = [];
  try {
    bibliography = loadProjectBibliography(project);
  } catch (error) {
    vscode.window.showErrorMessage(`Could not load bibliography: ${error.message}`);
    return;
  }

  const localResults = searchBibliography(bibliography, selectedText, 8);
  const results = [...localResults];
  const config = vscode.workspace.getConfiguration("academicResearch");

  if (config.get("enableZoteroMcp", true)) {
    await addMcpSearchResults("Zotero MCP", results, async () => {
      const zotero = new ZoteroMcpClient(project);
      try {
        return await zotero.search(selectedText, 6);
      } finally {
        await zotero.close();
      }
    });
  }

  if (config.get("enableScholarMcp", true)) {
    await addMcpSearchResults("Google Scholar MCP", results, async () => {
      const scholar = new ScholarMcpClient(project);
      try {
        return await scholar.search(selectedText, 6);
      } finally {
        await scholar.close();
      }
    });
  }

  if (config.get("enableOpenAlex", true)) {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Searching academic sources",
        cancellable: false
      },
      async () => {
        try {
          const openAlexResults = await searchOpenAlex(selectedText, {
            limit: 8,
            email: config.get("openAlexEmail", "")
          });
          results.push(...openAlexResults);
        } catch (error) {
          logError("OpenAlex search failed", error);
        }
      }
    );
  }

  if (!results.length) {
    const add = "Add to Register";
    const picked = await vscode.window.showInformationMessage("No citation candidates found.", add);
    if (picked === add) {
      await addClaimToRegister(project, selectedText, selectedText);
    }
    return;
  }

  const picked = await vscode.window.showQuickPick(
    results.map((result) => ({
      label: result.title || "(untitled source)",
      description: resultDescription(result),
      detail: resultDetail(result),
      result
    })),
    {
      title: "Select a citation candidate",
      placeHolder: "Local bibliography results can be inserted immediately; external results can be registered."
    }
  );

  if (!picked) {
    return;
  }

  if (picked.result.alreadyInBibliography && picked.result.citekey) {
    await insertCitationForSelection(editor, selectedText, picked.result.citekey);
    refreshDiagnosticsForDocument(editor.document).catch((error) => logError("Diagnostics refresh failed", error));
    return;
  }

  if (picked.result.alreadyInZotero && picked.result.citekey) {
    await handleZoteroResult(project, editor, selectedText, picked.result);
    return;
  }

  await handleExternalResult(project, selectedText, picked.result);
}

async function addMcpSearchResults(label, results, search) {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Searching ${label}`,
      cancellable: false
    },
    async () => {
      try {
        results.push(...await search());
      } catch (error) {
        logError(`${label} search failed`, error);
      }
    }
  );
}

async function handleZoteroResult(project, editor, selectedText, result) {
  const actions = ["Sync Bibliography and Insert", "Add to Reference Register"];
  const picked = await vscode.window.showQuickPick(actions, {
    title: "Zotero item selected",
    placeHolder: `@${result.citekey} is in Zotero. Sync the local CSL JSON before inserting.`
  });

  if (picked === "Sync Bibliography and Insert") {
    const synced = await syncBibliography(project);
    if (!synced) {
      return;
    }
    await insertCitationForSelection(editor, selectedText, result.citekey);
    refreshDiagnosticsForDocument(editor.document).catch((error) => logError("Diagnostics refresh failed", error));
  } else if (picked === "Add to Reference Register") {
    const candidate = [result.title, `@${result.citekey}`].filter(Boolean).join(" / ");
    const id = await addClaimToRegister(project, selectedText, selectedText, candidate, "candidate-found");
    vscode.window.showInformationMessage(`Added ${id} to refs/reference-register.md.`);
  }
}

async function handleExternalResult(project, claim, result) {
  const actions = ["Add to Reference Register"];
  if (result.url) {
    actions.push("Open Source URL");
  }
  if (result.doi) {
    actions.push("Copy DOI");
  }

  const picked = await vscode.window.showQuickPick(actions, {
    title: "External source selected",
    placeHolder: "This source is not in the local bibliography yet."
  });

  if (picked === "Add to Reference Register") {
    const candidate = [result.title, result.doi || result.url].filter(Boolean).join(" / ");
    const id = await addClaimToRegister(project, claim, claim, candidate, "candidate-found");
    vscode.window.showInformationMessage(`Added ${id} to refs/reference-register.md.`);
  } else if (picked === "Open Source URL" && result.url) {
    vscode.env.openExternal(vscode.Uri.parse(result.url));
  } else if (picked === "Copy DOI" && result.doi) {
    await vscode.env.clipboard.writeText(result.doi);
    vscode.window.showInformationMessage("DOI copied.");
  }
}

async function addSelectionToRegister() {
  const selectedText = getSelectedText();
  if (!selectedText) {
    vscode.window.showWarningMessage("Select manuscript text first.");
    return;
  }

  const project = getCurrentProject();
  if (!project.found) {
    vscode.window.showWarningMessage("Reference register needs a workspace with paper.yaml.");
    return;
  }

  const id = await addClaimToRegister(project, selectedText, selectedText);
  vscode.window.showInformationMessage(`Added ${id} to refs/reference-register.md.`);
}

async function addClaimToRegister(project, claim, query, candidateSource = "", status = "needed") {
  const id = appendRegisterEntry(project.paths.referenceRegister, {
    claim,
    query,
    candidateSource,
    status
  });

  const document = await vscode.workspace.openTextDocument(project.paths.referenceRegister);
  await vscode.window.showTextDocument(document, { preview: false });
  return id;
}

async function verifyCitations() {
  const project = getCurrentProject();
  if (!project.found) {
    vscode.window.showWarningMessage("Citation verification needs a workspace with paper.yaml.");
    return;
  }

  await refreshDiagnosticsForProject(project);
  const issues = diagnostics.get(vscode.Uri.file(project.paths.manuscript)) || [];
  const makeResult = project.makeTargets.includes("verify") ? await runMakeTargetCaptured(project, "verify") : null;
  const makeFailed = makeResult && makeResult.exitCode !== 0;
  const state = makeFailed
    ? "make verify failed"
    : issues.length
      ? `${issues.length} issue${issues.length === 1 ? "" : "s"}`
      : "ok";
  refreshStatus(state);

  if (makeFailed) {
    vscode.window.showWarningMessage("Academic citation verification failed. See the Academic Research output.");
  } else {
    vscode.window.showInformationMessage(`Academic citation verification: ${state}.`);
  }
}

async function refreshDiagnosticsForActiveDocument() {
  const document = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document;
  if (document) {
    await refreshDiagnosticsForDocument(document);
  }
}

async function refreshDiagnosticsForProject(project) {
  if (!project.exists.manuscript) {
    return;
  }

  const document = await vscode.workspace.openTextDocument(project.paths.manuscript);
  await refreshDiagnosticsForDocument(document, project);
}

async function refreshDiagnosticsForDocument(document, project = getCurrentProject()) {
  if (!project.found || document.uri.scheme !== "file" || path.resolve(document.uri.fsPath) !== path.resolve(project.paths.manuscript)) {
    diagnostics.delete(document.uri);
    return;
  }

  let bibliography = [];
  try {
    bibliography = loadProjectBibliography(project);
  } catch (error) {
    diagnostics.set(document.uri, [
      new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 1),
        `Could not load bibliography: ${error.message}`,
        vscode.DiagnosticSeverity.Error
      )
    ]);
    return;
  }

  const ids = bibliography.map((item) => item.id);
  const issues = findCitationIssues(document.getText(), ids);
  const vscodeDiagnostics = issues.map((issue) => {
    const severity = issue.type === "missing" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(issue.start.line, issue.start.character, issue.end.line, issue.end.character),
      issue.message,
      severity
    );
    diagnostic.source = "Academic Research";
    diagnostic.code = issue.type;
    return diagnostic;
  });

  diagnostics.set(document.uri, vscodeDiagnostics);
  refreshStatus(vscodeDiagnostics.length ? `${vscodeDiagnostics.length} issue${vscodeDiagnostics.length === 1 ? "" : "s"}` : "ok");
}

function runMakeTarget(target, args = []) {
  const project = getCurrentProject();

  if (!project.found) {
    vscode.window.showWarningMessage("This command needs a workspace with paper.yaml.");
    return;
  }

  if (!project.makeTargets.includes(target)) {
    vscode.window.showWarningMessage(`Make target '${target}' was not found in this project.`);
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: "Academic Research",
    cwd: project.rootDir
  });
  const command = ["make", target, ...args].join(" ");
  terminal.show();
  terminal.sendText(command, true);
}

async function syncBibliography(project = getCurrentProject()) {
  if (!project.found) {
    vscode.window.showWarningMessage("Bibliography sync needs a workspace with paper.yaml.");
    return false;
  }

  const config = vscode.workspace.getConfiguration("academicResearch");
  if (!config.get("enableZoteroMcp", true)) {
    runMakeTarget("sync");
    return true;
  }

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Syncing bibliography from Zotero MCP",
      cancellable: false
    },
    async () => {
      const zotero = new ZoteroMcpClient(project);
      try {
        const exportResult = await zotero.exportBibliographyContent();
        await vscode.workspace.fs.writeFile(
          vscode.Uri.file(project.paths.bibliography),
          Buffer.from(`${exportResult.content}\n`, "utf8")
        );
        refreshStatus("synced");
        await refreshDiagnosticsForProject(getCurrentProject());
        vscode.window.showInformationMessage(`Synced ${exportResult.count} Zotero references.`);
        return true;
      } catch (error) {
        logError("Zotero MCP bibliography sync failed", error);
        vscode.window.showWarningMessage("Zotero MCP sync failed. See the Academic Research output.");
        return false;
      } finally {
        await zotero.close();
      }
    }
  );
}

function runMakeTargetCaptured(project, target, args = []) {
  outputChannel.appendLine("");
  outputChannel.appendLine(`> make ${[target, ...args].join(" ")}`);

  return new Promise((resolve) => {
    childProcess.execFile(
      "make",
      [target, ...args],
      {
        cwd: project.rootDir,
        maxBuffer: 1024 * 1024 * 8
      },
      (error, stdout, stderr) => {
        if (stdout) {
          outputChannel.append(stdout);
        }
        if (stderr) {
          outputChannel.append(stderr);
        }
        if (error) {
          outputChannel.appendLine(`make ${target} exited with ${error.code || 1}`);
          outputChannel.show(true);
          resolve({ exitCode: error.code || 1, stdout, stderr });
          return;
        }
        resolve({ exitCode: 0, stdout, stderr });
      }
    );
  });
}

async function insertCitationForSelection(editor, selectedText, citekey) {
  const plan = planCitationInsertion(selectedText, citekey);

  await editor.edit((editBuilder) => {
    if (plan.mode === "replace-inside-selection") {
      const start = editor.document.offsetAt(editor.selection.start) + plan.replacementSpan.start;
      const end = editor.document.offsetAt(editor.selection.start) + plan.replacementSpan.end;
      editBuilder.replace(
        new vscode.Range(editor.document.positionAt(start), editor.document.positionAt(end)),
        plan.citation
      );
      return;
    }

    editBuilder.insert(editor.selection.end, `${plan.leadingText}${plan.citation}${plan.trailingText}`);
  });
}

async function switchTarget() {
  const project = getCurrentProject();

  if (!project.found) {
    vscode.window.showWarningMessage("Switch target needs a workspace with paper.yaml.");
    return;
  }

  if (!project.makeTargets.includes("switch")) {
    vscode.window.showWarningMessage("Make target 'switch' was not found in this project.");
    return;
  }

  const targets = project.config.targets.length ? project.config.targets : Object.keys(project.config.rawScalars)
    .filter((key) => key.startsWith("targets.") && key.split(".").length > 2)
    .map((key) => key.split(".")[1]);
  const uniqueTargets = [...new Set(targets)];

  const picked = await vscode.window.showQuickPick(uniqueTargets, {
    title: "Switch active paper target",
    placeHolder: project.config.target ? `Current: ${project.config.target}` : "Select target"
  });

  if (picked) {
    runMakeTarget("switch", [`TO=${picked}`]);
  }
}

function logError(message, error) {
  const details = error && error.stack ? error.stack : String(error);
  outputChannel.appendLine(`${message}: ${details}`);
}

module.exports = {
  activate,
  deactivate,
  getWorkspaceRoot
};
