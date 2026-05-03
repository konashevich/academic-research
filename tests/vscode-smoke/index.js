"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, description, timeoutMs = 10000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const value = await predicate();
    if (value) {
      return value;
    }
    await delay(100);
  }

  throw new Error(`Timed out waiting for ${description}`);
}

async function activateExtension() {
  const extension = vscode.extensions.getExtension("local.academic-research");
  assert.ok(extension, "Extension should be registered as local.academic-research");
  await extension.activate();
  assert.equal(extension.isActive, true);
}

async function openPaper(workspacePath) {
  const paperUri = vscode.Uri.file(path.join(workspacePath, "paper.md"));
  const document = await vscode.workspace.openTextDocument(paperUri);
  const editor = await vscode.window.showTextDocument(document);
  return { paperUri, document, editor };
}

async function appendSmokeClaims(editor) {
  await editor.edit((editBuilder) => {
    const end = editor.document.positionAt(editor.document.getText().length);
    editBuilder.insert(
      end,
      [
        "",
        "",
        "## Smoke Test Section",
        "",
        "A smoke claim [citation needed].",
        "A missing citation [@NOPE2026].",
        "A placeholder citation [@ref1].",
        ""
      ].join("\n")
    );
  });
  await editor.document.save();
}

async function assertDiagnostics(paperUri) {
  await vscode.commands.executeCommand("academicResearch.verifyCitations");

  const diagnostics = await waitFor(() => {
    const current = vscode.languages.getDiagnostics(paperUri);
    return current.length >= 3 ? current : null;
  }, "citation diagnostics");

  const messages = diagnostics.map((diagnostic) => diagnostic.message).join("\n");
  assert.match(messages, /marked as needing a citation/);
  assert.match(messages, /@NOPE2026 is missing/);
  assert.match(messages, /@ref1 still needs a real source/);
}

async function assertReferenceRegister(workspacePath, editor) {
  const text = editor.document.getText();
  const startOffset = text.indexOf("A smoke claim");
  assert.notEqual(startOffset, -1);

  const endOffset = startOffset + "A smoke claim".length;
  editor.selection = new vscode.Selection(
    editor.document.positionAt(startOffset),
    editor.document.positionAt(endOffset)
  );

  await vscode.commands.executeCommand("academicResearch.addSelectionToRegister");

  const registerPath = path.join(workspacePath, "refs", "reference-register.md");
  await waitFor(() => fs.existsSync(registerPath), "reference register file");

  const register = fs.readFileSync(registerPath, "utf8");
  assert.match(register, /# Reference Register/);
  assert.match(register, /A smoke claim/);
}

async function run() {
  const workspacePath = process.env.ACADEMIC_RESEARCH_SMOKE_WORKSPACE;
  assert.ok(workspacePath, "Smoke workspace path should be passed through the environment");

  await activateExtension();

  assert.equal(vscode.workspace.workspaceFolders.length, 1);
  assert.equal(vscode.workspace.workspaceFolders[0].uri.fsPath, workspacePath);

  const { paperUri, editor } = await openPaper(workspacePath);
  await appendSmokeClaims(editor);
  await assertDiagnostics(paperUri);
  await vscode.window.showTextDocument(editor.document);
  await assertReferenceRegister(workspacePath, editor);
}

module.exports = {
  run
};
