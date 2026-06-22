"use strict";

const fs = require("fs");
const path = require("path");

const HISTORY_DIR = path.join("refs", "citation-searches");
const MAX_BATCHES = 50;

function getHistoryDir(projectRootDir) {
  return path.join(projectRootDir, HISTORY_DIR);
}

function getBatchPath(projectRootDir, batchId) {
  const safeId = String(batchId || "").replace(/[^a-zA-Z0-9_.-]/g, "");
  if (!safeId) {
    return null;
  }
  return path.join(getHistoryDir(projectRootDir), `${safeId}.json`);
}

function ensureHistoryDir(projectRootDir) {
  fs.mkdirSync(getHistoryDir(projectRootDir), { recursive: true });
}

function readBatchFile(filePath) {
  try {
    const record = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!record?.id) {
      return null;
    }
    return record;
  } catch (_error) {
    return null;
  }
}

function readAllBatches(projectRootDir) {
  if (!projectRootDir) {
    return [];
  }

  const historyDir = getHistoryDir(projectRootDir);
  if (!fs.existsSync(historyDir)) {
    return [];
  }

  return fs.readdirSync(historyDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readBatchFile(path.join(historyDir, name)))
    .filter(Boolean);
}

function serializeSession(session) {
  if (!session?.project?.rootDir) {
    return null;
  }

  return {
    id: session.id,
    createdAt: session.createdAt || Date.now(),
    projectRootDir: session.project.rootDir,
    claim: session.claim,
    queryText: session.queryText,
    selectedText: session.selectedText,
    results: session.results,
    droppedResults: session.droppedResults || [],
    expandDropped: Boolean(session.expandDropped),
    agentRanked: Boolean(session.agentRanked),
    selection: session.selection,
    canImportToZotero: Boolean(session.canImportToZotero),
    providerStatuses: session.providerStatuses || []
  };
}

function hydrateSession(record, detectProject) {
  if (!record?.projectRootDir) {
    return null;
  }

  const project = detectProject(record.projectRootDir);
  if (!project?.found) {
    return null;
  }

  return {
    id: record.id,
    createdAt: record.createdAt,
    project,
    claim: record.claim,
    queryText: record.queryText,
    selectedText: record.selectedText,
    results: record.results || [],
    droppedResults: record.droppedResults || [],
    expandDropped: Boolean(record.expandDropped),
    agentRanked: Boolean(record.agentRanked),
    selection: record.selection,
    canImportToZotero: Boolean(record.canImportToZotero),
    providerStatuses: record.providerStatuses || []
  };
}

function listBatches(projectRootDir) {
  if (!projectRootDir) {
    return [];
  }

  return readAllBatches(projectRootDir)
    .filter((batch) => batch.projectRootDir === projectRootDir)
    .sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0));
}

function trimOldBatches(projectRootDir) {
  const batches = readAllBatches(projectRootDir)
    .sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0));

  while (batches.length > MAX_BATCHES) {
    const oldest = batches.shift();
    const batchPath = getBatchPath(projectRootDir, oldest.id);
    if (batchPath && fs.existsSync(batchPath)) {
      fs.unlinkSync(batchPath);
    }
  }
}

function addBatch(projectRootDir, session) {
  const record = serializeSession(session);
  if (!record || !projectRootDir) {
    return null;
  }

  ensureHistoryDir(projectRootDir);
  const batchPath = getBatchPath(projectRootDir, record.id);
  fs.writeFileSync(batchPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  trimOldBatches(projectRootDir);
  return record;
}

function removeBatch(projectRootDir, batchId) {
  if (!projectRootDir) {
    return false;
  }

  const batchPath = getBatchPath(projectRootDir, batchId);
  if (!batchPath || !fs.existsSync(batchPath)) {
    return false;
  }

  fs.unlinkSync(batchPath);
  return true;
}

function getBatch(projectRootDir, batchId) {
  if (!projectRootDir) {
    return null;
  }

  const batchPath = getBatchPath(projectRootDir, batchId);
  if (!batchPath || !fs.existsSync(batchPath)) {
    return null;
  }

  return readBatchFile(batchPath);
}

module.exports = {
  HISTORY_DIR,
  MAX_BATCHES,
  getHistoryDir,
  serializeSession,
  hydrateSession,
  listBatches,
  addBatch,
  removeBatch,
  getBatch
};
