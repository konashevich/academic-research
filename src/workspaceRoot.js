"use strict";

const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

function folderHasPaperProject(folderPath) {
  return fs.existsSync(path.join(folderPath, "paper.yaml"));
}

function resolveWorkspaceRoot(resource) {
  const folder = resource ? vscode.workspace.getWorkspaceFolder(resource) : null;
  if (folder) {
    return folder.uri.fsPath;
  }

  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length === 0) {
    return null;
  }

  const activeUri = vscode.window.activeTextEditor?.document?.uri;
  if (activeUri) {
    const activeFolder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (activeFolder) {
      return activeFolder.uri.fsPath;
    }
  }

  const paperFolder = folders.find((entry) => folderHasPaperProject(entry.uri.fsPath));
  if (paperFolder) {
    return paperFolder.uri.fsPath;
  }

  return folders[0].uri.fsPath;
}

module.exports = {
  folderHasPaperProject,
  resolveWorkspaceRoot
};
