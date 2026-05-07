"use strict";

const crypto = require("crypto");
const { McpSseClient, extractJsonFromToolText, toolText } = require("./mcpSseClient");

function makeZoteroBaseUrl(project) {
  const host = project.config.mcp.host || "localhost";
  const port = project.config.mcp.zoteroPort || 9180;
  return `http://${host}:${port}`;
}

function parseZoteroSuggestionLine(line) {
  const match = line.match(/^\d+\.\s+(.+?)\s+[—-]\s+(.+?)\s+\(Key `([^`]+)`\)/);
  if (!match) {
    return null;
  }

  return {
    source: "Zotero",
    alreadyInBibliography: false,
    alreadyInZotero: true,
    citekey: match[3],
    id: match[3],
    title: match[1].trim(),
    authors: match[2].trim() ? [match[2].trim()] : [],
    year: "",
    venue: "",
    doi: "",
    url: "",
    abstract: ""
  };
}

function parseZoteroSearchResults(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => parseZoteroSuggestionLine(line.trim()))
    .filter(Boolean);
}

function normalizeCslIdsToZoteroKeys(content) {
  const parsed = JSON.parse(content);
  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : [];

  for (const item of items) {
    if (item && typeof item.id === "string" && item.id.includes("/")) {
      item.id = item.id.split("/").pop();
    }
  }

  return JSON.stringify(items, null, 2);
}

function cleanValue(value) {
  return String(value || "").trim();
}

function buildWriteToken(result, claim) {
  const fingerprint = [result.doi, result.url, result.id, result.title, claim].map(cleanValue).filter(Boolean).join("|");
  return `academic-research-${crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 32)}`;
}

function buildZoteroCreateItemArgs(result, claim = "") {
  const fields = {
    title: cleanValue(result.title),
    creators: Array.isArray(result.authors)
      ? result.authors.map((author) => ({ creatorType: "author", name: cleanValue(author) })).filter((author) => author.name)
      : []
  };

  const fieldMappings = [
    ["date", result.year],
    ["publicationTitle", result.venue],
    ["DOI", result.doi],
    ["url", result.url],
    ["abstractNote", result.abstract]
  ];

  for (const [field, value] of fieldMappings) {
    const cleaned = cleanValue(value);
    if (cleaned) {
      fields[field] = cleaned;
    }
  }

  return {
    itemType: "journalArticle",
    fields,
    tags: ["academic-research", result.source ? `source:${result.source}` : "source:external"],
    writeToken: buildWriteToken(result, claim)
  };
}

function parseCreatedZoteroKey(text) {
  const jsonBlock = String(text || "").match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[1]);
      if (parsed && typeof parsed.key === "string" && parsed.key.trim()) {
        return parsed.key.trim();
      }
    } catch (_error) {}
  }

  const keyLine = String(text || "").match(/(?:Key|already existed):\s*`([^`]+)`/i);
  return keyLine ? keyLine[1].trim() : "";
}

class ZoteroMcpClient {
  constructor(project) {
    this.client = new McpSseClient(makeZoteroBaseUrl(project), {
      clientName: "academic-research-zotero"
    });
  }

  async close() {
    await this.client.close();
  }

  async health() {
    return this.client.callTool("zotero_health", {});
  }

  async search(text, limit = 5) {
    const result = await this.client.callTool("zotero_suggest_citations", {
      text,
      limit,
      qmode: "everything"
    });

    return parseZoteroSearchResults(toolText(result));
  }

  async exportBibliographyContent() {
    const result = await this.client.callTool(
      "zotero_export_bibliography_content",
      {
        format: "csljson",
        scope: "library",
        fetchAll: true,
        limit: 100000
      },
      180000
    );
    const payload = extractJsonFromToolText(toolText(result));
    const content = payload.content || "[]";

    return {
      content: normalizeCslIdsToZoteroKeys(content),
      count: payload.count || 0,
      sha256: payload.sha256 || "",
      warnings: payload.warnings || []
    };
  }

  async createItemFromResult(result, claim = "") {
    const toolResult = await this.client.callTool("zotero_create_item", buildZoteroCreateItemArgs(result, claim), 60000);
    const text = toolText(toolResult);
    const key = parseCreatedZoteroKey(text);

    if (!key) {
      throw new Error(text || "Zotero did not return a created item key.");
    }

    return { key, text };
  }
}

module.exports = {
  buildZoteroCreateItemArgs,
  ZoteroMcpClient,
  makeZoteroBaseUrl,
  normalizeCslIdsToZoteroKeys,
  parseCreatedZoteroKey,
  parseZoteroSearchResults
};
