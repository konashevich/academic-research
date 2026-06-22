"use strict";

const fs = require("fs");
const path = require("path");
const { loadBibliographyFromContent } = require("./bibliographyIndex");

function readExistingBibliography(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      content: "",
      items: []
    };
  }

  const content = fs.readFileSync(filePath, "utf8");
  return {
    content,
    items: loadBibliographyFromContent(content)
  };
}

function validateBibliographySync(existingItems, nextItems, options = {}) {
  const allowDangerousReplace = Boolean(options.allowDangerousReplace);
  const projectScoped = Boolean(options.projectScoped);
  const requestedKeyCount = Number(options.requestedKeyCount || 0);

  if (!allowDangerousReplace && !projectScoped && existingItems.length > 0 && nextItems.length === 0) {
    throw new Error("Refusing to replace a non-empty bibliography with an empty Zotero export.");
  }

  if (projectScoped && requestedKeyCount > 0 && nextItems.length === 0) {
    throw new Error(`Zotero returned no bibliography entries for ${requestedKeyCount} project citekey(s).`);
  }

  const minimumRatio = options.minimumRatio || 0.25;
  if (
    !allowDangerousReplace &&
    !projectScoped &&
    existingItems.length >= 20 &&
    nextItems.length < Math.floor(existingItems.length * minimumRatio)
  ) {
    throw new Error(`Refusing suspicious bibliography shrink from ${existingItems.length} to ${nextItems.length} items.`);
  }
}

function atomicWriteFile(filePath, content) {
  const directory = path.dirname(filePath);
  const basename = path.basename(filePath);
  const tempPath = path.join(directory, `.${basename}.${process.pid}.${Date.now()}.tmp`);

  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

function buildProjectBibliographyContent(requestedKeys, freshItems, existingItems) {
  const freshById = new Map();
  const existingById = new Map();

  for (const item of freshItems || []) {
    if (item && item.id) {
      freshById.set(item.id, item);
    }
  }
  for (const item of existingItems || []) {
    if (item && item.id) {
      existingById.set(item.id, item);
    }
  }

  const merged = [];
  const preservedFromExisting = [];
  const unresolved = [];

  for (const key of requestedKeys || []) {
    if (freshById.has(key)) {
      merged.push(freshById.get(key));
      continue;
    }
    if (existingById.has(key)) {
      merged.push(existingById.get(key));
      preservedFromExisting.push(key);
      continue;
    }
    unresolved.push(key);
  }

  return {
    items: merged,
    content: `${JSON.stringify(merged, null, 2)}\n`,
    preservedFromExisting,
    unresolved,
    refreshedCount: merged.length - preservedFromExisting.length
  };
}

function writeBibliographySafely(filePath, nextContent, options = {}) {
  const existing = readExistingBibliography(filePath);
  const nextItems = loadBibliographyFromContent(nextContent);

  validateBibliographySync(existing.items, nextItems, options);

  if (existing.content.trim()) {
    const backupPath = `${filePath}.bak`;
    atomicWriteFile(backupPath, existing.content);
  }

  atomicWriteFile(filePath, nextContent.endsWith("\n") ? nextContent : `${nextContent}\n`);

  return {
    previousCount: existing.items.length,
    nextCount: nextItems.length
  };
}

module.exports = {
  atomicWriteFile,
  buildProjectBibliographyContent,
  readExistingBibliography,
  validateBibliographySync,
  writeBibliographySafely
};
