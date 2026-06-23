"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const {
  addBatch,
  getBatch,
  getHistoryDir,
  hydrateSession,
  listBatches,
  removeBatch,
  serializeSession
} = require("../src/citationSearchHistoryStore");
const { renderCitationSearchHistoryHtml } = require("../src/citationSearchHistoryHtml");

function createTempProjectRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "citation-history-"));
}

const sampleProject = {
  found: true,
  rootDir: "",
  paths: {
    referenceRegister: ""
  }
};

function makeSampleSession(rootDir, overrides = {}) {
  return {
    id: "citation-1",
    createdAt: 1000,
    project: {
      found: true,
      rootDir,
      paths: {
        referenceRegister: path.join(rootDir, "refs", "reference-register.md")
      }
    },
    claim: "Learning outcomes improved",
    queryText: "learning outcomes",
    selectedText: "Learning outcomes improved",
    results: [{ title: "Paper A" }],
    droppedResults: [{ title: "Paper B" }],
    expandDropped: false,
    agentRanked: true,
    selection: {
      documentUri: `file://${path.join(rootDir, "paper.md")}`,
      start: 10,
      end: 40,
      text: "Learning outcomes improved"
    },
    canImportToZotero: true,
    providerStatuses: [{ label: "OpenAlex", ok: true, detail: "ready" }],
    ...overrides
  };
}

test("serializeSession stores project root and search payload", () => {
  const rootDir = "/tmp/paper";
  const record = serializeSession(makeSampleSession(rootDir));
  assert.equal(record.projectRootDir, rootDir);
  assert.equal(record.claim, "Learning outcomes improved");
  assert.equal(record.results.length, 1);
  assert.equal(record.droppedResults.length, 1);
});

test("addBatch writes JSON files under refs/citation-searches", () => {
  const rootDir = createTempProjectRoot();
  const session = makeSampleSession(rootDir);
  addBatch(rootDir, session);

  const historyDir = getHistoryDir(rootDir);
  assert.ok(fs.existsSync(historyDir));
  assert.ok(fs.existsSync(path.join(historyDir, "citation-1.json")));
});

test("addBatch persists and lists newest first", () => {
  const rootDir = createTempProjectRoot();
  addBatch(rootDir, makeSampleSession(rootDir));
  addBatch(rootDir, makeSampleSession(rootDir, {
    id: "citation-2",
    createdAt: 2000,
    claim: "Newer claim"
  }));

  const batches = listBatches(rootDir);
  assert.equal(batches.length, 2);
  assert.equal(batches[0].id, "citation-2");
  assert.equal(batches[1].id, "citation-1");
});

test("hydrateSession rebuilds project-aware session", () => {
  const rootDir = "/tmp/paper";
  const record = serializeSession(makeSampleSession(rootDir));
  const session = hydrateSession(record, (projectRootDir) => {
    assert.equal(projectRootDir, rootDir);
    return {
      found: true,
      rootDir,
      paths: { referenceRegister: path.join(rootDir, "refs", "reference-register.md") }
    };
  });

  assert.equal(session.id, "citation-1");
  assert.equal(session.project.rootDir, rootDir);
  assert.equal(session.projectReady, true);
  assert.equal(session.results.length, 1);
});

test("hydrateSession returns view-only session when paper project is unavailable", () => {
  const rootDir = "/tmp/paper";
  const record = serializeSession(makeSampleSession(rootDir));
  const session = hydrateSession(record, () => ({
    found: false,
    rootDir,
    reason: "paper.yaml not found"
  }));

  assert.equal(session.projectReady, false);
  assert.equal(session.project.reason, "paper.yaml not found");
  assert.equal(session.results.length, 1);
});

test("getBatch and removeBatch resolve batches by JSON id even when file is renamed", () => {
  const rootDir = createTempProjectRoot();
  addBatch(rootDir, makeSampleSession(rootDir));
  const renamedPath = path.join(getHistoryDir(rootDir), "renamed-batch.json");
  fs.renameSync(path.join(getHistoryDir(rootDir), "citation-1.json"), renamedPath);

  assert.equal(getBatch(rootDir, "citation-1")?.claim, "Learning outcomes improved");
  assert.equal(removeBatch(rootDir, "citation-1"), true);
  assert.equal(getBatch(rootDir, "citation-1"), null);
});

test("addBatch trims to configured max batches", () => {
  const rootDir = createTempProjectRoot();
  for (let index = 0; index < 4; index += 1) {
    addBatch(rootDir, makeSampleSession(rootDir, {
      id: `citation-${index}`,
      createdAt: index * 1000
    }), { maxBatches: 3 });
  }

  const batches = listBatches(rootDir);
  assert.equal(batches.length, 3);
  assert.equal(batches[0].id, "citation-3");
  assert.equal(batches[2].id, "citation-1");
});

test("removeBatch deletes a saved search file", () => {
  const rootDir = createTempProjectRoot();
  const session = makeSampleSession(rootDir);
  addBatch(rootDir, session);
  assert.ok(getBatch(rootDir, "citation-1"));
  assert.equal(removeBatch(rootDir, "citation-1"), true);
  assert.equal(getBatch(rootDir, "citation-1"), null);
});

test("history view renders open and delete controls", () => {
  const html = renderCitationSearchHistoryHtml({
    nonce: "abc123",
    batches: [
      {
        id: "citation-1",
        claim: "Learning outcomes improved",
        createdAt: Date.parse("2026-06-23T10:00:00Z"),
        resultCount: 2,
        droppedCount: 1
      }
    ]
  });

  assert.match(html, /Learning outcomes improved/);
  assert.match(html, /data-action="open"/);
  assert.match(html, /data-action="delete"/);
  assert.match(html, /2 shown, 1 hidden/);
});
