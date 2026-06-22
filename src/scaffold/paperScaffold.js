"use strict";

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const { buildScaffoldPlan: buildPlan, normalizeOverwrite } = require("./scaffoldPlan");
const { buildManuscriptFrontmatter, buildPaperYaml } = require("./paperYamlWriter");
const { writeScaffoldMcpConfig } = require("./mcpConfigWriter");
const { downloadCslStyles } = require("./cslDownloader");
const {
  DEFAULT_TEMPLATE_ID,
  getDefaultScaffoldToggles,
  getExtensionTemplateRoot
} = require("./templateCatalog");
const {
  copyAllProfileHeadersToWorkspace,
  mergeTargetsForDeploy
} = require("../profiles/profileRegistry");

const RESEARCH_INSTRUCTIONS = ".github/instructions/research.instructions.md";

const DEFAULT_REFERENCE_REGISTER = `# Reference Register

Track unresolved citation needs while writing.

| ID | Claim | Query | Status | Source |
|----|-------|-------|--------|--------|
`;

function copyFileOrDirectory(source, dest, overwrite) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      copyFileOrDirectory(path.join(source, entry.name), path.join(dest, entry.name), overwrite);
    }
    return;
  }

  if (fs.existsSync(dest) && !overwrite) {
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(source, dest);
}

function componentsToToggles(components) {
  return {
    manuscript: components.manuscript !== false,
    bibliography: components.bibliography !== false,
    makefile: components.makefile !== false,
    instructions: components.instructions !== false,
    vscode: components.vscode !== false,
    csl: components.csl !== false,
    gitInit: Boolean(components.gitInit)
  };
}

function enrichPlanForUi(plan) {
  const overwriteOpts = plan.overwriteOpts || normalizeOverwrite(plan.overwrite);
  const files = [
    ...plan.create.map((relativePath) => ({ path: relativePath, action: "create" })),
    ...plan.skip.map((relativePath) => ({ path: relativePath, action: "skip" }))
  ];

  if (plan.conflicts.includes("paper.yaml") && !overwriteOpts.paperYaml) {
    files.push({ path: "paper.yaml", action: "skip" });
  } else {
    files.push({ path: "paper.yaml", action: "create" });
  }

  if (plan.toggles.manuscript !== false) {
    if (plan.conflicts.includes("paper.md") && !overwriteOpts.paperMd) {
      files.push({ path: "paper.md", action: "skip" });
    } else {
      files.push({ path: "paper.md", action: "create" });
    }
  }

  files.push({ path: ".vscode/mcp.json", action: "create" });

  return {
    ...plan,
    files,
    conflicts: plan.conflicts,
    overwriteOpts
  };
}

function buildScaffoldPlan(options) {
  const templateId = options.templateId || DEFAULT_TEMPLATE_ID;
  const templateRoot = getExtensionTemplateRoot(options.extensionPath, templateId);
  const toggles = componentsToToggles(options.components || {});

  const overwriteOpts = normalizeOverwrite(options.overwrite || {});

  const plan = buildPlan({
    workspaceRoot: options.workspaceRoot,
    templateRoot,
    toggles,
    target: options.target,
    overwrite: overwriteOpts
  });

  return enrichPlanForUi(plan);
}

function writeResearchContext(workspaceRoot, researchContext) {
  if (!researchContext || !researchContext.trim()) {
    return null;
  }

  const filePath = path.join(workspaceRoot, RESEARCH_INSTRUCTIONS);
  const base = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const marker = "## Research Context";
  const customSection = `${marker}\n\n${researchContext.trim()}\n`;

  let content;
  if (base.includes(marker)) {
    content = base.replace(/## Research Context[\s\S]*?(?=\n## |\n*$)/, `${customSection}\n`);
  } else {
    content = `${base.trim()}\n\n${customSection}`;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  return RESEARCH_INSTRUCTIONS;
}

function ensureBibliographyExtras(workspaceRoot, toggles) {
  if (toggles.bibliography === false) {
    return [];
  }

  const written = [];
  const registerPath = path.join(workspaceRoot, "refs/reference-register.md");
  if (!fs.existsSync(registerPath)) {
    fs.mkdirSync(path.dirname(registerPath), { recursive: true });
    fs.writeFileSync(registerPath, DEFAULT_REFERENCE_REGISTER, "utf8");
    written.push("refs/reference-register.md");
  }

  const bibPath = path.join(workspaceRoot, "refs/bibliography.json");
  if (!fs.existsSync(bibPath)) {
    fs.mkdirSync(path.dirname(bibPath), { recursive: true });
    fs.writeFileSync(bibPath, "[]\n", "utf8");
    written.push("refs/bibliography.json");
  }

  return written;
}

async function copyPlannedFiles(plan) {
  const overwriteTemplate = plan.overwriteOpts?.templateFiles || plan.overwrite;
  const copied = [];
  for (const relativePath of plan.create) {
    const source = path.join(plan.templateRoot, relativePath);
    const dest = path.join(plan.workspaceRoot, relativePath);
    if (!fs.existsSync(source)) {
      continue;
    }
    copyFileOrDirectory(source, dest, overwriteTemplate);
    copied.push(relativePath);
  }
  return copied;
}

async function runGitInit(workspaceRoot) {
  if (fs.existsSync(path.join(workspaceRoot, ".git"))) {
    return { status: "skipped", reason: "already initialized" };
  }

  await execFileAsync("git", ["init"], { cwd: workspaceRoot });
  await execFileAsync("git", ["add", "-A"], { cwd: workspaceRoot });
  try {
    await execFileAsync("git", ["commit", "-m", "Initial academic paper scaffold"], { cwd: workspaceRoot });
    return { status: "committed" };
  } catch (error) {
    return { status: "initialized", reason: error.message };
  }
}

async function deployScaffold(options) {
  const {
    context,
    workspaceRoot,
    extensionPath,
    templateId = DEFAULT_TEMPLATE_ID,
    form = {},
    components = {},
    overwrite = {},
    getEndpoints,
    onProgress
  } = options;

  const globalStoragePath = context.globalStorageUri.fsPath;
  const templateRoot = getExtensionTemplateRoot(extensionPath, templateId);
  const toggles = componentsToToggles(components);
  const overwriteOpts = normalizeOverwrite(overwrite);
  const plan = enrichPlanForUi(
    buildPlan({
      workspaceRoot,
      templateRoot,
      toggles,
      target: form.target,
      overwrite: overwriteOpts
    })
  );

  const paperYamlExists = fs.existsSync(path.join(workspaceRoot, "paper.yaml"));
  if (paperYamlExists && !overwriteOpts.paperYaml) {
    return { ok: false, reason: "conflicts", plan };
  }

  const paperMdPath = path.join(workspaceRoot, "paper.md");
  const paperMdExists = fs.existsSync(paperMdPath);
  if (toggles.manuscript !== false && paperMdExists && !overwriteOpts.paperMd) {
    return { ok: false, reason: "conflicts", plan };
  }

  if (!plan.canDeploy) {
    return { ok: false, reason: "conflicts", plan };
  }

  const progress = [];
  const warnings = [];
  const notify = (item) => {
    progress.push(item);
    if (onProgress) {
      onProgress(item);
    }
  };

  const copied = await copyPlannedFiles(plan);
  notify({ step: "copy-template", status: "ok", path: `${copied.length} file(s)` });

  const bibWritten = ensureBibliographyExtras(workspaceRoot, toggles);
  notify({ step: "bibliography", status: "ok", path: bibWritten.join(", ") || "ready" });

  const targets = mergeTargetsForDeploy(extensionPath, globalStoragePath, templateId);
  const targetProfile = targets[form.target] || targets.lncs || Object.values(targets)[0];

  if (toggles.manuscript !== false && (!paperMdExists || overwriteOpts.paperMd)) {
    fs.writeFileSync(paperMdPath, buildManuscriptFrontmatter(form, targetProfile), "utf8");
    notify({ step: "manuscript", status: "ok", path: "paper.md" });
  }

  const researchPath =
    toggles.instructions !== false ? writeResearchContext(workspaceRoot, form.researchContext) : null;
  if (researchPath) {
    notify({ step: "research-context", status: "ok", path: researchPath });
  }

  const headers = copyAllProfileHeadersToWorkspace(
    workspaceRoot,
    globalStoragePath,
    extensionPath,
    templateId
  );
  if (headers.length) {
    notify({ step: "profile-headers", status: "ok", path: `${headers.length} header(s)` });
  }

  const endpoints = getEndpoints ? getEndpoints() : {};
  const mcp = {
    host: endpoints.host || "127.0.0.1",
    zoteroPort: endpoints.zoteroPort || 9180,
    scholarPort: endpoints.scholarPort || 3847
  };

  if (!paperYamlExists || overwriteOpts.paperYaml) {
    fs.writeFileSync(path.join(workspaceRoot, "paper.yaml"), buildPaperYaml(form, targets, mcp), "utf8");
    notify({ step: "paper-yaml", status: "ok", path: "paper.yaml" });
  }

  if (toggles.vscode !== false) {
    const mcpWritten = await writeScaffoldMcpConfig(workspaceRoot, mcp);
    notify({ step: "mcp-config", status: "ok", path: mcpWritten.join(", ") });
  }

  if (toggles.csl !== false) {
    const cslResults = await downloadCslStyles(workspaceRoot);
    const downloaded = cslResults.filter((item) => item.status === "downloaded").map((item) => item.name);
    const failed = cslResults.filter((item) => item.status === "failed");
    if (failed.length) {
      warnings.push(`CSL download failed for: ${failed.map((item) => item.name).join(", ")}`);
    }
    const missingLedger = cslResults.find((item) => item.name === "ledger" && item.status === "missing");
    if (missingLedger?.detail) {
      warnings.push(missingLedger.detail);
    }
    notify({
      step: "csl",
      status: failed.length ? "partial" : downloaded.length ? "ok" : "skipped",
      path: downloaded.length ? downloaded.join(", ") : "partial"
    });
  }

  if (toggles.gitInit) {
    const gitResult = await runGitInit(workspaceRoot);
    if (gitResult.reason) {
      warnings.push(`Git init: ${gitResult.reason}`);
    }
    notify({ step: "git-init", status: gitResult.status === "committed" ? "ok" : "partial", path: gitResult.status });
  }

  return { ok: true, plan, progress, warnings };
}

function createPaperScaffold(options) {
  const extensionPath = options.extensionPath;
  const globalStoragePath = options.globalStoragePath;
  const templateId = options.templateId || DEFAULT_TEMPLATE_ID;

  return {
    templateId,
    templateRoot: getExtensionTemplateRoot(extensionPath, templateId),

    getDefaultToggles(workspaceRoot) {
      return {
        ...getDefaultScaffoldToggles(extensionPath, workspaceRoot, templateId),
        ...(options.defaultToggles || {})
      };
    },

    buildPlan(deployOptions) {
      const overwrite = deployOptions.overwrite || {};
      return buildScaffoldPlan({
        extensionPath,
        templateId,
        workspaceRoot: deployOptions.workspaceRoot,
        components: deployOptions.toggles || deployOptions.components,
        target: deployOptions.form?.target,
        overwrite
      });
    },

    deploy(deployOptions) {
      const overwrite = deployOptions.overwrite || {};
      return deployScaffold({
        context: { globalStorageUri: { fsPath: globalStoragePath } },
        workspaceRoot: deployOptions.workspaceRoot,
        extensionPath,
        templateId,
        form: deployOptions.form,
        components: deployOptions.toggles || deployOptions.components,
        overwrite: {
          confirm: Boolean(overwrite.confirm),
          paperYaml: Boolean(overwrite.paperYaml),
          paperMd: Boolean(overwrite.paperMd),
          templateFiles: Boolean(overwrite.templateFiles)
        },
        getEndpoints: deployOptions.getEndpoints || (() => deployOptions.mcp || {}),
        onProgress: deployOptions.onProgress
      });
    }
  };
}

module.exports = {
  buildScaffoldPlan,
  createPaperScaffold,
  DEFAULT_REFERENCE_REGISTER,
  deployScaffold
};
