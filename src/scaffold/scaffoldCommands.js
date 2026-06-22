"use strict";

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { resolveWorkspaceRoot } = require("../workspaceRoot");
const { DEFAULT_TEMPLATE_ID } = require("./templateCatalog");
const { buildScaffoldPlan, deployScaffold } = require("./paperScaffold");
const {
  cloneBundledProfile,
  deleteUserProfile,
  exportProfileToWorkspace,
  getProfilesRoot,
  importProfileFromWorkspace,
  listAllProfiles,
  listImportedProfiles
} = require("../profiles/profileRegistry");

function getWorkspaceRoot() {
  return resolveWorkspaceRoot();
}

function getTemplateId() {
  return vscode.workspace.getConfiguration("academicResearch").get("defaultTemplateId", DEFAULT_TEMPLATE_ID);
}

function getDefaultComponents(workspaceRoot) {
  const config = vscode.workspace.getConfiguration("academicResearch");
  const defaults = config.get("scaffoldDefaults") || {};
  const hasGit = fs.existsSync(path.join(workspaceRoot, ".git"));
  return {
    manuscript: defaults.manuscript !== false,
    bibliography: defaults.bibliography !== false,
    makefile: defaults.makefile !== false,
    instructions: defaults.instructions !== false,
    vscode: defaults.vscode !== false,
    csl: defaults.csl !== false,
    gitInit: defaults.gitInit === false ? false : !hasGit
  };
}

async function manageProfiles(context) {
  const templateId = getTemplateId();
  const root = getWorkspaceRoot();
  const imported = root ? listImportedProfiles(root) : [];

  if (imported.length) {
    const entry = await vscode.window.showQuickPick(
      [
        { label: "Import from workspace", description: `${imported.length} profile(s) in .academic/imported-profiles/` },
        { label: "Manage a profile", description: "Clone, export, or delete global profiles" }
      ],
      { title: "Paper profiles" }
    );
    if (!entry) {
      return;
    }
    if (entry.label === "Import from workspace") {
      await importProfileFromWorkspaceCommand(context);
      return;
    }
  }

  const { all: profiles } = listAllProfiles(context.extensionPath, context.globalStorageUri.fsPath, templateId);
  const items = profiles.map((profile) => ({
    label: profile.label,
    description: profile.bundled ? "Bundled (read-only)" : profile.id,
    profile
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: "Manage paper profiles",
    placeHolder: "Select a profile to clone, export, or delete"
  });
  if (!picked) {
    return;
  }

  const actions = picked.profile.bundled
    ? ["Clone to global profile", "Export to workspace"]
    : ["Open profile folder", "Export to workspace", "Delete profile"];

  const action = await vscode.window.showQuickPick(actions, {
    title: picked.profile.label
  });
  if (!action) {
    return;
  }

  if (action === "Clone to global profile") {
    const id = await vscode.window.showInputBox({
      title: "New profile id",
      placeHolder: "my-thesis",
      validateInput: (value) => (/^[a-z0-9-]+$/.test(value) ? null : "Use lowercase letters, numbers, and hyphens.")
    });
    if (!id) {
      return;
    }
    const label = await vscode.window.showInputBox({
      title: "Profile label",
      value: `${picked.profile.label} (copy)`
    });
    await cloneBundledProfile(context.extensionPath, context.globalStorageUri.fsPath, picked.profile.id, id, {
      templateId,
      label: label || id
    });
    vscode.window.showInformationMessage(`Cloned profile '${picked.profile.id}' to '${id}'.`);
    return;
  }

  if (action === "Open profile folder") {
    const folder = path.join(getProfilesRoot(context.globalStorageUri.fsPath), picked.profile.id);
    await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(folder));
    return;
  }

  if (action === "Export to workspace") {
    const root = getWorkspaceRoot();
    if (!root) {
      throw new Error("Open a workspace folder before exporting a profile.");
    }
    const exportPath = exportProfileToWorkspace(
      root,
      picked.profile.id,
      context.globalStorageUri.fsPath,
      context.extensionPath,
      templateId
    );
    vscode.window.showInformationMessage(`Exported profile to ${exportPath}`);
    return;
  }

  if (action === "Delete profile") {
    const confirm = await vscode.window.showWarningMessage(
      `Delete global profile '${picked.profile.id}'?`,
      { modal: true },
      "Delete"
    );
    if (confirm === "Delete") {
      deleteUserProfile(context.globalStorageUri.fsPath, picked.profile.id);
      vscode.window.showInformationMessage(`Deleted profile '${picked.profile.id}'.`);
    }
  }
}

async function openProfilesFolderCommand(context) {
  const folder = getProfilesRoot(context.globalStorageUri.fsPath);
  fs.mkdirSync(folder, { recursive: true });
  await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(folder));
  return folder;
}

async function exportProfileToWorkspaceCommand(context, profileId) {
  const root = getWorkspaceRoot();
  if (!root) {
    throw new Error("Open a workspace folder before exporting a profile.");
  }
  const templateId = getTemplateId();
  const id =
    profileId ||
    (
      await vscode.window.showQuickPick(
        listAllProfiles(context.extensionPath, context.globalStorageUri.fsPath, templateId).all.map((profile) => ({
          label: profile.label,
          description: profile.id,
          id: profile.id
        })),
        { title: "Profile to export" }
      )
    )?.id;
  if (!id) {
    return null;
  }
  return exportProfileToWorkspace(root, id, context.globalStorageUri.fsPath, context.extensionPath, templateId);
}

async function importProfileFromWorkspaceCommand(context, profileId) {
  const root = getWorkspaceRoot();
  if (!root) {
    throw new Error("Open a workspace folder before importing a profile.");
  }

  const id =
    profileId ||
    (
      await vscode.window.showQuickPick(
        listImportedProfiles(root).map((entry) => ({ label: entry, id: entry })),
        { title: "Imported profile to install globally" }
      )
    )?.id;
  if (!id) {
    return null;
  }

  const result = importProfileFromWorkspace(root, id, context.globalStorageUri.fsPath);
  vscode.window.showInformationMessage(`Imported profile '${result.id}' into global storage.`);
  return result;
}

async function cloneTargetProfileCommand(context, args = {}) {
  const templateId = getTemplateId();
  const from =
    args.from ||
    (
      await vscode.window.showQuickPick(
        listAllProfiles(context.extensionPath, context.globalStorageUri.fsPath, templateId)
          .bundled.map((profile) => ({ label: profile.label, id: profile.id })),
        { title: "Bundled profile to clone" }
      )
    )?.id;
  const id =
    args.id ||
    (await vscode.window.showInputBox({
      title: "New profile id",
      validateInput: (value) => (/^[a-z0-9-]+$/.test(value) ? null : "Use lowercase letters, numbers, and hyphens.")
    }));
  if (!from || !id) {
    return null;
  }
  return cloneBundledProfile(context.extensionPath, context.globalStorageUri.fsPath, from, id, {
    templateId,
    label: args.label || id
  });
}

async function scaffoldPaperProjectCommand(context, infrastructureManager, args = {}) {
  const workspaceRoot = args.workspaceRoot || getWorkspaceRoot();
  if (!workspaceRoot) {
    throw new Error("Open a workspace folder before scaffolding a paper project.");
  }

  const config = vscode.workspace.getConfiguration("academicResearch");
  const defaults = config.get("scaffoldDefaults") || {};
  const form = {
    title: args.title || defaults.title || "Untitled Paper",
    authorName: args.authorName || defaults.authorName || "Author",
    affiliation: args.affiliation || defaults.affiliation || "",
    email: args.email || defaults.email || "",
    language: args.language || defaults.language || "en-GB",
    target: args.target || config.get("defaultTarget", "lncs"),
    researchContext: args.researchContext || defaults.researchContext || ""
  };
  const components = args.components || getDefaultComponents(workspaceRoot);
  const overwrite = {
    confirm: Boolean(args.overwrite?.confirm || args.overwrite?.all || args.overwrite),
    paperYaml: Boolean(args.overwrite?.paperYaml || args.overwrite?.confirm || args.overwrite?.all || args.overwrite),
    paperMd: Boolean(args.overwrite?.paperMd || args.overwrite?.confirm || args.overwrite?.all || args.overwrite),
    templateFiles: Boolean(
      args.overwrite?.templateFiles || args.overwrite?.confirm || args.overwrite?.all || args.overwrite
    )
  };

  if (args.dryRun) {
    return buildScaffoldPlan({
      workspaceRoot,
      extensionPath: context.extensionPath,
      templateId: getTemplateId(),
      components,
      target: form.target,
      overwrite
    });
  }

  const result = await deployScaffold({
    context,
    workspaceRoot,
    extensionPath: context.extensionPath,
    templateId: getTemplateId(),
    form,
    components,
    overwrite,
    getEndpoints: () => infrastructureManager.getEndpoints()
  });

  if (!result.ok) {
    throw new Error(result.reason === "conflicts"
      ? "Scaffold blocked by existing files. Pass overwrite: true to replace paper.yaml / paper.md."
      : "Paper scaffold failed.");
  }

  return result;
}

function registerScaffoldCommands(context, infrastructureManager) {
  return [
    vscode.commands.registerCommand("academicResearch.scaffoldPaperProject", (args) =>
      scaffoldPaperProjectCommand(context, infrastructureManager, args)
    ),
    vscode.commands.registerCommand("academicResearch.manageProfiles", () => manageProfiles(context)),
    vscode.commands.registerCommand("academicResearch.openProfilesFolder", () => openProfilesFolderCommand(context)),
    vscode.commands.registerCommand("academicResearch.exportProfileToWorkspace", (profileId) =>
      exportProfileToWorkspaceCommand(context, profileId)
    ),
    vscode.commands.registerCommand("academicResearch.cloneTargetProfile", (args) =>
      cloneTargetProfileCommand(context, args)
    ),
    vscode.commands.registerCommand("academicResearch.importProfileFromWorkspace", (profileId) =>
      importProfileFromWorkspaceCommand(context, profileId)
    )
  ];
}

module.exports = {
  cloneTargetProfileCommand,
  exportProfileToWorkspaceCommand,
  importProfileFromWorkspaceCommand,
  manageProfiles,
  openProfilesFolderCommand,
  registerScaffoldCommands,
  scaffoldPaperProjectCommand
};
