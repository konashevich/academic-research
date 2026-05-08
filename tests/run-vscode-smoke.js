"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, "..");
  const extensionTestsPath = path.resolve(__dirname, "vscode-smoke", "index.js");
  const sourceTemplate = "/mnt/merged_ssd/Papers/academic-paper-template";
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "academic-research-vscode-"));
  const workspacePath = path.join(tempRoot, "paper-workspace");
  const userDataDir = path.join(tempRoot, "user-data");
  const extensionsDir = path.join(tempRoot, "extensions");

  fs.cpSync(sourceTemplate, workspacePath, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.git${path.sep}`) && !source.endsWith(`${path.sep}.git`)
  });

  process.env.ACADEMIC_RESEARCH_SMOKE_WORKSPACE = workspacePath;

  try {
    await runTests({
      vscodeExecutablePath: "/usr/bin/code",
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        workspacePath,
        "--disable-workspace-trust",
        "--skip-welcome",
        "--skip-release-notes",
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`
      ]
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
