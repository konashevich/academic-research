"use strict";

const path = require("path");
const childProcess = require("child_process");
const vscode = require("vscode");

const { detectAcademicProject } = require("./projectDetector");
const {
  addBatch,
  getBatch,
  hasHistoryDir,
  hydrateSession,
  removeBatch
} = require("./citationSearchHistoryStore");
const { CitationSearchHistoryViewProvider } = require("./citationSearchHistoryView");
const { loadBibliography, searchBibliography } = require("./bibliographyIndex");
const { findCitationIssues } = require("./citationDiagnostics");
const { planCitationInsertion } = require("./citationInsertion");
const { buildCitationQuery, extractClaimTextFromLine } = require("./citationQuery");
const { isValidCitekey, mergeCitationResults } = require("./citationResults");
const { upsertRegisterEntry } = require("./registerStore");
const { searchOpenAlex } = require("./openAlexClient");
const { ZoteroMcpClient } = require("./zoteroMcpClient");
const { ScholarMcpClient } = require("./scholarMcpClient");
const { renderCitationSearchHtml, truncateText } = require("./citationSearchPanel");
const { buildLocalBibliographyContent, readExistingBibliography, writeBibliographySafely } = require("./safeBibliographySync");
const { collectProjectCitekeys } = require("./projectCitekeys");
const { registerCitationCodeActions } = require("./citationCodeActions");
const { createInfrastructureManager, getInfrastructureManager } = require("./infrastructure/infrastructureManager");
const { WritingHubPanel } = require("./writingHub/writingHubPanel");
const { rankCitationResults, shouldRunAgentRanking } = require("./citationAgentRanker");
const { registerScaffoldCommands } = require("./scaffold/scaffoldCommands");
const { initializeBundledProfilesClone } = require("./profiles/profileRegistry");
const { resolveWorkspaceRoot } = require("./workspaceRoot");

let diagnostics;
let statusBarItem;
let statusProvider;
let outputChannel;
let extensionContext;
let citationPanel;
let writingHubPanel;
let currentCitationSession;
let citationSearchHistoryViewProvider;

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
        hubTreeItem("Set up paper project", "project"),
        treeItem("Infrastructure", getInfrastructureStatusLabel()),
        treeItem("Mode", "Generic Markdown"),
        treeItem("Status", this.project ? this.project.reason : "No workspace detected")
      ];
    }

    const config = this.project.config;
    const activeTarget = config.activeTarget || {};

    return [
      hubTreeItem(),
      treeItem("Infrastructure", getInfrastructureStatusLabel()),
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

function treeItem(label, description, command) {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.description = description;
  item.tooltip = `${label}: ${description}`;
  if (command) {
    item.command = command;
  }
  return item;
}

function hubTreeItem(descriptionOverride, step = "welcome") {
  const infra = getInfrastructureManager();
  const status = infra ? infra.getInfraStatusLabel() : "not initialized";
  const description = descriptionOverride || (status === "setup needed" ? "Setup required" : status);
  return treeItem("Writing Hub", description, {
    command: "academicResearch.openWritingHub",
    title: "Open Writing Hub",
    arguments: [step]
  });
}

function getInfrastructureStatusLabel() {
  const infra = getInfrastructureManager();
  if (!infra) {
    return "not initialized";
  }
  return infra.getInfraStatusLabel();
}

function logInfrastructure(message) {
  outputChannel.appendLine(message);
}

async function resolveMcpEndpoints(project) {
  const infra = getInfrastructureManager();
  if (!infra) {
    return {
      host: project?.config?.mcp?.host || "localhost",
      zoteroPort: project?.config?.mcp?.zoteroPort || 9180,
      scholarPort: project?.config?.mcp?.scholarPort || 3847
    };
  }

  if (infra.isBundledMode()) {
    const running = await infra.ensureRunning();
    if (!running.ok) {
      throw new Error(running.detail || "Bundled MCP services are not running.");
    }
  }

  return infra.getEndpoints(project);
}

async function ensureInfrastructureReady(promptUser = true) {
  const infra = getInfrastructureManager();
  if (!infra || !infra.isBundledMode()) {
    return true;
  }

  if (infra.isSetupComplete()) {
    const running = await infra.ensureRunning();
    return running.ok;
  }

  if (!promptUser) {
    return false;
  }

  const open = "Open Writing Hub";
  const picked = await vscode.window.showWarningMessage(
    "Academic Research infrastructure is not set up yet.",
    open
  );
  if (picked === open) {
    await openWritingHub("infrastructure");
  }
  return false;
}

async function openWritingHub(step = "welcome") {
  if (!writingHubPanel) {
    return;
  }
  await writingHubPanel.open(step);
}

function activate(context) {
  extensionContext = context;
  diagnostics = vscode.languages.createDiagnosticCollection("academicResearch");
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80);
  statusBarItem.command = "academicResearch.openWritingHub";
  statusBarItem.show();
  outputChannel = vscode.window.createOutputChannel("Academic Research");

  createInfrastructureManager(context, {
    logFn: logInfrastructure
  });
  context.subscriptions.push(
    getInfrastructureManager().onDidChangeState(() => {
      refreshStatus();
      statusProvider._onDidChangeTreeData.fire();
    })
  );
  writingHubPanel = new WritingHubPanel(context, getInfrastructureManager(), {
    onOpenLogs: () => outputChannel.show(),
    onOpenCitationTips: () => {
      vscode.window.showInformationMessage(
        "Select text in a Markdown manuscript and run Academic Research: Find Citation for Selection (Alt+Shift+C)."
      );
    },
    onConnectAiChat: async () => {
      const root = getWorkspaceRoot();
      if (!root) {
        throw new Error("Open a workspace folder before connecting MCP servers to AI chat.");
      }
      const written = await getInfrastructureManager().writeWorkspaceMcpConfig(root);
      vscode.window.showInformationMessage(
        `Updated MCP config for AI chat: ${written.join(", ")}. Reload MCP in Cursor/VS Code settings.`
      );
      return written;
    },
    onManageProfiles: () => vscode.commands.executeCommand("academicResearch.manageProfiles"),
    onDeployComplete: (workspaceRoot, { infraReady, warnings = [] } = {}) => {
      refreshStatus("deployed");
      const warningNote = warnings.length ? ` ${warnings.join(" ")}` : "";
      if (infraReady) {
        vscode.window.showInformationMessage(
          `Paper project deployed. Open paper.md to start writing.${warningNote}`
        );
      } else {
        vscode.window.showInformationMessage(
          `Paper project deployed. Connect Zotero in the Writing Hub when you need citation search or bibliography sync.${warningNote}`
        );
      }
    },
  });
  context.subscriptions.push({ dispose: () => writingHubPanel.dispose() });
  context.subscriptions.push(...registerScaffoldCommands(context, getInfrastructureManager()));

  initializeBundledProfilesClone(context.globalStorageUri.fsPath, context.extensionPath);

  citationSearchHistoryViewProvider = new CitationSearchHistoryViewProvider(context, {
    getProjectRootDir: () => resolveCitationHistoryRoot(),
    onOpenBatch: (batchId) => {
      openCitationSearchFromHistory(batchId).catch((error) => {
        logError("Could not open citation search from history", error);
        vscode.window.showErrorMessage(`Could not open citation search: ${error.message}`);
      });
    },
    onDeleteBatch: (batchId) => {
      deleteCitationSearchFromHistory(batchId).catch((error) => {
        logError("Could not delete citation search from history", error);
        vscode.window.showErrorMessage(`Could not delete citation search: ${error.message}`);
      });
    }
  });

  const citationHistoryWatcher = vscode.workspace.createFileSystemWatcher("**/refs/citation-searches/**/*.json");
  citationHistoryWatcher.onDidCreate(() => refreshCitationSearchHistory());
  citationHistoryWatcher.onDidChange(() => refreshCitationSearchHistory());
  citationHistoryWatcher.onDidDelete(() => refreshCitationSearchHistory());
  context.subscriptions.push(citationHistoryWatcher);

  statusProvider = new ProjectStatusProvider();
  context.subscriptions.push(
    diagnostics,
    statusBarItem,
    outputChannel,
    vscode.window.registerWebviewViewProvider(
      "academicResearch.citationSearchHistory",
      citationSearchHistoryViewProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.window.registerTreeDataProvider("academicResearch.projectStatus", statusProvider),
    vscode.commands.registerCommand("academicResearch.showProjectStatus", showProjectStatus),
    vscode.commands.registerCommand("academicResearch.openWritingHub", (step) => {
      const targetStep = typeof step === "string" ? step : "welcome";
      return openWritingHub(targetStep);
    }),
    vscode.commands.registerCommand("academicResearch.findCitationForSelection", findCitationForSelection),
    vscode.commands.registerCommand("academicResearch.findCitationForClaim", findCitationForClaim),
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
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      refreshStatus();
      refreshCitationSearchHistory();
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      refreshStatus();
      refreshCitationSearchHistory();
      if (editor) {
        refreshDiagnosticsForDocument(editor.document).catch((error) => logError("Active editor diagnostics failed", error));
      }
    })
  );

  registerCitationCodeActions(context);

  refreshStatus();
  refreshDiagnosticsForActiveDocument().catch((error) => logError("Initial diagnostics failed", error));
}

function deactivate() {
  const infra = getInfrastructureManager();
  if (infra) {
    infra.dispose();
  }
  if (writingHubPanel) {
    writingHubPanel.dispose();
    writingHubPanel = null;
  }
}

function getWorkspaceRoot(resource) {
  return resolveWorkspaceRoot(resource);
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
    const infraState = getInfrastructureStatusLabel();
    statusBarItem.text = `$(book) Academic: ${infraState} | ${target} | ${count} refs`;
    statusBarItem.tooltip = "Open Academic Writing Hub";
  } else {
    const infraState = getInfrastructureStatusLabel();
    statusBarItem.text = `$(book) Academic: ${infraState}`;
    statusBarItem.tooltip = "Open Academic Writing Hub";
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

  const text = editor.document.getText(selection);
  return text.trim() ? text : null;
}

function makeNonce() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let index = 0; index < 32; index += 1) {
    text += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return text;
}

function makeSessionId() {
  return `citation-${Date.now()}-${makeNonce()}`;
}

function isProjectManuscriptDocument(project, document) {
  return Boolean(
    project &&
    project.found &&
    document &&
    document.uri.scheme === "file" &&
    path.resolve(document.uri.fsPath) === path.resolve(project.paths.manuscript)
  );
}

function getSelectionSnapshot(editor) {
  return {
    documentUri: editor.document.uri.toString(),
    start: editor.document.offsetAt(editor.selection.start),
    end: editor.document.offsetAt(editor.selection.end),
    text: editor.document.getText(editor.selection)
  };
}

async function restoreSearchEditor(session) {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(session.selection.documentUri));
  const documentLength = document.getText().length;
  if (session.selection.start > documentLength || session.selection.end > documentLength) {
    throw new Error("The original manuscript selection no longer exists. Select the claim and search again.");
  }

  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const selection = new vscode.Selection(
    document.positionAt(session.selection.start),
    document.positionAt(session.selection.end)
  );
  const currentText = document.getText(selection);
  if (currentText !== session.selection.text) {
    throw new Error("The selected manuscript text changed after this search. Select the claim and search again.");
  }

  editor.selection = selection;
  editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  return editor;
}

function refreshCitationSearchHistory() {
  citationSearchHistoryViewProvider?.refresh();
}

function resolveCitationHistoryRoot() {
  const project = getCurrentProject();
  if (project.found) {
    return project.rootDir;
  }

  const root = getWorkspaceRoot();
  return root && hasHistoryDir(root) ? root : "";
}

async function resolveCanImportToZotero(project) {
  const config = vscode.workspace.getConfiguration("academicResearch");
  if (!config.get("enableZoteroMcp", true) || !project?.found) {
    return false;
  }

  try {
    const endpoints = await resolveMcpEndpoints(project);
    const zotero = new ZoteroMcpClient(endpoints);
    try {
      return await zotero.hasTool("zotero_create_item");
    } finally {
      await zotero.close();
    }
  } catch (error) {
    logError("Zotero import preflight failed", error);
    return false;
  }
}

function saveCitationSearchSession(session) {
  if (!session?.project?.rootDir) {
    return;
  }

  try {
    const maxBatches = vscode.workspace.getConfiguration("academicResearch").get("citationSearchHistoryMax", 50);
    addBatch(session.project.rootDir, session, { maxBatches });
    refreshCitationSearchHistory();
  } catch (error) {
    logError("Could not save citation search history", error);
    vscode.window.showWarningMessage(`Citation search completed, but could not save history: ${error.message}`);
  }
}

async function openCitationSearchFromHistory(batchId) {
  const projectRootDir = resolveCitationHistoryRoot();
  if (!projectRootDir) {
    vscode.window.showWarningMessage("Open a workspace with saved citation searches to restore them.");
    return;
  }

  const record = getBatch(projectRootDir, batchId);
  if (!record) {
    vscode.window.showWarningMessage("That citation search is no longer saved.");
    refreshCitationSearchHistory();
    return;
  }

  const session = hydrateSession(record, detectAcademicProject);
  if (!session) {
    vscode.window.showWarningMessage("That citation search file is invalid.");
    return;
  }

  if (session.projectReady) {
    session.canImportToZotero = await resolveCanImportToZotero(session.project);
  }

  openCitationSearchPanel(session);
}

async function deleteCitationSearchFromHistory(batchId) {
  const projectRootDir = resolveCitationHistoryRoot();
  if (!projectRootDir) {
    return;
  }

  const record = getBatch(projectRootDir, batchId);
  if (!record) {
    refreshCitationSearchHistory();
    return;
  }

  const label = truncateText(record.claim || record.queryText || "this search", 80);
  const confirm = await vscode.window.showWarningMessage(
    `Delete saved citation search "${label}"?`,
    { modal: true },
    "Delete"
  );
  if (confirm !== "Delete") {
    return;
  }

  if (!removeBatch(projectRootDir, batchId)) {
    return;
  }

  if (currentCitationSession?.id === batchId && citationPanel) {
    citationPanel.dispose();
  }

  refreshCitationSearchHistory();
}

function openCitationSearchPanel(session) {
  currentCitationSession = session;

  if (!citationPanel) {
    citationPanel = vscode.window.createWebviewPanel(
      "academicResearchCitationSearch",
      "Citation Search",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    extensionContext.subscriptions.push(citationPanel);
    citationPanel.onDidDispose(() => {
      citationPanel = null;
      currentCitationSession = null;
    });
    citationPanel.webview.onDidReceiveMessage((message) => {
      handleCitationPanelMessage(message)
        .catch((error) => {
          logError("Citation panel action failed", error);
          vscode.window.showErrorMessage(`Citation action failed: ${error.message}`);
        })
        .finally(() => {
          if (citationPanel) {
            citationPanel.webview.postMessage({ type: "actionComplete" });
          }
        });
    });
  } else {
    citationPanel.reveal(vscode.ViewColumn.Beside);
  }

  citationPanel.title = "Citation Search";
  const readOnly = !session.projectReady;
  citationPanel.webview.html = renderCitationSearchHtml({
    nonce: makeNonce(),
    sessionId: session.id,
    claim: session.claim,
    results: session.results,
    droppedResults: session.droppedResults || [],
    expandDropped: session.expandDropped,
    canImportToZotero: session.canImportToZotero,
    providerStatuses: session.providerStatuses || [],
    readOnly,
    readOnlyReason: readOnly
      ? "Saved snapshot only. Restore paper.yaml to insert citations or register claims."
      : ""
  });
}

async function handleCitationPanelMessage(message) {
  if (!message || message.type !== "action" || !currentCitationSession) {
    return;
  }

  const session = currentCitationSession;
  if (message.sessionId !== session.id) {
    vscode.window.showWarningMessage("This citation search is stale. Run the search again.");
    return;
  }

  const projectBoundActions = new Set(["registerClaim", "register", "insert", "syncInsert", "importInsert"]);
  if (!session.projectReady && projectBoundActions.has(message.action)) {
    vscode.window.showWarningMessage("This saved search is view-only until the paper project is available again.");
    return;
  }

  const project = session.project;
  const claim = session.claim;
  const selectedText = session.selectedText;

  if (message.action === "registerClaim") {
    const id = await addClaimToRegister(project, claim, session.queryText);
    vscode.window.showInformationMessage(`Added ${id} to refs/reference-register.md.`);
    return;
  }

  const result = message.section === "dropped"
    ? session.droppedResults?.[message.index]
    : session.results[message.index];
  if (!result) {
    return;
  }

  if (message.action === "open" && result.url) {
    await vscode.env.openExternal(vscode.Uri.parse(result.url));
    return;
  }

  if (message.action === "copyDoi" && result.doi) {
    await vscode.env.clipboard.writeText(result.doi);
    vscode.window.showInformationMessage("DOI copied.");
    return;
  }

  if (message.action === "register") {
    const id = await addClaimToRegister(project, claim, session.queryText, formatCandidateSource(result), "candidate-found", result.citekey || "");
    vscode.window.showInformationMessage(`Added ${id} to refs/reference-register.md.`);
    return;
  }

  if (message.section === "dropped" && message.action === "importInsert") {
    return;
  }

  const editor = await restoreSearchEditor(session);

  if (message.action === "insert" && result.alreadyInBibliography && result.citekey) {
    if (await insertCitationForSelection(editor, selectedText, result.citekey)) {
      refreshDiagnosticsForDocument(editor.document).catch((error) => logError("Diagnostics refresh failed", error));
    }
    return;
  }

  if (message.action === "syncInsert" && result.alreadyInZotero && result.citekey) {
    const synced = await syncBibliography(project, { additionalKeys: [result.citekey] });
    if (synced && ensureCitekeyInBibliography(project, result.citekey)) {
      await insertCitationForSelection(editor, selectedText, result.citekey);
      refreshDiagnosticsForDocument(editor.document).catch((error) => logError("Diagnostics refresh failed", error));
    } else if (synced) {
      await addClaimToRegister(project, claim, session.queryText, formatCandidateSource(result), "candidate-found", result.citekey, { open: false });
      vscode.window.showWarningMessage(`Synced bibliography, but @${result.citekey} was not found. Added the claim to the reference register.`);
    }
    return;
  }

  if (message.action === "importInsert") {
    if (result.canImport === false) {
      const id = await addClaimToRegister(project, claim, session.queryText, formatCandidateSource(result), "candidate-found");
      vscode.window.showWarningMessage(`Source metadata is incomplete, so it was registered as ${id} instead of imported.`);
      return;
    }
    await importExternalResult(project, editor, selectedText, result, claim);
  }
}

async function findCitationForClaim(diagnosticRange) {
  const editor = vscode.window.activeTextEditor;
  const range = reviveRange(diagnosticRange);
  if (!editor || !range) {
    vscode.window.showWarningMessage("Open the manuscript and place the cursor on the citation issue.");
    return;
  }

  const selectedText = extractClaimTextFromLine(editor.document.lineAt(range.start.line).text);
  if (!selectedText) {
    vscode.window.showWarningMessage("Could not extract claim text from this line.");
    return;
  }

  await runCitationSearch(editor, selectedText);
}

function reviveRange(value) {
  if (value instanceof vscode.Range) {
    return value;
  }
  if (value && value.start && value.end) {
    return new vscode.Range(
      new vscode.Position(value.start.line, value.start.character),
      new vscode.Position(value.end.line, value.end.character)
    );
  }
  return null;
}

async function findCitationForSelection() {
  const editor = vscode.window.activeTextEditor;
  const selectedText = getSelectedText();

  if (!editor || !selectedText) {
    vscode.window.showWarningMessage("Select manuscript text first.");
    return;
  }

  await runCitationSearch(editor, selectedText);
}

async function runCitationSearch(editor, selectedText) {
  const project = getCurrentProject();
  if (!project.found) {
    vscode.window.showWarningMessage("Template-aware citation search needs a workspace with paper.yaml.");
    return;
  }
  if (!isProjectManuscriptDocument(project, editor.document)) {
    vscode.window.showWarningMessage("Select text in the configured manuscript before searching for a citation.");
    return;
  }

  const query = buildCitationQuery(selectedText);
  if (!query.ok) {
    vscode.window.showWarningMessage(query.message);
    return;
  }

  let bibliography = [];
  try {
    bibliography = loadProjectBibliography(project);
  } catch (error) {
    vscode.window.showErrorMessage(`Could not load bibliography: ${error.message}`);
    return;
  }

  const localResults = searchBibliography(bibliography, query.queryText, 8);
  let results = [...localResults];
  const config = vscode.workspace.getConfiguration("academicResearch");
  let zoteroAvailable = false;
  let zoteroCanImport = false;
  const providerStatuses = [];
  let mcpEndpoints = null;

  const wantsBundledMcp = config.get("mcpMode", "bundled") === "bundled"
    && (config.get("enableZoteroMcp", true) || config.get("enableScholarMcp", true));
  if (wantsBundledMcp) {
    const ready = await ensureInfrastructureReady(true);
    if (!ready) {
      providerStatuses.push({ label: "Infrastructure", ok: false, detail: "setup required" });
    }
  }

  try {
    mcpEndpoints = await resolveMcpEndpoints(project);
  } catch (error) {
    logError("Could not resolve MCP endpoints", error);
    providerStatuses.push({ label: "Infrastructure", ok: false, detail: error.message });
  }

  if (config.get("enableZoteroMcp", true)) {
    const zoteroStatus = await addMcpSearchResults("Zotero MCP", results, async () => {
      const zotero = new ZoteroMcpClient(mcpEndpoints || project);
      try {
        const zoteroResults = await zotero.search(query.queryText, 6);
        zoteroCanImport = await zotero.hasTool("zotero_create_item").catch((error) => {
          logError("Zotero MCP tool preflight failed", error);
          return false;
        });
        return zoteroResults;
      } finally {
        await zotero.close();
      }
    });
    zoteroAvailable = zoteroStatus.ok;
    providerStatuses.push({
      label: "Zotero MCP",
      ok: zoteroStatus.ok,
      detail: zoteroStatus.ok
        ? (zoteroCanImport ? "ready" : "search only; import unavailable")
        : zoteroStatus.detail
    });
  }

  if (config.get("enableScholarMcp", true)) {
    const scholarStatus = await addMcpSearchResults("Google Scholar MCP", results, async () => {
      const scholar = new ScholarMcpClient(mcpEndpoints || project);
      try {
        return await scholar.search(query.queryText, 6);
      } finally {
        await scholar.close();
      }
    });
    providerStatuses.push({
      label: "Google Scholar MCP",
      ok: scholarStatus.ok,
      detail: scholarStatus.ok ? "ready" : scholarStatus.detail
    });
  }

  if (config.get("enableOpenAlex", true)) {
    const openAlexStatus = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Searching academic sources",
        cancellable: false
      },
      async () => {
        try {
          const openAlexResults = await searchOpenAlex(query.queryText, {
            limit: 8,
            email: config.get("openAlexEmail", "")
          });
          results.push(...openAlexResults);
          return { ok: true, detail: "ready" };
        } catch (error) {
          logError("OpenAlex search failed", error);
          return { ok: false, detail: error.message };
        }
      }
    );
    providerStatuses.push({
      label: "OpenAlex",
      ok: openAlexStatus.ok,
      detail: openAlexStatus.detail
    });
  }

  results = mergeCitationResults(results, bibliography);

  const infra = getInfrastructureManager();
  const cursorApiKey = await infra.getCursorApiKey();
  const agentRankingEnabled = config.get("enableAgentRanking", true);
  const rankingOptions = {
    claim: query.claim,
    queryText: query.queryText,
    results,
    projectRoot: project.rootDir,
    extensionPath: extensionContext.extensionPath,
    apiKey: cursorApiKey,
    model: config.get("agentRankingModel", "composer-2.5"),
    minScore: config.get("agentRankingMinScore", 40),
    timeoutMs: config.get("agentRankingTimeoutMs", 60000),
    enabled: agentRankingEnabled,
    onLog: (message) => outputChannel.appendLine(`[Relevance agent] ${message}`)
  };

  const runRanking = () => rankCitationResults(rankingOptions);
  const ranked = shouldRunAgentRanking({
    enabled: agentRankingEnabled,
    apiKey: cursorApiKey,
    resultCount: results.length
  })
    ? await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Filtering results for relevance",
        cancellable: false
      },
      async () => runRanking()
    )
    : await runRanking();

  results = ranked.results;
  const droppedResults = ranked.dropped;
  providerStatuses.push({
    label: "Relevance agent",
    ok: ranked.ok,
    skipped: ranked.status.skipped,
    detail: ranked.status.detail
  });

  if (!ranked.ok && !ranked.status.skipped) {
    logError("Relevance filtering failed", new Error(ranked.status.detail));
    if (agentRankingEnabled && cursorApiKey) {
      vscode.window.showWarningMessage(`Relevance filtering failed: ${ranked.status.detail}`);
    }
  }

  const session = {
    id: makeSessionId(),
    createdAt: Date.now(),
    project,
    claim: query.claim,
    queryText: query.queryText,
    selectedText,
    results,
    droppedResults,
    expandDropped: results.length === 0 && droppedResults.length > 0,
    agentRanked: ranked.ok,
    selection: getSelectionSnapshot(editor),
    canImportToZotero: config.get("enableZoteroMcp", true) && zoteroAvailable && zoteroCanImport,
    providerStatuses
  };

  saveCitationSearchSession(session);
  openCitationSearchPanel(session);
}

async function addMcpSearchResults(label, results, search) {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Searching ${label}`,
      cancellable: false
    },
    async () => {
      try {
        results.push(...await search());
        return { ok: true, detail: "ready" };
      } catch (error) {
        logError(`${label} search failed`, error);
        return { ok: false, detail: error.message };
      }
    }
  );
}

function formatCandidateSource(result) {
  return [result.title, result.doi || result.url].filter(Boolean).join(" / ");
}

async function importExternalResult(project, editor, selectedText, result, claim = selectedText.trim()) {
  let created;

  try {
    created = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Importing source to Zotero",
        cancellable: false
      },
      async () => {
        const endpoints = await resolveMcpEndpoints(project);
        const zotero = new ZoteroMcpClient(endpoints);
        try {
          return await zotero.createItemFromResult(result, claim);
        } finally {
          await zotero.close();
        }
      }
    );
  } catch (error) {
    logError("Zotero MCP source import failed", error);
    const add = "Add to Register";
    const picked = await vscode.window.showWarningMessage("Could not import source to Zotero. See the Academic Research output.", add);
    if (picked === add) {
      const id = await addClaimToRegister(project, claim, claim, formatCandidateSource(result), "candidate-found");
      vscode.window.showInformationMessage(`Added ${id} to refs/reference-register.md.`);
    }
    return;
  }

  const synced = await syncBibliography(project, { additionalKeys: [created.key] });
  if (!synced) {
    await addClaimToRegister(project, claim, claim, formatCandidateSource(result), "imported", created.key, { open: false });
    vscode.window.showWarningMessage(`Imported @${created.key}, but bibliography sync failed. See the Academic Research output.`);
    return;
  }

  if (!ensureCitekeyInBibliography(project, created.key)) {
    await addClaimToRegister(project, claim, claim, formatCandidateSource(result), "imported", created.key, { open: false });
    vscode.window.showWarningMessage(`Imported @${created.key}, but it was not found in the synced bibliography. Added the claim to the reference register.`);
    return;
  }

  const inserted = await insertCitationForSelection(editor, selectedText, created.key);
  await addClaimToRegister(project, claim, claim, formatCandidateSource(result), inserted ? "inserted" : "imported", created.key, { open: false });
  refreshDiagnosticsForDocument(editor.document).catch((error) => logError("Diagnostics refresh failed", error));
  if (inserted) {
    vscode.window.showInformationMessage(`Imported @${created.key}, synced bibliography, and inserted citation.`);
  }
}

async function addSelectionToRegister() {
  const editor = vscode.window.activeTextEditor;
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
  if (!editor || !isProjectManuscriptDocument(project, editor.document)) {
    vscode.window.showWarningMessage("Select text in the configured manuscript before adding it to the reference register.");
    return;
  }

  const query = buildCitationQuery(selectedText);
  if (!query.ok) {
    vscode.window.showWarningMessage(query.message);
    return;
  }

  const id = await addClaimToRegister(project, query.claim, query.queryText);
  vscode.window.showInformationMessage(`Added ${id} to refs/reference-register.md.`);
}

async function addClaimToRegister(project, claim, query, candidateSource = "", status = "needed", zoteroKey = "", options = {}) {
  const id = upsertRegisterEntry(project.paths.referenceRegister, {
    claim,
    query,
    candidateSource,
    status,
    zoteroKey
  });

  if (options.open === false) {
    return id;
  }

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

function ensureCitekeyInBibliography(project, citekey) {
  if (!isValidCitekey(citekey)) {
    return false;
  }

  try {
    return loadProjectBibliography(project).some((item) => item.id === citekey);
  } catch (error) {
    logError("Could not verify citekey after bibliography sync", error);
    return false;
  }
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

function getManuscriptTexts(project) {
  const editor = vscode.window.activeTextEditor;
  if (editor && isProjectManuscriptDocument(project, editor.document)) {
    return [editor.document.getText()];
  }
  return [];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectSyncCitekeys(project, options = {}) {
  return collectProjectCitekeys(project, {
    additionalKeys: options.additionalKeys,
    manuscriptTexts: getManuscriptTexts(project),
    includeRegisterKeys: options.includeRegisterKeys
  });
}

async function confirmEmptyBibliographySync(project) {
  const existing = readExistingBibliography(project.paths.bibliography);
  if (existing.items.length === 0) {
    return true;
  }

  const clear = "Clear Bibliography";
  const picked = await vscode.window.showWarningMessage(
    `No citekeys found in the manuscript or reference register. This will replace ${existing.items.length} bibliography entries with an empty file.`,
    { modal: true },
    clear
  );
  return picked === clear;
}

async function writeProjectBibliography(project, content, citekeyCount, options = {}) {
  try {
    return writeBibliographySafely(project.paths.bibliography, content, {
      projectScoped: true,
      requestedKeyCount: citekeyCount,
      ...options
    });
  } catch (error) {
    if (!/^Refusing /.test(error.message)) {
      throw error;
    }

    const replace = "Replace Anyway";
    const picked = await vscode.window.showWarningMessage(error.message, { modal: true }, replace);
    if (picked !== replace) {
      logError("Zotero MCP bibliography sync refused", error);
      return null;
    }

    return writeBibliographySafely(project.paths.bibliography, content, {
      allowDangerousReplace: true,
      projectScoped: true,
      requestedKeyCount: citekeyCount,
      ...options
    });
  }
}

async function syncBibliographyLocalOnly(project, options = {}) {
  const citekeys = collectSyncCitekeys(project, options);

  if (!citekeys.length) {
    if (!(await confirmEmptyBibliographySync(project))) {
      return false;
    }
    await writeProjectBibliography(project, "[]\n", 0);
    refreshStatus("synced");
    vscode.window.showInformationMessage("No project citekeys found; bibliography is now empty.");
    return true;
  }

  const existingBibliography = readExistingBibliography(project.paths.bibliography);
  const local = buildLocalBibliographyContent(citekeys, existingBibliography.items);

  if (local.unresolved.length > 0) {
    refreshStatus("sync failed");
    vscode.window.showWarningMessage(
      `Cannot sync locally: missing bibliography entries for @${local.unresolved.join(", @")}. Enable Zotero MCP to fetch them from your library.`
    );
    return false;
  }

  await writeProjectBibliography(project, local.content, citekeys.length);
  await refreshDiagnosticsForProject(project);
  refreshStatus("synced");
  vscode.window.showInformationMessage(
    `Pruned bibliography to ${citekeys.length} project citekey(s). Enable Zotero MCP to refresh metadata from Zotero.`
  );
  return true;
}

async function syncBibliographyFromZotero(project, options = {}) {
  const endpoints = await resolveMcpEndpoints(project);
  const zotero = new ZoteroMcpClient(endpoints);

  try {
    const citekeys = collectSyncCitekeys(project, options);

    if (!citekeys.length) {
      if (!(await confirmEmptyBibliographySync(project))) {
        return false;
      }
    }

    const exportResult = await zotero.exportBibliographyForCitekeys(citekeys);
    for (const warning of exportResult.warnings || []) {
      outputChannel.appendLine(warning);
    }

    const zoteroUnresolved = exportResult.unresolved || [];

    if (citekeys.length > 0 && zoteroUnresolved.length > 0) {
      refreshStatus("sync incomplete");
      vscode.window.showWarningMessage(
        `Could not refresh @${zoteroUnresolved.join(", @")} from Zotero. Bibliography unchanged.`
      );
      return false;
    }

    if (!citekeys.length) {
      await writeProjectBibliography(project, "[]\n", 0);
      await refreshDiagnosticsForProject(project);
      refreshStatus("synced");
      vscode.window.showInformationMessage("No project citekeys found in the manuscript or reference register; bibliography is now empty.");
      return true;
    }

    let writeResult = await writeProjectBibliography(project, exportResult.content, citekeys.length);
    if (!writeResult) {
      return false;
    }

    await refreshDiagnosticsForProject(project);
    refreshStatus("synced");
    vscode.window.showInformationMessage(`Synced ${writeResult.nextCount || exportResult.count} project citekey(s) from Zotero.`);
    return true;
  } finally {
    await zotero.close();
  }
}

async function syncBibliography(project = getCurrentProject(), options = {}) {
  if (!project.found) {
    vscode.window.showWarningMessage("Bibliography sync needs a workspace with paper.yaml.");
    return false;
  }

  const config = vscode.workspace.getConfiguration("academicResearch");
  if (config.get("mcpMode", "bundled") === "bundled" && config.get("enableZoteroMcp", true)) {
    const ready = await ensureInfrastructureReady(true);
    if (!ready) {
      return false;
    }
  }

  if (!config.get("enableZoteroMcp", true)) {
    return syncBibliographyLocalOnly(project, options);
  }

  const maxAttempts = options.retries ?? (options.additionalKeys?.length ? 4 : 1);

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Syncing bibliography from Zotero MCP",
      cancellable: false
    },
    async () => {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (attempt > 1) {
          outputChannel.appendLine(`Retrying bibliography sync (attempt ${attempt}/${maxAttempts})...`);
          await delay(600 * attempt);
        }

        try {
          if (await syncBibliographyFromZotero(project, options)) {
            return true;
          }
        } catch (error) {
          logError("Zotero MCP bibliography sync failed", error);
          if (attempt === maxAttempts) {
            vscode.window.showWarningMessage("Zotero MCP sync failed. See the Academic Research output.");
          }
        }

        if (!options.additionalKeys?.length) {
          break;
        }
      }

      return false;
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

  if (plan.mode === "invalid-citekey") {
    vscode.window.showErrorMessage(plan.reason);
    return false;
  }

  if (plan.mode === "ambiguous-unresolved-marker") {
    vscode.window.showWarningMessage(plan.reason);
    return false;
  }

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
  return true;
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
