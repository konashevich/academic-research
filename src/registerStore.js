"use strict";

const fs = require("fs");
const path = require("path");

const HEADER = [
  "# Reference Register",
  "",
  "| ID | Claim | Status | Query | Candidate source | Zotero key | Notes |",
  "|---|---|---|---|---|---|---|"
].join("\n");

function escapeCell(value) {
  return String(value || "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function ensureRegisterFile(registerPath) {
  fs.mkdirSync(path.dirname(registerPath), { recursive: true });

  if (!fs.existsSync(registerPath) || !fs.readFileSync(registerPath, "utf8").trim()) {
    fs.writeFileSync(registerPath, `${HEADER}\n`, "utf8");
  }
}

function nextReferenceId(content) {
  const matches = [...content.matchAll(/\|\s*(ref\d+)\s*\|/gi)].map((match) => Number(match[1].replace(/\D/g, "")));
  const max = matches.length ? Math.max(...matches) : 0;
  return `ref${max + 1}`;
}

function appendRegisterEntry(registerPath, entry) {
  ensureRegisterFile(registerPath);
  const content = fs.readFileSync(registerPath, "utf8");
  const id = entry.id || nextReferenceId(content);
  const row = [
    id,
    entry.claim,
    entry.status || "needed",
    entry.query,
    entry.candidateSource,
    entry.zoteroKey,
    entry.notes
  ]
    .map(escapeCell)
    .join(" | ");

  fs.appendFileSync(registerPath, `| ${row} |\n`, "utf8");
  return id;
}

module.exports = {
  HEADER,
  appendRegisterEntry,
  ensureRegisterFile,
  escapeCell,
  nextReferenceId
};
