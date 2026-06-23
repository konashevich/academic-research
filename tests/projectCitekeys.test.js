"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  collectCitekeysFromText,
  collectProjectCitekeys,
  collectRegisterCitekeys,
  isPlaceholderCitekey
} = require("../src/projectCitekeys");
const { buildLocalBibliographyContent } = require("../src/safeBibliographySync");

test("collects citekeys from manuscript text and ignores placeholders", () => {
  const keys = collectCitekeysFromText("A claim [@KNOWN2020; @ref1, p. 42] and [@OTHER].");

  assert.deepEqual(keys, ["KNOWN2020", "OTHER"]);
  assert.equal(isPlaceholderCitekey("ref1"), true);
});

test("collects project citekeys from manuscript file and additional keys", () => {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "academic-citekeys-"));
  const manuscriptPath = path.join(tempDir, "paper.md");
  fs.writeFileSync(manuscriptPath, "Claim [@ONFILE].\n", "utf8");

  const keys = collectProjectCitekeys(
    {
      exists: { manuscript: true },
      paths: { manuscript: manuscriptPath }
    },
    { additionalKeys: ["PENDING"] }
  );

  assert.deepEqual(keys, ["ONFILE", "PENDING"]);
});

test("prefers open editor manuscript over saved file on disk", () => {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "academic-citekeys-"));
  const manuscriptPath = path.join(tempDir, "paper.md");
  fs.writeFileSync(manuscriptPath, "Claim [@ONFILE] and [@REMOVED].\n", "utf8");

  const keys = collectProjectCitekeys(
    {
      exists: { manuscript: true },
      paths: { manuscript: manuscriptPath }
    },
    { manuscriptTexts: ["Claim [@ONFILE].\n"] }
  );

  assert.deepEqual(keys, ["ONFILE"]);
});

test("reads manuscript from disk when editor buffer is not provided", () => {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "academic-citekeys-"));
  const manuscriptPath = path.join(tempDir, "paper.md");
  fs.writeFileSync(manuscriptPath, "Claim [@DISKONLY].\n", "utf8");

  const keys = collectProjectCitekeys({
    exists: { manuscript: true },
    paths: { manuscript: manuscriptPath }
  });

  assert.deepEqual(keys, ["DISKONLY"]);
});

test("includes zotero keys from the reference register", () => {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "academic-citekeys-"));
  const manuscriptPath = path.join(tempDir, "paper.md");
  const registerPath = path.join(tempDir, "refs", "reference-register.md");
  fs.mkdirSync(path.dirname(registerPath), { recursive: true });
  fs.writeFileSync(manuscriptPath, "Claim [@INMANUSCRIPT].\n", "utf8");
  fs.writeFileSync(
    registerPath,
    [
      "| ID | Claim | Status | Query | Candidate source | Zotero key | Notes |",
      "|---|---|---|---|---|---|---|",
      "| ref1 | Imported source | imported | query | Title | REGISTERKEY | |"
    ].join("\n") + "\n",
    "utf8"
  );

  const keys = collectProjectCitekeys({
    exists: { manuscript: true },
    paths: { manuscript: manuscriptPath, referenceRegister: registerPath }
  });

  assert.deepEqual(keys, ["INMANUSCRIPT", "REGISTERKEY"]);
});

test("collectRegisterCitekeys ignores placeholders", () => {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "academic-citekeys-"));
  const registerPath = path.join(tempDir, "refs", "reference-register.md");
  fs.mkdirSync(path.dirname(registerPath), { recursive: true });
  fs.writeFileSync(
    registerPath,
    [
      "| ID | Claim | Status | Query | Candidate source | Zotero key | Notes |",
      "|---|---|---|---|---|---|---|",
      "| ref1 | Placeholder | searching | query | Title | ref2 | |",
      "| ref3 | Imported | imported | query | Title | REALKEY | |"
    ].join("\n") + "\n",
    "utf8"
  );

  assert.deepEqual(
    collectRegisterCitekeys({ paths: { referenceRegister: registerPath } }),
    ["REALKEY"]
  );
});

test("local bibliography sync keeps only project citekeys from existing entries", () => {
  const local = buildLocalBibliographyContent(
    ["KEEP", "MISSING"],
    [
      { id: "KEEP", type: "book", title: "Keep me" },
      { id: "EXTRA", type: "book", title: "Drop me" }
    ]
  );

  assert.deepEqual(local.items.map((item) => item.id), ["KEEP"]);
  assert.deepEqual(local.unresolved, ["MISSING"]);
});
