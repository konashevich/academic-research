"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  collectCitekeysFromText,
  collectProjectCitekeys,
  isPlaceholderCitekey
} = require("../src/projectCitekeys");

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
