"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_TEMPLATE_ID = "iade-default";
const VENDOR_DIR = "vendor/iade-paper-template";

function getExtensionTemplateRoot(extensionPath, templateId = DEFAULT_TEMPLATE_ID) {
  const root = path.join(extensionPath, VENDOR_DIR);
  if (!fs.existsSync(root)) {
    throw new Error(`Bundled paper template not found at ${root}`);
  }

  const manifest = readManifest(extensionPath, templateId);
  if (manifest.id !== templateId) {
    throw new Error(`Unknown template id: ${templateId}`);
  }

  return root;
}

function readManifest(extensionPath, templateId = DEFAULT_TEMPLATE_ID) {
  const manifestPath = path.join(extensionPath, VENDOR_DIR, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Template manifest not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (templateId && manifest.id !== templateId) {
    throw new Error(`Template manifest id mismatch: expected ${templateId}, got ${manifest.id}`);
  }

  return manifest;
}

function listBundledProfiles(extensionPath, templateId = DEFAULT_TEMPLATE_ID) {
  const manifest = readManifest(extensionPath, templateId);
  return [...(manifest.profiles || [])];
}

function listComponents(extensionPath, templateId = DEFAULT_TEMPLATE_ID) {
  const manifest = readManifest(extensionPath, templateId);
  return [...(manifest.components || [])];
}

function getDefaultScaffoldToggles(extensionPath, workspaceRoot, templateId = DEFAULT_TEMPLATE_ID) {
  const components = listComponents(extensionPath, templateId);
  const hasGit = workspaceRoot ? fs.existsSync(path.join(workspaceRoot, ".git")) : false;
  const toggles = {};

  for (const component of components) {
    toggles[component] = true;
  }
  toggles.gitInit = !hasGit;

  return toggles;
}

module.exports = {
  DEFAULT_TEMPLATE_ID,
  VENDOR_DIR,
  getDefaultScaffoldToggles,
  getExtensionTemplateRoot,
  listBundledProfiles,
  listComponents,
  readManifest
};
