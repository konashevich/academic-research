"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  cloneBundledProfile,
  copyAllProfileHeadersToWorkspace,
  deleteUserProfile,
  exportProfileToWorkspace,
  importProfileFromWorkspace,
  listAllProfiles,
  mergeTargetsForDeploy,
  readProfileYaml
} = require("../src/profiles/profileRegistry");

const extensionPath = path.resolve(__dirname, "..");

test("listAllProfiles includes bundled targets from vendor template", () => {
  const globalStorage = fs.mkdtempSync(path.join(os.tmpdir(), "profiles-global-"));
  try {
    const { bundled, all } = listAllProfiles(extensionPath, globalStorage, "iade-default");
    assert.ok(bundled.length >= 4);
    assert.ok(all.some((profile) => profile.id === "lncs" && profile.bundled));
  } finally {
    fs.rmSync(globalStorage, { recursive: true, force: true });
  }
});

test("clone bundled profile writes global storage folder", () => {
  const globalStorage = fs.mkdtempSync(path.join(os.tmpdir(), "profiles-clone-"));
  try {
    const { id, profileDir } = cloneBundledProfile(extensionPath, globalStorage, "lncs", "my-lncs", {
      templateId: "iade-default",
      label: "My LNCS"
    });

    assert.equal(id, "my-lncs");
    assert.ok(fs.existsSync(path.join(profileDir, "profile.yaml")));
    assert.ok(fs.existsSync(path.join(profileDir, "header.tex")));
    assert.ok(fs.existsSync(path.join(profileDir, "profile.meta.json")));

    const profile = readProfileYaml(profileDir);
    assert.ok(profile.description);
    assert.match(profile.template, /templates\/my-lncs\/header.tex/);

    deleteUserProfile(globalStorage, "my-lncs");
    assert.equal(fs.existsSync(profileDir), false);
  } finally {
    fs.rmSync(globalStorage, { recursive: true, force: true });
  }
});

test("mergeTargetsForDeploy includes cloned global profile", () => {
  const globalStorage = fs.mkdtempSync(path.join(os.tmpdir(), "profiles-merge-"));
  const workspaceRoot = path.join(globalStorage, "workspace");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  try {
    cloneBundledProfile(extensionPath, globalStorage, "report", "custom-report", {
      templateId: "iade-default"
    });

    const targets = mergeTargetsForDeploy(extensionPath, globalStorage, "iade-default");
    assert.ok(targets.lncs);
    assert.ok(targets["custom-report"]);

    const exportPath = exportProfileToWorkspace(workspaceRoot, "custom-report", globalStorage, extensionPath, "iade-default");
    assert.ok(fs.existsSync(path.join(exportPath, "profile.yaml")));
  } finally {
    fs.rmSync(globalStorage, { recursive: true, force: true });
  }
});

test("importProfileFromWorkspace installs exported profile into global storage", () => {
  const globalStorage = fs.mkdtempSync(path.join(os.tmpdir(), "profiles-import-"));
  const workspaceRoot = path.join(globalStorage, "workspace");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  try {
    cloneBundledProfile(extensionPath, globalStorage, "lncs", "edited-lncs", {
      templateId: "iade-default",
      label: "Edited LNCS"
    });

    exportProfileToWorkspace(workspaceRoot, "edited-lncs", globalStorage, extensionPath, "iade-default");
    deleteUserProfile(globalStorage, "edited-lncs");

    const result = importProfileFromWorkspace(workspaceRoot, "edited-lncs", globalStorage);
    assert.equal(result.id, "edited-lncs");
    assert.ok(fs.existsSync(path.join(result.profileDir, "profile.yaml")));
    assert.ok(fs.existsSync(path.join(result.profileDir, "header.tex")));
  } finally {
    fs.rmSync(globalStorage, { recursive: true, force: true });
  }
});

test("copyAllProfileHeadersToWorkspace copies every known target header", () => {
  const globalStorage = fs.mkdtempSync(path.join(os.tmpdir(), "profiles-headers-"));
  const workspaceRoot = path.join(globalStorage, "workspace");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  try {
    const copied = copyAllProfileHeadersToWorkspace(
      workspaceRoot,
      globalStorage,
      extensionPath,
      "iade-default"
    );
    const targets = mergeTargetsForDeploy(extensionPath, globalStorage, "iade-default");
    assert.equal(copied.length, Object.keys(targets).length);
  } finally {
    fs.rmSync(globalStorage, { recursive: true, force: true });
  }
});
