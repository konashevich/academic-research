"use strict";

const fs = require("fs");
const path = require("path");
const { readAcademicPaperYaml } = require("./paperYaml");

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (_error) {
    return false;
  }
}

function detectMakeTargets(rootDir) {
  const makefilePath = path.join(rootDir, "Makefile");
  if (!fileExists(makefilePath)) {
    return [];
  }

  const content = fs.readFileSync(makefilePath, "utf8");
  const targets = [];
  const regex = /^([A-Za-z0-9_.-]+):(?:\s|$)/gm;
  let match;

  while ((match = regex.exec(content))) {
    if (!match[1].startsWith(".")) {
      targets.push(match[1]);
    }
  }

  return [...new Set(targets)];
}

function resolveProjectPath(rootDir, relativePath) {
  return path.resolve(rootDir, relativePath || "");
}

function detectAcademicProject(rootDir) {
  const paperYamlPath = path.join(rootDir, "paper.yaml");

  if (!fileExists(paperYamlPath)) {
    return {
      mode: "generic",
      rootDir,
      found: false,
      reason: "paper.yaml not found"
    };
  }

  const { config } = readAcademicPaperYaml(rootDir);
  const manuscriptPath = resolveProjectPath(rootDir, config.project.manuscript);
  const bibliographyPath = resolveProjectPath(rootDir, config.project.bibliography);
  const makeTargets = detectMakeTargets(rootDir);

  return {
    mode: "template",
    rootDir,
    found: true,
    config,
    paths: {
      paperYaml: paperYamlPath,
      manuscript: manuscriptPath,
      bibliography: bibliographyPath,
      referenceRegister: path.join(rootDir, "refs", "reference-register.md"),
      vscodeMcp: path.join(rootDir, ".vscode", "mcp.json"),
      referencesInstructions: path.join(rootDir, ".github", "instructions", "references-workflow.instructions.md"),
      factCheckInstructions: path.join(rootDir, ".github", "instructions", "fact-check-workflow.instructions.md")
    },
    exists: {
      manuscript: fileExists(manuscriptPath),
      bibliography: fileExists(bibliographyPath),
      vscodeMcp: fileExists(path.join(rootDir, ".vscode", "mcp.json")),
      referencesInstructions: fileExists(path.join(rootDir, ".github", "instructions", "references-workflow.instructions.md")),
      factCheckInstructions: fileExists(path.join(rootDir, ".github", "instructions", "fact-check-workflow.instructions.md"))
    },
    makeTargets
  };
}

module.exports = {
  detectAcademicProject,
  detectMakeTargets,
  fileExists,
  resolveProjectPath
};
