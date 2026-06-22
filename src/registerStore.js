"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { canonicalDoi, normalizeText } = require("./citationResults");

const HEADER = [
  "# Reference Register",
  "",
  "| ID | Claim | Status | Query | Candidate source | Zotero key | Notes |",
  "|---|---|---|---|---|---|---|"
].join("\n");
const TABLE_HEADER = "| ID | Claim | Status | Query | Candidate source | Zotero key | Notes |";
const TABLE_SEPARATOR = "|---|---|---|---|---|---|---|";

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

function splitMarkdownRow(line) {
  const trimmed = line.trim();
  const inner = trimmed.startsWith("|") ? trimmed.slice(1, trimmed.endsWith("|") ? -1 : undefined) : trimmed;
  const cells = [];
  let current = "";
  let escaped = false;

  for (const char of inner) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function isRegisterSeparator(line) {
  const cells = splitMarkdownRow(line);
  return cells.length >= 7 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function findRegisterTableRange(lines) {
  const headerIndex = lines.findIndex((line) => line.trim() === TABLE_HEADER);
  if (headerIndex === -1) {
    return null;
  }

  const separatorIndex = headerIndex + 1;
  if (!lines[separatorIndex] || !isRegisterSeparator(lines[separatorIndex])) {
    return null;
  }

  let endIndex = separatorIndex + 1;
  while (endIndex < lines.length && /^\s*\|/.test(lines[endIndex])) {
    endIndex += 1;
  }

  return {
    start: headerIndex,
    separator: separatorIndex,
    end: endIndex
  };
}

function parseRegisterContent(content) {
  const lines = String(content || "").split(/\r?\n/);
  const range = findRegisterTableRange(lines);
  const rowLines = range
    ? lines.slice(range.separator + 1, range.end)
    : lines.filter((line) => /^\s*\|/.test(line) && !/\|\s*---/.test(line) && !/\|\s*ID\s*\|/i.test(line));

  return rowLines
    .map((line) => {
      const cells = splitMarkdownRow(line);
      return {
        id: cells[0] || "",
        claim: cells[1] || "",
        status: cells[2] || "",
        query: cells[3] || "",
        candidateSource: cells[4] || "",
        zoteroKey: cells[5] || "",
        notes: cells[6] || ""
      };
    })
    .filter((entry) => entry.id);
}

function nextReferenceId(content) {
  const matches = [...content.matchAll(/\|\s*(ref\d+)\s*\|/gi)].map((match) => Number(match[1].replace(/\D/g, "")));
  const max = matches.length ? Math.max(...matches) : 0;
  return `ref${max + 1}`;
}

function claimHash(claim) {
  return crypto.createHash("sha1").update(normalizeText(claim)).digest("hex").slice(0, 12);
}

function candidateDoi(entry) {
  const raw = String(entry.doi || entry.candidateSource || "");
  const doiMatch = raw.match(/\b10\.\d{4,9}\/[^\s|]+/i);
  return canonicalDoi(doiMatch ? doiMatch[0] : raw);
}

function statusRank(status) {
  const order = ["needed", "searching", "candidate-found", "imported", "inserted", "verified", "rejected"];
  const index = order.indexOf(status);
  return index === -1 ? 0 : index;
}

function mergeEntry(existing, next) {
  const status = statusRank(next.status) >= statusRank(existing.status) ? next.status : existing.status;
  return {
    ...existing,
    claim: next.claim || existing.claim,
    status: status || "needed",
    query: next.query || existing.query,
    candidateSource: next.candidateSource || existing.candidateSource,
    zoteroKey: next.zoteroKey || existing.zoteroKey,
    notes: next.notes || existing.notes
  };
}

function findMatchingEntry(entries, entry) {
  const normalizedClaim = normalizeText(entry.claim);
  const doi = candidateDoi(entry);

  return entries.find((existing) => {
    if (entry.id && existing.id === entry.id) {
      return true;
    }
    if (entry.zoteroKey && existing.zoteroKey === entry.zoteroKey) {
      return true;
    }
    if (doi && candidateDoi(existing) === doi) {
      return true;
    }
    return normalizedClaim && normalizeText(existing.claim) === normalizedClaim;
  });
}

function renderRegisterRows(entries) {
  const rows = entries.map((entry) => {
    const row = [
      entry.id,
      entry.claim,
      entry.status || "needed",
      entry.query,
      entry.candidateSource,
      entry.zoteroKey,
      entry.notes
    ]
      .map(escapeCell)
      .join(" | ");
    return `| ${row} |`;
  });
  return rows;
}

function renderRegister(entries, existingContent = "") {
  const rows = renderRegisterRows(entries);
  const tableLines = [TABLE_HEADER, TABLE_SEPARATOR, ...rows];
  const lines = String(existingContent || "").split(/\r?\n/);
  const range = findRegisterTableRange(lines);

  if (!range) {
    const existing = String(existingContent || "").trimEnd();
    const table = `${TABLE_HEADER}\n${TABLE_SEPARATOR}\n${rows.join("\n")}${rows.length ? "\n" : ""}`;
    return existing ? `${existing}\n\n${table}` : `${HEADER}\n${rows.join("\n")}${rows.length ? "\n" : ""}`;
  }

  const rendered = [
    ...lines.slice(0, range.start),
    ...tableLines,
    ...lines.slice(range.end)
  ].join("\n");

  return rendered.endsWith("\n") ? rendered : `${rendered}\n`;
}

function atomicWrite(registerPath, content) {
  fs.mkdirSync(path.dirname(registerPath), { recursive: true });
  const tempPath = `${registerPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, registerPath);
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

function upsertRegisterEntry(registerPath, entry) {
  ensureRegisterFile(registerPath);
  const content = fs.readFileSync(registerPath, "utf8");
  const entries = parseRegisterContent(content);
  const match = findMatchingEntry(entries, entry);
  let id;

  if (match) {
    id = match.id;
    const index = entries.indexOf(match);
    entries[index] = mergeEntry(match, { ...entry, id });
  } else {
    id = entry.id || nextReferenceId(content);
    entries.push({
      id,
      claimHash: claimHash(entry.claim),
      claim: entry.claim || "",
      status: entry.status || "needed",
      query: entry.query || "",
      candidateSource: entry.candidateSource || "",
      zoteroKey: entry.zoteroKey || "",
      notes: entry.notes || ""
    });
  }

  atomicWrite(registerPath, renderRegister(entries, content));
  return id;
}

module.exports = {
  HEADER,
  appendRegisterEntry,
  ensureRegisterFile,
  escapeCell,
  nextReferenceId,
  renderRegister,
  parseRegisterContent,
  splitMarkdownRow,
  upsertRegisterEntry
};
