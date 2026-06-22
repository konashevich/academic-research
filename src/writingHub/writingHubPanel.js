"use strict";

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { resolveWorkspaceRoot } = require("../workspaceRoot");
const { renderWritingHubHtml } = require("./writingHubHtml");
const {
  createHubViewModel,
  createDefaultComponents,
  createDefaultProjectForm,
  nextStep,
  previousStep,
  normalizeStep
} = require("./writingHubState");
const { DEFAULT_TEMPLATE_ID } = require("../scaffold/templateCatalog");
const { createPaperScaffold } = require("../scaffold/paperScaffold");
const { listAllProfiles } = require("../profiles/profileRegistry");

function makeNonce() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let index = 0; index < 32; index += 1) {
    text += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return text;
}

class WritingHubPanel {
  constructor(context, infrastructureManager, options = {}) {
    this.context = context;
    this.infrastructure = infrastructureManager;
    this.onOpenCitationTips = options.onOpenCitationTips || (() => {});
    this.onOpenLogs = options.onOpenLogs || (() => {});
    this.onConnectAiChat = options.onConnectAiChat || (async () => []);
    this.onDeployComplete = options.onDeployComplete || (() => {});
    this.onManageProfiles = options.onManageProfiles || (async () => {});
    this.panel = null;
    this.step = "welcome";
    this.busy = false;
    this.credentials = { apiKey: "", libraryId: "", cursorApiKey: "" };
    this.project = createDefaultProjectForm(this.getExtensionConfig());
    this.components = createDefaultComponents(this.getExtensionConfig(), this.workspaceHasGit());
    this.deploy = {
      plan: null,
      progress: [],
      done: false,
      error: "",
      warnings: [],
      overwritePaperYaml: false,
      overwritePaperMd: false,
      overwriteTemplateFiles: false
    };
    this.disposables = [];

    this.disposables.push(
      this.infrastructure.onDidChangeState(() => {
        this.refresh();
      })
    );
  }

  getExtensionConfig() {
    return vscode.workspace.getConfiguration("academicResearch");
  }

  getTemplateId() {
    return this.getExtensionConfig().get("defaultTemplateId", DEFAULT_TEMPLATE_ID);
  }

  getScaffold() {
    return createPaperScaffold({
      extensionPath: this.context.extensionPath,
      globalStoragePath: this.context.globalStorageUri.fsPath,
      templateId: this.getTemplateId(),
      defaultToggles: this.getExtensionConfig().get("scaffoldDefaults") || {}
    });
  }

  workspaceHasGit() {
    const root = this.getWorkspaceRoot();
    return Boolean(root && fs.existsSync(path.join(root, ".git")));
  }

  getWorkspaceRoot() {
    return resolveWorkspaceRoot();
  }

  async preloadCredentials() {
    this.credentials = await this.infrastructure.getZoteroCredentialsForUi();
  }

  async open(step = "welcome") {
    this.step = normalizeStep(step);
    await this.preloadCredentials();

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.refresh();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "academicResearch.writingHub",
      "Academic Writing Hub",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.onDidDispose(() => {
      this.panel = null;
    }, null, this.context.subscriptions);

    this.panel.webview.onDidReceiveMessage((message) => {
      this.handleMessage(message).catch((error) => {
        vscode.window.showErrorMessage(`Writing Hub action failed: ${error.message}`);
        this.busy = false;
        this.refresh();
      });
    }, null, this.context.subscriptions);

    this.refresh();
  }

  buildView() {
    const infra = this.infrastructure.getState();
    const endpoints = infra.endpoints || {};
    const endpointsLabel = endpoints.zoteroPort
      ? `${endpoints.host || "127.0.0.1"}:${endpoints.zoteroPort}, scholar ${endpoints.scholarPort}`
      : "not configured";

    const { all: profiles } = listAllProfiles(
      this.context.extensionPath,
      this.context.globalStorageUri.fsPath,
      this.getTemplateId()
    );

    return createHubViewModel({
      step: this.step,
      busy: this.busy,
      credentials: this.credentials,
      project: this.project,
      components: this.components,
      profiles,
      deploy: this.deploy,
      infra: {
        ...infra,
        endpointsLabel
      }
    });
  }

  refresh() {
    if (!this.panel) {
      return;
    }
    const nonce = makeNonce();
    const view = this.buildView();
    this.panel.webview.html = renderWritingHubHtml({ nonce, view });
    this.panel.webview.postMessage({ type: "hubState", busy: this.busy });
  }

  applyProjectFields(message) {
    this.project = {
      ...this.project,
      title: message.title ?? this.project.title,
      authorName: message.authorName ?? this.project.authorName,
      affiliation: message.affiliation ?? this.project.affiliation,
      email: message.email ?? this.project.email,
      language: message.language ?? this.project.language,
      target: message.target ?? this.project.target,
      researchContext: message.researchContext ?? this.project.researchContext
    };
    if (message.components) {
      this.components = { ...this.components, ...message.components };
    }
    if (message.overwritePaperYaml !== undefined) {
      this.deploy.overwritePaperYaml = Boolean(message.overwritePaperYaml);
    }
    if (message.overwritePaperMd !== undefined) {
      this.deploy.overwritePaperMd = Boolean(message.overwritePaperMd);
    }
    if (message.overwriteTemplateFiles !== undefined) {
      this.deploy.overwriteTemplateFiles = Boolean(message.overwriteTemplateFiles);
    }
  }

  buildOverwriteOptions() {
    return {
      paperYaml: this.deploy.overwritePaperYaml,
      paperMd: this.deploy.overwritePaperMd,
      templateFiles: this.deploy.overwriteTemplateFiles
    };
  }

  prepareDeployPlan() {
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) {
      throw new Error("Open a workspace folder before deploying a paper project.");
    }

    const scaffold = this.getScaffold();
    this.deploy.plan = scaffold.buildPlan({
      workspaceRoot,
      form: this.project,
      toggles: this.components,
      overwrite: this.buildOverwriteOptions()
    });
    this.deploy.error = "";
    this.deploy.progress = [];
    this.deploy.done = false;
  }

  async runDeploy() {
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) {
      throw new Error("Open a workspace folder before deploying a paper project.");
    }

    if (!this.project.title?.trim() || !this.project.authorName?.trim()) {
      throw new Error("Paper title and author name are required.");
    }

    const endpoints = this.infrastructure.getEndpoints();

    const scaffold = this.getScaffold();
    const result = await scaffold.deploy({
      workspaceRoot,
      form: this.project,
      toggles: this.components,
      overwrite: this.buildOverwriteOptions(),
      mcp: endpoints,
      onProgress: (item) => {
        this.deploy.progress = [...this.deploy.progress, item];
        this.refresh();
      }
    });

    if (!result.ok) {
      this.deploy.error =
        result.reason === "conflicts"
          ? "Some files already exist. Enable the overwrite options below for the files you want to replace."
          : result.error || "Deployment failed.";
      this.deploy.plan = result.plan;
      return;
    }

    this.deploy.plan = result.plan;
    this.deploy.progress = result.progress || [];
    this.deploy.warnings = result.warnings || [];
    this.deploy.done = true;
    this.deploy.error = "";
    this.onDeployComplete(workspaceRoot, {
      infraReady: this.infrastructure.isSetupComplete(),
      warnings: this.deploy.warnings
    });
  }

  async handleMessage(message) {
    if (!message || message.type !== "hubAction") {
      return;
    }

    if (message.apiKey !== undefined || message.libraryId !== undefined || message.cursorApiKey !== undefined) {
      this.credentials = {
        apiKey: message.apiKey ?? this.credentials.apiKey,
        libraryId: message.libraryId ?? this.credentials.libraryId,
        cursorApiKey: message.cursorApiKey ?? this.credentials.cursorApiKey
      };
      if (message.cursorApiKey !== undefined) {
        await this.infrastructure.saveCursorApiKey(this.credentials.cursorApiKey);
      }
    }

    this.applyProjectFields(message);

    switch (message.action) {
      case "saveCursorApiKey":
        await this.infrastructure.saveCursorApiKey(this.credentials.cursorApiKey);
        return;
      case "skipToProject":
        this.step = "project";
        this.busy = false;
        this.refresh();
        return;
      case "nextStep":
        if (this.step === "infrastructure") {
          await this.infrastructure.saveCursorApiKey(this.credentials.cursorApiKey);
        }
        if (this.step === "project") {
          this.prepareDeployPlan();
        }
        this.step = nextStep(this.step);
        if (this.step === "deploy" && !this.deploy.plan) {
          this.prepareDeployPlan();
        }
        this.busy = false;
        if (this.step === "infrastructure") {
          await this.infrastructure.checkEnvironment();
        }
        this.refresh();
        return;
      case "prevStep":
        if (this.step === "infrastructure") {
          await this.infrastructure.saveCursorApiKey(this.credentials.cursorApiKey);
        }
        this.step = previousStep(this.step);
        this.busy = false;
        this.refresh();
        return;
      case "checkEnvironment":
        this.busy = true;
        this.refresh();
        await this.infrastructure.checkEnvironment();
        this.busy = false;
        this.refresh();
        return;
      case "runSetup":
        this.busy = true;
        this.refresh();
        await this.infrastructure.runSetup(this.credentials.apiKey, this.credentials.libraryId);
        await this.infrastructure.saveCursorApiKey(this.credentials.cursorApiKey);
        this.busy = false;
        this.panel?.webview.postMessage({ type: "hubComplete" });
        this.refresh();
        return;
      case "detectLibraryId":
        this.busy = true;
        this.refresh();
        this.credentials.libraryId = await this.infrastructure.detectLibraryIdFromApiKey(this.credentials.apiKey);
        this.busy = false;
        this.refresh();
        return;
      case "connectAiChat":
        this.busy = true;
        this.refresh();
        await this.onConnectAiChat();
        this.busy = false;
        this.panel?.webview.postMessage({ type: "hubComplete" });
        this.refresh();
        return;
      case "openLogs":
        this.onOpenLogs();
        return;
      case "openCitationSearch":
        this.onOpenCitationTips();
        return;
      case "manageProfiles":
        await this.onManageProfiles();
        this.refresh();
        return;
      case "refreshDeployPlan":
        this.applyProjectFields(message);
        if (this.step === "deploy") {
          try {
            this.prepareDeployPlan();
            this.deploy.error = "";
          } catch (error) {
            this.deploy.error = error.message;
          }
        }
        this.refresh();
        return;
      case "deployProject":
        this.busy = true;
        this.refresh();
        await this.runDeploy();
        this.busy = false;
        this.panel?.webview.postMessage({ type: "hubComplete" });
        this.refresh();
        return;
      case "openPaperMd": {
        const root = this.getWorkspaceRoot();
        if (root) {
          const doc = await vscode.workspace.openTextDocument(path.join(root, "paper.md"));
          await vscode.window.showTextDocument(doc, { preview: false });
        }
        return;
      }
      case "continueWriting":
        this.panel?.dispose();
        return;
      default:
        return;
    }
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
  }
}

module.exports = {
  WritingHubPanel
};
