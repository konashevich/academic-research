"use strict";

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
}

module.exports = {
  ZoteroMcpClient,
  makeZoteroBaseUrl,
  normalizeCslIdsToZoteroKeys,
  parseZoteroSearchResults
};
