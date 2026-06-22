"use strict";

const { McpSseClient } = require("./mcpSseClient");
const { canonicalDoi, canonicalUrl, cleanText } = require("./citationResults");

function makeScholarBaseUrl(source) {
  if (source && source.host && source.scholarPort) {
    return `http://${source.host}:${source.scholarPort}`;
  }
  if (source && source.config && source.config.mcp) {
    const host = source.config.mcp.host || "localhost";
    const port = source.config.mcp.scholarPort || 3847;
    return `http://${host}:${port}`;
  }
  const host = source?.host || "localhost";
  const port = source?.scholarPort || source?.port || 3847;
  return `http://${host}:${port}`;
}

function parseScholarAuthors(raw) {
  if (!raw) {
    return [];
  }

  const beforeDash = String(raw).split(/\s+-\s+/)[0];
  return beforeDash
    .split(/\s*,\s*|\s+and\s+/i)
    .map(cleanText)
    .filter(Boolean);
}

function parseScholarYear(raw) {
  const match = String(raw || "").match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

function normalizeScholarTitle(title) {
  return String(title || "").replace(/^(\[[^\]]+\]\s*)+/, "").trim();
}

function normalizeScholarResults(result) {
  const structured = result.structuredContent && typeof result.structuredContent === "object"
    ? result.structuredContent
    : {};
  const items = Array.isArray(structured.result)
    ? structured.result
    : Array.isArray(structured.results)
      ? structured.results
      : [];

  return items.map((item) => {
    const doi = canonicalDoi(item.DOI || item.doi);
    const url = canonicalUrl(item.URL || item.url || item.Link || item.link);
    return {
      source: "Google Scholar",
      alreadyInBibliography: false,
      alreadyInZotero: false,
      citekey: "",
      id: url || item.Title || item.title || "",
      title: normalizeScholarTitle(item.Title || item.title),
      authors: parseScholarAuthors(item.Authors || item.authors),
      year: String(item.Year || item.year || parseScholarYear(item.Authors || item.authors)),
      venue: cleanText(item.Venue || item.venue || item.Publication || item.publication),
      doi,
      url,
      abstract: cleanText(item.Abstract || item.abstract || item.Snippet || item.snippet),
      citationCount: Number(item.Citations || item.citations || item.citationCount) || 0
    };
  }).filter((item) => item.title || item.url || item.doi);
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
