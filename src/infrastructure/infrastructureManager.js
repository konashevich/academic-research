"use strict";

const vscode = require("vscode");
const { CredentialStore } = require("./credentialStore");
const { ProcessManager } = require("./processManager");
const { checkPrerequisites } = require("./prerequisiteChecker");
const { getFreePort } = require("./getFreePort");
const {
  buildScholarCommand,
  buildZoteroCommand,
  DEFAULT_ZOTERO_PORT,
  waitForPort
} = require("./mcpRuntime");
const { runHealthChecks } = require("./healthMonitor");
const { writeWorkspaceMcpConfigs } = require("./mcpConfigWriter");
const { fetchZoteroUserId } = require("./zoteroApi");

const DEFAULT_HOST = "127.0.0.1";

class InfrastructureManager {
  constructor(context, options = {}) {
    this.context = context;
    this.extensionPath = context.extensionPath;
    this.credentials = new CredentialStore(context);
    this.processes = new ProcessManager(options.logFn);
    this.endpoints = {
      host: DEFAULT_HOST,
      zoteroPort: 0,
      scholarPort: 0
    };
    this.state = {
      phase: "idle",
      prerequisites: null,
      health: null,
      lastError: "",
      logTail: []
    };
    this._listeners = [];
  }

  onDidChangeState(listener) {
    this._listeners.push(listener);
    return {
      dispose: () => {
        this._listeners = this._listeners.filter((item) => item !== listener);
      }
    };
  }

  _emit() {
    const snapshot = this.getState();
    for (const listener of this._listeners) {
      try {
        listener(snapshot);
      } catch (_error) {}
    }
  }

  _setPhase(phase, lastError = "") {
    this.state.phase = phase;
    this.state.lastError = lastError;
    this._emit();
  }

  getConfiguration() {
    return vscode.workspace.getConfiguration("academicResearch");
  }

  getMcpMode() {
    return this.getConfiguration().get("mcpMode", "bundled");
  }

  isBundledMode() {
    return this.getMcpMode() !== "external";
  }

  getEndpoints(project = null) {
    if (!this.isBundledMode()) {
      const config = this.getConfiguration();
      return {
        host: config.get("mcpHost") || project?.config?.mcp?.host || DEFAULT_HOST,
        zoteroPort: config.get("zoteroPort") || project?.config?.mcp?.zoteroPort || 9180,
        scholarPort: config.get("scholarPort") || project?.config?.mcp?.scholarPort || 3847
      };
    }

    if (this.endpoints.zoteroPort && this.endpoints.scholarPort) {
      return { ...this.endpoints };
    }

    const config = this.getConfiguration();
    return {
      host: config.get("mcpHost") || DEFAULT_HOST,
      zoteroPort: config.get("zoteroPort") || 9180,
      scholarPort: config.get("scholarPort") || 3847
    };
  }

  async checkEnvironment() {
    const prerequisites = await checkPrerequisites();
    this.state.prerequisites = prerequisites;
    this._emit();
    return prerequisites;
  }

  async saveZoteroCredentials(apiKey, libraryId) {
    await this.credentials.setZoteroApiKey(apiKey);
    await this.credentials.setZoteroLibraryId(libraryId);
    this._emit();
  }

  async detectLibraryIdFromApiKey(apiKey) {
    const libraryId = await fetchZoteroUserId(apiKey);
    await this.credentials.setZoteroLibraryId(libraryId);
    this._emit();
    return libraryId;
  }

  async writeWorkspaceMcpConfig(workspaceRoot) {
    const endpoints = this.getEndpoints();
    if (!endpoints.zoteroPort || !endpoints.scholarPort) {
      throw new Error("MCP endpoints are not available yet. Run setup first.");
    }
    return writeWorkspaceMcpConfigs(workspaceRoot, endpoints);
  }

  async getZoteroCredentialsForUi() {
    return {
      apiKey: (await this.credentials.getZoteroApiKey()) || "",
      libraryId: this.credentials.getZoteroLibraryId(),
      cursorApiKey: (await this.credentials.getCursorApiKey()) || ""
    };
  }

  async getCursorApiKey() {
    return this.credentials.getCursorApiKey();
  }

  async saveCursorApiKey(apiKey) {
    await this.credentials.setCursorApiKey(apiKey);
    this._emit();
  }

  isSetupComplete() {
    if (!this.isBundledMode()) {
      return true;
    }
    return this.getConfiguration().get("setupComplete", false) === true;
  }

  async markSetupComplete(value) {
    await this.getConfiguration().update("setupComplete", value, vscode.ConfigurationTarget.Global);
    this._emit();
  }

  getInfraStatusLabel() {
    if (!this.isBundledMode()) {
      return "external";
    }
    if (!this.isSetupComplete()) {
      return "setup needed";
    }
    if (this.state.health && !this.state.health.ok) {
      return "degraded";
    }
    if (this.processes.isRunning("zotero") && this.processes.isRunning("scholar")) {
      return "ready";
    }
    return "stopped";
  }

  getState() {
    return {
      phase: this.state.phase,
      prerequisites: this.state.prerequisites,
      health: this.state.health,
      lastError: this.state.lastError,
      endpoints: this.getEndpoints(),
      infraStatus: this.getInfraStatusLabel(),
      setupComplete: this.isSetupComplete(),
      mcpMode: this.getMcpMode(),
      processes: {
        zotero: this.processes.isRunning("zotero"),
        scholar: this.processes.isRunning("scholar")
      }
    };
  }

  async startBundledServers() {
    if (!this.isBundledMode()) {
      return { ok: true, detail: "external mode" };
    }

    const prerequisites = await this.checkEnvironment();
    if (!prerequisites.ok) {
      const message = "Python or uv is not available.";
      this._setPhase("error", message);
      return { ok: false, detail: message };
    }

    const hasCredentials = await this.credentials.hasZoteroCredentials();
    if (!hasCredentials) {
      const message = "Zotero API key and library ID are required.";
      this._setPhase("error", message);
      return { ok: false, detail: message };
    }

    this._setPhase("starting");

    const apiKey = await this.credentials.getZoteroApiKey();
    const libraryId = this.credentials.getZoteroLibraryId();
    const zoteroPort = DEFAULT_ZOTERO_PORT;
    const scholarPort = await getFreePort(DEFAULT_HOST);

    const zoteroAlreadyRunning = await waitForPort(DEFAULT_HOST, zoteroPort, 500);
    if (!zoteroAlreadyRunning) {
      const zoteroSpec = buildZoteroCommand();
      this.processes.start("zotero", zoteroSpec.command, zoteroSpec.args, {
        env: {
          ...zoteroSpec.env,
          ZOTERO_API_KEY: apiKey,
          ZOTERO_LIBRARY_ID: libraryId,
          ZOTERO_LIBRARY_TYPE: "user",
          MCP_PORT: String(zoteroPort)
        }
      });
    }

    const scholarSpec = buildScholarCommand(this.extensionPath, scholarPort);
    this.processes.start("scholar", scholarSpec.command, scholarSpec.args, {
      cwd: scholarSpec.cwd,
      env: scholarSpec.env
    });

    const [zoteroReady, scholarReady] = await Promise.all([
      waitForPort(DEFAULT_HOST, zoteroPort),
      waitForPort(DEFAULT_HOST, scholarPort)
    ]);

    if (!zoteroReady || !scholarReady) {
      const message = `Servers failed to start (zotero=${zoteroReady}, scholar=${scholarReady}).`;
      this._setPhase("error", message);
      return { ok: false, detail: message };
    }

    this.endpoints = {
      host: DEFAULT_HOST,
      zoteroPort,
      scholarPort
    };

    await this.getConfiguration().update("mcpHost", DEFAULT_HOST, vscode.ConfigurationTarget.Global);
    await this.getConfiguration().update("zoteroPort", zoteroPort, vscode.ConfigurationTarget.Global);
    await this.getConfiguration().update("scholarPort", scholarPort, vscode.ConfigurationTarget.Global);

    this._setPhase("running");
    return { ok: true, detail: "servers started" };
  }

  async verifyServices() {
    this._setPhase("verifying");
    const endpoints = this.getEndpoints();
    const openAlexEmail = this.getConfiguration().get("openAlexEmail", "");
    const health = await runHealthChecks(endpoints, { openAlexEmail });
    this.state.health = health;
    if (health.ok) {
      await this.markSetupComplete(true);
      this._setPhase("ready");
    } else {
      this._setPhase("degraded", "One or more services failed verification.");
    }
    this._emit();
    return health;
  }

  async runSetup(apiKey, libraryId) {
    await this.saveZoteroCredentials(apiKey, libraryId);
    const started = await this.startBundledServers();
    if (!started.ok) {
      return { ok: false, started, health: null };
    }
    const health = await this.verifyServices();
    return { ok: health.ok, started, health };
  }

  async ensureRunning() {
    if (!this.isBundledMode()) {
      return { ok: true };
    }

    const endpoints = this.getEndpoints();
    if (endpoints.zoteroPort && endpoints.scholarPort) {
      const [zoteroReady, scholarReady] = await Promise.all([
        waitForPort(endpoints.host, endpoints.zoteroPort, 500),
        waitForPort(endpoints.host, endpoints.scholarPort, 500)
      ]);
      if (zoteroReady && scholarReady) {
        return { ok: true };
      }
    }

    if (this.processes.isRunning("zotero") && this.processes.isRunning("scholar")) {
      return { ok: true };
    }
    return this.startBundledServers();
  }

  stop() {
    this.processes.stopAll();
    this._setPhase("idle");
  }

  dispose() {
    this.stop();
    this._listeners = [];
  }
}

let singleton = null;

function createInfrastructureManager(context, options = {}) {
  if (singleton) {
    singleton.dispose();
  }
  singleton = new InfrastructureManager(context, options);
  return singleton;
}

function getInfrastructureManager() {
  return singleton;
}

module.exports = {
  InfrastructureManager,
  createInfrastructureManager,
  getInfrastructureManager
};
