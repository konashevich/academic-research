"use strict";

const fs = require("fs");
const path = require("path");

const HISTORY_DIR = path.join("refs", "citation-searches");
const DEFAULT_MAX_BATCHES = 50;

function getHistoryDir(projectRootDir) {
  return path.join(projectRootDir, HISTORY_DIR);
}

function hasHistoryDir(projectRootDir) {
  return Boolean(projectRootDir) && fs.existsSync(getHistoryDir(projectRootDir));
}

function normalizeRoot(projectRootDir) {
  return path.resolve(projectRootDir || "");
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

function readAllBatchEntries(projectRootDir) {
  if (!projectRootDir) {
    return [];
  }

  const historyDir = getHistoryDir(projectRootDir);
  if (!fs.existsSync(historyDir)) {
    return [];
  }

  return fs.readdirSync(historyDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const filePath = path.join(historyDir, name);
      const record = readBatchFile(filePath);
      return record ? { record, filePath } : null;
    })
    .filter(Boolean);
}

function findBatchEntry(projectRootDir, batchId) {
  if (!projectRootDir || !batchId) {
    return null;
  }

  const expectedPath = getBatchPath(projectRootDir, batchId);
  if (expectedPath && fs.existsSync(expectedPath)) {
    const record = readBatchFile(expectedPath);
    if (record?.id === batchId) {
      return { record, filePath: expectedPath };
    }
  }

  return readAllBatchEntries(projectRootDir).find((entry) => entry.record.id === batchId) || null;
}

function serializeSession(session) {
  if (!session?.project?.rootDir) {
    return null;
  }

  return {
    id: session.id,
    createdAt: session.createdAt ?? Date.now(),
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

  const detected = detectProject(record.projectRootDir);
  const projectReady = Boolean(detected?.found);

  return {
    id: record.id,
    createdAt: record.createdAt,
    project: projectReady
      ? detected
      : {
        found: false,
        rootDir: record.projectRootDir,
        reason: detected?.reason || "paper.yaml not found"
      },
    projectReady,
    claim: record.claim,
    queryText: record.queryText,
    selectedText: record.selectedText,
    results: record.results || [],
    droppedResults: record.droppedResults || [],
    expandDropped: Boolean(record.expandDropped),
    agentRanked: Boolean(record.agentRanked),
    selection: record.selection,
    canImportToZotero: false,
    providerStatuses: record.providerStatuses || []
  };
}

function listBatches(projectRootDir) {
  if (!projectRootDir) {
    return [];
  }

  const normalizedRoot = normalizeRoot(projectRootDir);
  return readAllBatchEntries(projectRootDir)
    .map((entry) => entry.record)
    .filter((batch) => normalizeRoot(batch.projectRootDir) === normalizedRoot)
    .sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0));
}

function resolveMaxBatches(options = {}) {
  const value = Number(options.maxBatches);
  if (!Number.isFinite(value) || value < 1) {
    return DEFAULT_MAX_BATCHES;
  }
  return Math.floor(value);
}

function trimOldBatches(projectRootDir, maxBatches = DEFAULT_MAX_BATCHES) {
  const limit = resolveMaxBatches({ maxBatches });
  const entries = readAllBatchEntries(projectRootDir)
    .sort((left, right) => (left.record.createdAt || 0) - (right.record.createdAt || 0));

  while (entries.length > limit) {
    const oldest = entries.shift();
    if (oldest?.filePath && fs.existsSync(oldest.filePath)) {
      fs.unlinkSync(oldest.filePath);
    }
  }
}

function addBatch(projectRootDir, session, options = {}) {
  const record = serializeSession(session);
  if (!record || !projectRootDir) {
    return null;
  }

  ensureHistoryDir(projectRootDir);
  const batchPath = getBatchPath(projectRootDir, record.id);
  fs.writeFileSync(batchPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  trimOldBatches(projectRootDir, options.maxBatches);
  return record;
}

function removeBatch(projectRootDir, batchId) {
  if (!projectRootDir) {
    return false;
  }

  const entry = findBatchEntry(projectRootDir, batchId);
  if (!entry?.filePath || !fs.existsSync(entry.filePath)) {
    return false;
  }

  fs.unlinkSync(entry.filePath);
  return true;
}

function getBatch(projectRootDir, batchId) {
  if (!projectRootDir) {
    return null;
  }

  return findBatchEntry(projectRootDir, batchId)?.record || null;
}

module.exports = {
  HISTORY_DIR,
  DEFAULT_MAX_BATCHES,
  getHistoryDir,
  hasHistoryDir,
  serializeSession,
  hydrateSession,
  listBatches,
  addBatch,
  removeBatch,
  getBatch,
  findBatchEntry
};
