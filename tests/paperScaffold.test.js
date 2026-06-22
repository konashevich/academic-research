"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { buildScaffoldPlan, deployScaffold } = require("../src/scaffold/paperScaffold");
const { buildPaperYaml } = require("../src/scaffold/paperYamlWriter");
const { buildScaffoldPlan: buildPlan } = require("../src/scaffold/scaffoldPlan");

const extensionPath = path.resolve(__dirname, "..");

test("buildPaperYaml writes scalar-compatible project fields", () => {
  const yaml = buildPaperYaml(
    {
      title: "Test Paper",
      authorName: "Ada Lovelace",
      affiliation: "Analytical Engine Lab",
      email: "ada@example.edu",
      language: "en-GB",
      target: "lncs"
    },
    {
      lncs: {
        description: "LNCS",
        csl: "styles/lncs.csl",
        documentclass: "article",
        classoption: "twocolumn",
        template: "templates/lncs/header.tex",
        geometry: "margin=0.8in",
        fontsize: "10pt"
      }
    },
    { host: "127.0.0.1", zoteroPort: 9180, scholarPort: 3847 }
  );

  assert.match(yaml, /title: "Test Paper"/);
  assert.match(yaml, /name: "Ada Lovelace"/);
  assert.match(yaml, /target: lncs/);
  assert.match(yaml, /zotero_port: 9180/);
});

test("scaffold plan detects conflicts on existing paper.yaml", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-plan-"));
  const workspaceRoot = path.join(tempRoot, "workspace");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "paper.yaml"), "target: lncs\n", "utf8");

  try {
    const templateRoot = path.join(extensionPath, "vendor/iade-paper-template");
    const plan = buildPlan({
      workspaceRoot,
      templateRoot,
      toggles: { manuscript: true, bibliography: true, makefile: true, instructions: true, vscode: true, csl: false, gitInit: false },
      target: "lncs",
      overwrite: false
    });

    assert.ok(plan.conflicts.includes("paper.yaml"));
    assert.equal(plan.canDeploy, false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("buildScaffoldPlan enriches UI file list for empty workspace", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-ui-"));
  const workspaceRoot = path.join(tempRoot, "workspace");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  try {
    const plan = buildScaffoldPlan({
      workspaceRoot,
      extensionPath,
      templateId: "iade-default",
      components: {
        manuscript: true,
        bibliography: true,
        makefile: true,
        instructions: false,
        vscode: true,
        csl: false,
        gitInit: false
      },
      target: "lncs"
    });

    assert.ok(plan.files.some((file) => file.path === "paper.md" && file.action === "create"));
    assert.ok(!plan.create.includes("paper.md"), "paper.md must not be copied from the template");
    assert.equal(plan.conflicts.length, 0);
    assert.ok(plan.create.length > 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("deploy writes manuscript from form, not bundled placeholder", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-deploy-"));
  const workspaceRoot = path.join(tempRoot, "workspace");
  const globalStoragePath = path.join(tempRoot, "storage");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(globalStoragePath, { recursive: true });

  const uniqueTitle = "Unique Deploy Title 7f3a";

  try {
    const result = await deployScaffold({
      context: { globalStorageUri: { fsPath: globalStoragePath } },
      workspaceRoot,
      extensionPath,
      templateId: "iade-default",
      form: {
        title: uniqueTitle,
        authorName: "Jane Doe",
        affiliation: "Example U",
        email: "jane@example.edu",
        language: "en-GB",
        target: "lncs"
      },
      components: {
        manuscript: true,
        bibliography: true,
        makefile: true,
        instructions: false,
        vscode: false,
        csl: false,
        gitInit: false
      },
      overwrite: {},
      getEndpoints: () => ({ host: "127.0.0.1", zoteroPort: 9180, scholarPort: 3847 })
    });

    assert.equal(result.ok, true);
    const manuscript = fs.readFileSync(path.join(workspaceRoot, "paper.md"), "utf8");
    assert.match(manuscript, new RegExp(uniqueTitle));
    assert.doesNotMatch(manuscript, /Your Paper Title Here/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("deploy copies headers for all profiles, not only active target", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-headers-"));
  const workspaceRoot = path.join(tempRoot, "workspace");
  const globalStoragePath = path.join(tempRoot, "storage");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(globalStoragePath, { recursive: true });

  try {
    const result = await deployScaffold({
      context: { globalStorageUri: { fsPath: globalStoragePath } },
      workspaceRoot,
      extensionPath,
      templateId: "iade-default",
      form: {
        title: "Header Test",
        authorName: "Author",
        target: "lncs"
      },
      components: {
        manuscript: false,
        bibliography: false,
        makefile: false,
        instructions: false,
        vscode: false,
        csl: false,
        gitInit: false
      },
      overwrite: { paperYaml: true },
      getEndpoints: () => ({})
    });

    assert.equal(result.ok, true);
    const { mergeTargetsForDeploy } = require("../src/profiles/profileRegistry");
    const targets = mergeTargetsForDeploy(extensionPath, globalStoragePath, "iade-default");
    for (const profileId of Object.keys(targets)) {
      const headerPath = path.join(workspaceRoot, "templates", profileId, "header.tex");
      assert.ok(fs.existsSync(headerPath), `missing header for ${profileId}`);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("deploy skips research context when instructions toggle is off", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-research-"));
  const workspaceRoot = path.join(tempRoot, "workspace");
  const globalStoragePath = path.join(tempRoot, "storage");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(globalStoragePath, { recursive: true });

  try {
    const result = await deployScaffold({
      context: { globalStorageUri: { fsPath: globalStoragePath } },
      workspaceRoot,
      extensionPath,
      templateId: "iade-default",
      form: {
        title: "No Instructions",
        authorName: "Author",
        target: "lncs",
        researchContext: "Secret agent notes"
      },
      components: {
        manuscript: false,
        bibliography: false,
        makefile: false,
        instructions: false,
        vscode: false,
        csl: false,
        gitInit: false
      },
      overwrite: { paperYaml: true },
      getEndpoints: () => ({})
    });

    assert.equal(result.ok, true);
    const researchPath = path.join(workspaceRoot, ".github/instructions/research.instructions.md");
    assert.equal(fs.existsSync(researchPath), false);
    assert.equal(result.progress.some((item) => item.step === "research-context"), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("scaffold plan supports split overwrite flags", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-split-"));
  const workspaceRoot = path.join(tempRoot, "workspace");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "paper.yaml"), "target: lncs\n", "utf8");
  fs.writeFileSync(path.join(workspaceRoot, "Makefile"), "all:\n", "utf8");

  try {
    const templateRoot = path.join(extensionPath, "vendor/iade-paper-template");
    const partialOverwrite = buildPlan({
      workspaceRoot,
      templateRoot,
      toggles: { manuscript: true, bibliography: false, makefile: true, instructions: false, vscode: false, csl: false, gitInit: false },
      overwrite: { paperYaml: true, paperMd: false, templateFiles: false }
    });

    assert.equal(partialOverwrite.canDeploy, false);
    assert.ok(partialOverwrite.conflicts.includes("Makefile"));
    assert.ok(!partialOverwrite.conflicts.includes("paper.yaml"));

    const fullOverwrite = buildPlan({
      workspaceRoot,
      templateRoot,
      toggles: { manuscript: true, bibliography: false, makefile: true, instructions: false, vscode: false, csl: false, gitInit: false },
      overwrite: { paperYaml: true, paperMd: true, templateFiles: true }
    });

    assert.equal(fullOverwrite.canDeploy, true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
