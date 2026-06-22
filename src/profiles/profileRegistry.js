"use strict";

const fs = require("fs");
const path = require("path");
const { readAcademicPaperYaml } = require("../paperYaml");
const { getExtensionTemplateRoot, listBundledProfiles } = require("../scaffold/templateCatalog");

const PROFILE_META = "profile.meta.json";
const PROFILE_YAML = "profile.yaml";
const HEADER_TEX = "header.tex";

function getProfilesRoot(globalStoragePath) {
  return path.join(globalStoragePath, "profiles");
}

function ensureProfilesRoot(globalStoragePath) {
  const root = getProfilesRoot(globalStoragePath);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readProfileYaml(profileDir) {
  const yamlPath = path.join(profileDir, PROFILE_YAML);
  if (!fs.existsSync(yamlPath)) {
    return null;
  }

  const content = fs.readFileSync(yamlPath, "utf8");
  const profile = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value === "[]") {
      profile[match[1]] = [];
      continue;
    }
    profile[match[1]] = value;
  }
  return profile;
}

function writeProfileYaml(profileDir, profile) {
  const lines = [
    `description: "${String(profile.description || "").replace(/"/g, '\\"')}"`,
    `csl: "${String(profile.csl || "").replace(/"/g, '\\"')}"`,
    `documentclass: ${profile.documentclass || "article"}`,
    `classoption: "${String(profile.classoption || "").replace(/"/g, '\\"')}"`,
    `template: "${String(profile.template || "").replace(/"/g, '\\"')}"`,
    `geometry: "${String(profile.geometry || "").replace(/"/g, '\\"')}"`,
    `fontsize: "${String(profile.fontsize || "10pt").replace(/"/g, '\\"')}"`,
    "extra_pandoc_args: []"
  ];
  fs.writeFileSync(path.join(profileDir, PROFILE_YAML), `${lines.join("\n")}\n`, "utf8");
}

function extractBundledTarget(extensionPath, targetId, templateId) {
  const templateRoot = getExtensionTemplateRoot(extensionPath, templateId);
  const { config } = readAcademicPaperYaml(templateRoot);
  const prefix = `targets.${targetId}.`;
  const profile = { id: targetId };

  for (const [key, value] of Object.entries(config.rawScalars)) {
    if (key.startsWith(prefix)) {
      profile[key.slice(prefix.length)] = value;
    }
  }

  profile.template = profile.template || `templates/${targetId}/header.tex`;
  return profile;
}

function listBundledTargetProfiles(extensionPath, templateId) {
  return listBundledProfiles(extensionPath, templateId).map((id) => {
    const profile = extractBundledTarget(extensionPath, id, templateId);
    return {
      id,
      label: profile.description || id,
      bundled: true,
      profile
    };
  });
}

function listUserProfiles(globalStoragePath) {
  const root = getProfilesRoot(globalStoragePath);
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const profileDir = path.join(root, entry.name);
      const meta = readJson(path.join(profileDir, PROFILE_META), {});
      const profile = readProfileYaml(profileDir) || {};
      return {
        id: entry.name,
        label: meta.label || profile.description || entry.name,
        bundled: false,
        profile: { id: entry.name, ...profile },
        meta
      };
    });
}

function listAllProfiles(extensionPath, globalStoragePath, templateId) {
  const bundled = listBundledTargetProfiles(extensionPath, templateId);
  const user = listUserProfiles(globalStoragePath);
  return { bundled, user, all: [...bundled, ...user] };
}

function cloneBundledProfile(extensionPath, globalStoragePath, fromId, newId, options = {}) {
  const templateId = options.templateId;
  const bundled = extractBundledTarget(extensionPath, fromId, templateId);
  const profilesRoot = ensureProfilesRoot(globalStoragePath);
  const profileDir = path.join(profilesRoot, newId);

  if (fs.existsSync(profileDir)) {
    throw new Error(`Profile '${newId}' already exists.`);
  }

  fs.mkdirSync(profileDir, { recursive: true });
  writeProfileYaml(profileDir, {
    ...bundled,
    description: options.label || bundled.description || newId,
    template: `templates/${newId}/header.tex`
  });

  const templateRoot = getExtensionTemplateRoot(extensionPath, templateId);
  const sourceHeader = path.join(templateRoot, "templates", fromId, HEADER_TEX);
  if (fs.existsSync(sourceHeader)) {
    fs.copyFileSync(sourceHeader, path.join(profileDir, HEADER_TEX));
  }

  fs.writeFileSync(
    path.join(profileDir, PROFILE_META),
    `${JSON.stringify(
      {
        clonedFrom: fromId,
        createdAt: new Date().toISOString(),
        label: options.label || newId
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return { id: newId, profileDir };
}

function deleteUserProfile(globalStoragePath, profileId) {
  const profileDir = path.join(getProfilesRoot(globalStoragePath), profileId);
  if (!fs.existsSync(profileDir)) {
    throw new Error(`Profile '${profileId}' not found.`);
  }
  fs.rmSync(profileDir, { recursive: true, force: true });
}

function mergeTargetsForDeploy(extensionPath, globalStoragePath, templateId) {
  const targets = {};
  for (const entry of listBundledTargetProfiles(extensionPath, templateId)) {
    targets[entry.id] = { ...entry.profile };
  }

  for (const entry of listUserProfiles(globalStoragePath)) {
    targets[entry.id] = { ...entry.profile };
  }

  return targets;
}

function copyProfileHeaderToWorkspace(workspaceRoot, profileId, globalStoragePath, extensionPath, templateId) {
  const userHeader = path.join(getProfilesRoot(globalStoragePath), profileId, HEADER_TEX);
  const templateRoot = getExtensionTemplateRoot(extensionPath, templateId);
  const bundledHeader = path.join(templateRoot, "templates", profileId, HEADER_TEX);
  const source = fs.existsSync(userHeader) ? userHeader : bundledHeader;

  if (!fs.existsSync(source)) {
    return null;
  }

  const destDir = path.join(workspaceRoot, "templates", profileId);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, HEADER_TEX);
  fs.copyFileSync(source, dest);
  return path.relative(workspaceRoot, dest);
}

function copyAllProfileHeadersToWorkspace(workspaceRoot, globalStoragePath, extensionPath, templateId) {
  const targets = mergeTargetsForDeploy(extensionPath, globalStoragePath, templateId);
  const copied = [];
  for (const profileId of Object.keys(targets)) {
    const relativePath = copyProfileHeaderToWorkspace(
      workspaceRoot,
      profileId,
      globalStoragePath,
      extensionPath,
      templateId
    );
    if (relativePath) {
      copied.push(relativePath);
    }
  }
  return copied;
}

function listImportedProfiles(workspaceRoot) {
  const importRoot = path.join(workspaceRoot, ".academic", "imported-profiles");
  if (!fs.existsSync(importRoot)) {
    return [];
  }
  return fs
    .readdirSync(importRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function exportProfileToWorkspace(workspaceRoot, profileId, globalStoragePath, extensionPath, templateId) {
  const exportRoot = path.join(workspaceRoot, ".academic", "imported-profiles", profileId);
  fs.mkdirSync(exportRoot, { recursive: true });

  const userDir = path.join(getProfilesRoot(globalStoragePath), profileId);
  if (fs.existsSync(userDir)) {
    for (const file of [PROFILE_YAML, HEADER_TEX, PROFILE_META]) {
      const source = path.join(userDir, file);
      if (fs.existsSync(source)) {
        fs.copyFileSync(source, path.join(exportRoot, file));
      }
    }
    return exportRoot;
  }

  const bundled = extractBundledTarget(extensionPath, profileId, templateId);
  writeProfileYaml(exportRoot, bundled);
  const templateRoot = getExtensionTemplateRoot(extensionPath, templateId);
  const header = path.join(templateRoot, "templates", profileId, HEADER_TEX);
  if (fs.existsSync(header)) {
    fs.copyFileSync(header, path.join(exportRoot, HEADER_TEX));
  }
  fs.writeFileSync(
    path.join(exportRoot, PROFILE_META),
    `${JSON.stringify({ exportedFrom: profileId, bundled: true, createdAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
  return exportRoot;
}

function importProfileFromWorkspace(workspaceRoot, profileId, globalStoragePath) {
  const importDir = path.join(workspaceRoot, ".academic", "imported-profiles", profileId);
  if (!fs.existsSync(importDir)) {
    throw new Error(`Imported profile '${profileId}' not found in workspace.`);
  }

  const profilesRoot = ensureProfilesRoot(globalStoragePath);
  const destDir = path.join(profilesRoot, profileId);
  fs.mkdirSync(destDir, { recursive: true });

  for (const file of [PROFILE_YAML, HEADER_TEX, PROFILE_META]) {
    const source = path.join(importDir, file);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join(destDir, file));
    }
  }

  return { id: profileId, profileDir: destDir };
}

function initializeBundledProfilesClone(globalStoragePath, extensionPath, templateId) {
  const marker = path.join(getProfilesRoot(globalStoragePath), ".initialized");
  if (fs.existsSync(marker)) {
    return false;
  }

  ensureProfilesRoot(globalStoragePath);
  fs.writeFileSync(marker, new Date().toISOString(), "utf8");
  return true;
}

module.exports = {
  PROFILE_META,
  PROFILE_YAML,
  cloneBundledProfile,
  copyAllProfileHeadersToWorkspace,
  copyProfileHeaderToWorkspace,
  deleteUserProfile,
  exportProfileToWorkspace,
  extractBundledTarget,
  getProfilesRoot,
  importProfileFromWorkspace,
  initializeBundledProfilesClone,
  listAllProfiles,
  listBundledTargetProfiles,
  listImportedProfiles,
  listUserProfiles,
  mergeTargetsForDeploy,
  readProfileYaml,
  writeProfileYaml
};
