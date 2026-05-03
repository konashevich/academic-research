"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const { appendRegisterEntry } = require("../src/registerStore");

test("creates and appends reference register entries", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "academic-register-"));
  const registerPath = path.join(tempDir, "refs", "reference-register.md");

  const id = appendRegisterEntry(registerPath, {
    claim: "Important claim | with pipe",
    query: "important claim",
    status: "needed"
  });

  const content = fs.readFileSync(registerPath, "utf8");

  assert.equal(id, "ref1");
  assert.match(content, /# Reference Register/);
  assert.match(content, /Important claim \\| with pipe/);
});
