"use strict";

const vscode = require("vscode");
const { listBatches } = require("./citationSearchHistoryStore");
const { renderCitationSearchHistoryHtml } = require("./citationSearchHistoryHtml");

function makeNonce() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let index = 0; index < 32; index += 1) {
    text += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return text;
}

class CitationSearchHistoryViewProvider {
  constructor(context, options = {}) {
    this.context = context;
    this.onOpenBatch = options.onOpenBatch || (() => {});
    this.onDeleteBatch = options.onDeleteBatch || (() => {});
    this.getProjectRootDir = options.getProjectRootDir || (() => "");
    this.view = null;
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChange = this._onDidChange.event;
  }

  refresh() {
    this._onDidChange.fire();
    if (this.view) {
      this.render(this.view.webview);
    }
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true
    };

    const changeSubscription = this.onDidChange(() => {
      if (this.view) {
        this.render(this.view.webview);
      }
    });
    webviewView.onDidDispose(() => {
      changeSubscription.dispose();
      this.view = null;
    });

    webviewView.webview.onDidReceiveMessage((message) => {
      if (!message || message.type !== "historyAction" || !message.id) {
        return;
      }
      if (message.action === "open") {
        this.onOpenBatch(message.id);
      } else if (message.action === "delete") {
        this.onDeleteBatch(message.id);
      }
    });

    this.render(webviewView.webview);
  }

  render(webview) {
    const projectRootDir = this.getProjectRootDir();
    const batches = listBatches(projectRootDir).map((batch) => ({
      id: batch.id,
      claim: batch.claim,
      queryText: batch.queryText,
      createdAt: batch.createdAt,
      resultCount: Array.isArray(batch.results) ? batch.results.length : 0,
      droppedCount: Array.isArray(batch.droppedResults) ? batch.droppedResults.length : 0
    }));

    const projectLabel = projectRootDir
      ? "Saved searches for this project"
      : "Open a paper project to scope saved searches";

    webview.html = renderCitationSearchHistoryHtml({
      nonce: makeNonce(),
      batches,
      projectLabel
    });
  }
}

module.exports = {
  CitationSearchHistoryViewProvider
};
