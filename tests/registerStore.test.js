"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const { appendRegisterEntry, parseRegisterContent, upsertRegisterEntry } = require("../src/registerStore");

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

test("upserts reference register entries by claim and advances status", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "academic-register-"));
  const registerPath = path.join(tempDir, "refs", "reference-register.md");

  const firstId = upsertRegisterEntry(registerPath, {
    claim: "Important claim",
    query: "important claim",
    status: "needed"
  });
  const secondId = upsertRegisterEntry(registerPath, {
    claim: "Important claim",
    query: "important claim",
    candidateSource: "Source / 10.1234/example",
    zoteroKey: "ABC123",
    status: "inserted"
  });

  const entries = parseRegisterContent(fs.readFileSync(registerPath, "utf8"));

  assert.equal(firstId, "ref1");
  assert.equal(secondId, "ref1");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, "inserted");
  assert.equal(entries[0].zoteroKey, "ABC123");
});

test("upserts register entries without deleting surrounding notes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "academic-register-"));
  const registerPath = path.join(tempDir, "refs", "reference-register.md");
  fs.mkdirSync(path.dirname(registerPath), { recursive: true });
  fs.writeFileSync(registerPath, [
    "# Reference Register",
    "",
    "Keep this reviewer note.",
    "",
    "| ID | Claim | Status | Query | Candidate source | Zotero key | Notes |",
    "|---|---|---|---|---|---|---|",
    "| ref1 | Important claim | needed | important claim |  |  |  |",
    "",
    "## Manual Notes",
    "Do not remove this section.",
    ""
  ].join("\n"), "utf8");

  const id = upsertRegisterEntry(registerPath, {
    claim: "Important claim",
    query: "important claim",
    status: "inserted",
    zoteroKey: "ABC123"
  });
  const content = fs.readFileSync(registerPath, "utf8");

  assert.equal(id, "ref1");
  assert.match(content, /Keep this reviewer note/);
  assert.match(content, /## Manual Notes/);
  assert.match(content, /Do not remove this section/);
  assert.match(content, /\| ref1 \| Important claim \| inserted /);
});

test("appends a register table without deleting note-only content", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "academic-register-"));
  const registerPath = path.join(tempDir, "refs", "reference-register.md");
  fs.mkdirSync(path.dirname(registerPath), { recursive: true });
  fs.writeFileSync(registerPath, [
    "# Reference Register",
    "",
    "Notes before the table.",
    ""
  ].join("\n"), "utf8");

  const id = upsertRegisterEntry(registerPath, {
    claim: "New claim",
    query: "new claim",
    status: "needed"
  });
  const content = fs.readFileSync(registerPath, "utf8");

  assert.equal(id, "ref1");
  assert.match(content, /Notes before the table/);
  assert.match(content, /\| ID \| Claim \| Status \| Query \| Candidate source \| Zotero key \| Notes \|/);
  assert.match(content, /\| ref1 \| New claim \| needed /);
});

test("normalizes a non-canonical register table separator while preserving notes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "academic-register-"));
  const registerPath = path.join(tempDir, "refs", "reference-register.md");
  fs.mkdirSync(path.dirname(registerPath), { recursive: true });
  fs.writeFileSync(registerPath, [
    "# Reference Register",
    "",
    "Before.",
    "| ID | Claim | Status | Query | Candidate source | Zotero key | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    "| ref1 | Existing claim | needed | existing claim |  |  |  |",
    "After.",
    ""
  ].join("\n"), "utf8");

  upsertRegisterEntry(registerPath, {
    claim: "Existing claim",
    query: "existing claim",
    status: "inserted",
    zoteroKey: "KEY1"
  });
  const content = fs.readFileSync(registerPath, "utf8");

  assert.match(content, /Before/);
  assert.match(content, /After/);
  assert.match(content, /\|---\|---\|---\|---\|---\|---\|---\|/);
  assert.match(content, /\| ref1 \| Existing claim \| inserted /);
});
