"use strict";

const fs = require("fs");
const path = require("path");

// Manuscript (paper.md) is generated from the Hub form during deploy, not copied from the template.
const COMPONENT_PATHS = {
  bibliography: ["refs/bibliography.json", "refs/reference-register.md"],
  makefile: ["Makefile", "build.sh", "scripts"],
  instructions: [
    ".github/instructions",
    ".github/copilot-instructions.md",
    ".github/skills"
  ],
  vscode: [".vscode/settings.json"],
  csl: ["styles"]
};

const ALWAYS_WRITTEN = ["paper.yaml", ".vscode/mcp.json", ".cursor/mcp.json"];

function normalizeOverwrite(overwrite) {
  if (typeof overwrite === "boolean") {
    return {
      paperYaml: overwrite,
      paperMd: overwrite,
      templateFiles: overwrite,
      confirm: overwrite
    };
  }

  return {
    paperYaml: Boolean(overwrite.paperYaml || overwrite.confirm),
    paperMd: Boolean(overwrite.paperMd || overwrite.confirm),
    templateFiles: Boolean(overwrite.templateFiles || overwrite.confirm),
    confirm: Boolean(overwrite.confirm)
  };
}

function listTemplatePaths(templateRoot, relativePaths) {
  const collected = [];

  for (const relativePath of relativePaths) {
    const absolute = path.join(templateRoot, relativePath);
    if (!fs.existsSync(absolute)) {
      continue;
    }

    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) {
      walkDirectory(absolute, templateRoot, collected);
    } else {
      collected.push(path.relative(templateRoot, absolute));
    }
  }

  return collected.sort();
}

function walkDirectory(dirPath, templateRoot, collected) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const absolute = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkDirectory(absolute, templateRoot, collected);
    } else if (!entry.name.endsWith(".pdf")) {
      collected.push(path.relative(templateRoot, absolute));
    }
  }
}

function classifyConflict(workspaceRoot, relativePath) {
  const absolute = path.join(workspaceRoot, relativePath);
  if (!fs.existsSync(absolute)) {
    return null;
  }

  return {
    path: relativePath,
    exists: true,
    isDirectory: fs.statSync(absolute).isDirectory()
  };
}

function buildScaffoldPlan(options) {
  const {
    workspaceRoot,
    templateRoot,
    toggles = {},
    target,
    overwrite = false
  } = options;

  const overwriteOpts = normalizeOverwrite(overwrite);

  const enabledComponents = Object.entries(COMPONENT_PATHS)
    .filter(([component]) => toggles[component] !== false)
    .map(([component]) => component);

  const filesToCopy = [];
  for (const component of enabledComponents) {
    filesToCopy.push(...listTemplatePaths(templateRoot, COMPONENT_PATHS[component]));
  }

  const uniqueFiles = [...new Set(filesToCopy)];
  const conflicts = [];
  const create = [];
  const skip = [];

  for (const relativePath of uniqueFiles) {
    const conflict = classifyConflict(workspaceRoot, relativePath);
    if (conflict) {
      if (overwriteOpts.templateFiles) {
        create.push(relativePath);
      } else {
        conflicts.push(relativePath);
        skip.push(relativePath);
      }
    } else {
      create.push(relativePath);
    }
  }

  const paperYamlConflict = classifyConflict(workspaceRoot, "paper.yaml");
  if (paperYamlConflict && !overwriteOpts.paperYaml) {
    conflicts.push("paper.yaml");
  }

  let paperMdConflict = null;
  if (toggles.manuscript !== false) {
    paperMdConflict = classifyConflict(workspaceRoot, "paper.md");
    if (paperMdConflict && !overwriteOpts.paperMd) {
      conflicts.push("paper.md");
    }
  }

  const templateConflicts = conflicts.filter((item) => item !== "paper.yaml" && item !== "paper.md");
  const canDeploy =
    (templateConflicts.length === 0 || overwriteOpts.templateFiles) &&
    (!paperYamlConflict || overwriteOpts.paperYaml) &&
    (!paperMdConflict || overwriteOpts.paperMd);

  const steps = [];
  if (toggles.manuscript !== false) {
    steps.push("manuscript");
  }
  if (enabledComponents.includes("bibliography")) {
    steps.push("bibliography");
  }
  if (enabledComponents.includes("makefile")) {
    steps.push("makefile");
  }
  if (enabledComponents.includes("instructions")) {
    steps.push("instructions");
  }
  if (enabledComponents.includes("vscode")) {
    steps.push("vscode");
  }
  steps.push("paper-yaml", "mcp-config");
  if (toggles.csl !== false) {
    steps.push("csl");
  }
  if (toggles.gitInit) {
    steps.push("git-init");
  }

  return {
    workspaceRoot,
    templateRoot,
    toggles,
    target,
    enabledComponents,
    filesToCopy: uniqueFiles,
    create,
    skip,
    conflicts: [...new Set(conflicts)],
    alwaysWritten: ALWAYS_WRITTEN,
    steps,
    canDeploy,
    overwrite: overwriteOpts.templateFiles || overwriteOpts.paperYaml || overwriteOpts.paperMd,
    overwriteOpts
  };
}

module.exports = {
  ALWAYS_WRITTEN,
  COMPONENT_PATHS,
  buildScaffoldPlan,
  classifyConflict,
  listTemplatePaths,
  normalizeOverwrite
};
