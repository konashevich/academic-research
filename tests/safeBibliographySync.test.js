"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const { buildProjectBibliographyContent, writeBibliographySafely } = require("../src/safeBibliographySync");

test("writes bibliography atomically and keeps a backup", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "academic-bib-sync-"));
  const bibliographyPath = path.join(tempDir, "bibliography.json");
  fs.writeFileSync(bibliographyPath, JSON.stringify([{ id: "OLD", title: "Old" }]), "utf8");

  const result = writeBibliographySafely(bibliographyPath, JSON.stringify([{ id: "NEW", title: "New" }]));

  assert.equal(result.previousCount, 1);
  assert.equal(result.nextCount, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(bibliographyPath, "utf8")).map((item) => item.id), ["NEW"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(`${bibliographyPath}.bak`, "utf8")).map((item) => item.id), ["OLD"]);
});

test("refuses to replace a non-empty bibliography with an empty export", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "academic-bib-sync-"));
  const bibliographyPath = path.join(tempDir, "bibliography.json");
  fs.writeFileSync(bibliographyPath, JSON.stringify([{ id: "OLD", title: "Old" }]), "utf8");

  assert.throws(
    () => writeBibliographySafely(bibliographyPath, "[]"),
    /Refusing to replace/
  );
});

test("merges fresh Zotero items with preserved existing entries on partial sync", () => {
  const merged = buildProjectBibliographyContent(
    ["A", "B", "C"],
    [
      { id: "A", type: "book", title: "Fresh A" },
      { id: "B", type: "book", title: "Fresh B" }
    ],
    [
      { id: "B", type: "book", title: "Old B" },
      { id: "C", type: "book", title: "Old C" }
    ]
  );

  assert.deepEqual(merged.items.map((item) => item.id), ["A", "B", "C"]);
  assert.equal(merged.items[0].title, "Fresh A");
  assert.equal(merged.items[1].title, "Fresh B");
  assert.equal(merged.items[2].title, "Old C");
  assert.deepEqual(merged.preservedFromExisting, ["C"]);
  assert.deepEqual(merged.unresolved, []);
  assert.equal(merged.refreshedCount, 2);
});

test("allows project-scoped shrink to cited keys only", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "academic-bib-sync-"));
  const bibliographyPath = path.join(tempDir, "bibliography.json");
  const existing = Array.from({ length: 25 }, (_, index) => ({ id: `OLD${index}`, title: `Old ${index}` }));
  fs.writeFileSync(bibliographyPath, JSON.stringify(existing), "utf8");

  const result = writeBibliographySafely(
    bibliographyPath,
    JSON.stringify([{ id: "USED1", title: "Used" }]),
    { projectScoped: true, requestedKeyCount: 1 }
  );

  assert.equal(result.previousCount, 25);
  assert.equal(result.nextCount, 1);
});

test("refuses project-scoped sync when Zotero resolves zero requested keys", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "academic-bib-sync-"));
  const bibliographyPath = path.join(tempDir, "bibliography.json");
  fs.writeFileSync(bibliographyPath, JSON.stringify([{ id: "OLD", title: "Old" }]), "utf8");

  assert.throws(
    () => writeBibliographySafely(bibliographyPath, "[]", { projectScoped: true, requestedKeyCount: 2 }),
    /project citekey/
  );
});
