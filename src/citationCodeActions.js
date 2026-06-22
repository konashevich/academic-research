"use strict";

const path = require("path");
const vscode = require("vscode");
const { detectAcademicProject } = require("./projectDetector");

const DIAGNOSTIC_CODES = new Set(["citation-needed", "placeholder", "missing"]);

function getCurrentProject() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || !folders.length) {
    return { found: false };
  }
  return detectAcademicProject(folders[0].uri.fsPath);
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

function rangesOverlap(left, right) {
  return !left.end.isBefore(right.start) && !right.end.isBefore(left.start);
}

function makeCommandAction(title, command, args = []) {
  const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
  action.command = { command, title, arguments: args };
  return action;
}

class CitationCodeActionProvider {
  provideCodeActions(document, range, context) {
    const project = getCurrentProject();
    if (!isProjectManuscriptDocument(project, document)) {
      return [];
    }

    const selectedText = range.isEmpty ? "" : document.getText(range).trim();
    if (selectedText) {
      return [
        makeCommandAction("Find citation for selection", "academicResearch.findCitationForSelection"),
        makeCommandAction("Add selection to reference register", "academicResearch.addSelectionToRegister")
      ];
    }

    const actions = [];
    const seen = new Set();

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== "Academic Research" || !DIAGNOSTIC_CODES.has(diagnostic.code)) {
        continue;
      }
      if (!rangesOverlap(range, diagnostic.range)) {
        continue;
      }

      const title = "Find citation for this claim";
      if (seen.has(title)) {
        continue;
      }
      seen.add(title);

      const action = makeCommandAction(title, "academicResearch.findCitationForClaim", [diagnostic.range]);
      action.diagnostics = [diagnostic];
      actions.push(action);
    }

    return actions;
  }
}

function registerCitationCodeActions(context) {
  const provider = new CitationCodeActionProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: "markdown", scheme: "file" },
      provider,
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    )
  );
}

module.exports = {
  CitationCodeActionProvider,
  registerCitationCodeActions
};
