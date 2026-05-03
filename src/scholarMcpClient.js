"use strict";

const { McpSseClient } = require("./mcpSseClient");

function makeScholarBaseUrl(project) {
  const host = project.config.mcp.host || "localhost";
  const port = project.config.mcp.scholarPort || 3847;
  return `http://${host}:${port}`;
}

function parseScholarAuthors(raw) {
  if (!raw) {
    return [];
  }

  const beforeDash = String(raw).split(/\s+-\s+/)[0];
  return beforeDash ? [beforeDash] : [];
}

function parseScholarYear(raw) {
  const match = String(raw || "").match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

function normalizeScholarTitle(title) {
  return String(title || "").replace(/^(\[[^\]]+\]\s*)+/, "").trim();
}

function normalizeScholarResults(result) {
  const items = result.structuredContent && Array.isArray(result.structuredContent.result)
    ? result.structuredContent.result
    : [];

  return items.map((item) => ({
    source: "Google Scholar",
    alreadyInBibliography: false,
    alreadyInZotero: false,
    citekey: "",
    id: item.URL || item.Title || "",
    title: normalizeScholarTitle(item.Title),
    authors: parseScholarAuthors(item.Authors),
    year: parseScholarYear(item.Authors),
    venue: "",
    doi: "",
    url: item.URL || "",
    abstract: item.Abstract || ""
  }));
}

class ScholarMcpClient {
  constructor(project) {
    this.client = new McpSseClient(makeScholarBaseUrl(project), {
      clientName: "academic-research-scholar"
    });
  }

  async close() {
    await this.client.close();
  }

  async search(query, limit = 5) {
    const result = await this.client.callTool("search_google_scholar_key_words", {
      query,
      num_results: limit
    });

    return normalizeScholarResults(result);
  }
}

module.exports = {
  ScholarMcpClient,
  makeScholarBaseUrl,
  normalizeScholarResults,
  parseScholarAuthors,
  parseScholarYear
};
