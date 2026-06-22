"use strict";

const crypto = require("crypto");
const { McpSseClient, extractJsonFromToolResult, toolText } = require("./mcpSseClient");
const { assessMetadataQuality, cleanText, normalizeCitationResult } = require("./citationResults");

function makeZoteroBaseUrl(source) {
  if (source && source.host && source.zoteroPort) {
    return `http://${source.host}:${source.zoteroPort}`;
  }
  if (source && source.config && source.config.mcp) {
    const host = source.config.mcp.host || "localhost";
    const port = source.config.mcp.zoteroPort || 9180;
    return `http://${host}:${port}`;
  }
  const host = source?.host || "localhost";
  const port = source?.zoteroPort || source?.port || 9180;
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

function normalizeStructuredCreators(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((creator) => {
      if (typeof creator === "string") {
        return cleanText(creator);
      }
      if (!creator || typeof creator !== "object") {
        return "";
      }
      return cleanText(creator.name || creator.literal || [creator.given, creator.family].filter(Boolean).join(" "));
    })
    .filter(Boolean);
}

function structuredArray(value) {
  if (!value || typeof value !== "object") {
    return [];
  }

  for (const key of ["result", "results", "items", "suggestions"]) {
    if (Array.isArray(value[key])) {
      return value[key];
    }
  }

  return [];
}

function parseZoteroStructuredResults(result) {
  const structured = result && result.structuredContent && typeof result.structuredContent === "object"
    ? result.structuredContent
    : {};

  return structuredArray(structured)
    .map((item) => {
      const key = cleanText(item.key || item.citekey || item.id);
      const title = cleanText(item.title || item.Title);
      return {
        source: "Zotero",
        alreadyInBibliography: false,
        alreadyInZotero: true,
        citekey: key,
        id: key || cleanText(item.id || item.url || item.URL),
        title,
        authors: normalizeStructuredCreators(item.authors || item.creators || item.author),
        year: cleanText(item.year || item.date),
        venue: cleanText(item.venue || item.publicationTitle || item["container-title"]),
        doi: cleanText(item.doi || item.DOI),
        url: cleanText(item.url || item.URL),
        abstract: cleanText(item.abstract || item.abstractNote)
      };
    })
    .filter((item) => item.citekey);
}

function normalizeCslItemId(item) {
  if (!item || typeof item.id !== "string") {
    return item;
  }

  if (item.id.includes("/")) {
    item.id = item.id.split("/").pop();
  }

  return item;
}

function isCslItem(value) {
  return Boolean(value && typeof value === "object" && typeof value.id === "string" && value.type);
}

const ZOTERO_TO_CSL_TYPE = {
  journalArticle: "article-journal",
  book: "book",
  bookSection: "chapter",
  report: "report",
  webpage: "webpage",
  conferencePaper: "paper-conference",
  thesis: "thesis",
  document: "document"
};

function normalizeCreatorsToCslAuthors(creators) {
  if (!Array.isArray(creators)) {
    return [];
  }

  return creators
    .map((creator) => {
      if (typeof creator === "string") {
        return { literal: creator };
      }
      if (!creator || typeof creator !== "object") {
        return null;
      }
      if (creator.literal) {
        return { literal: cleanText(creator.literal) };
      }
      if (creator.name) {
        return { literal: cleanText(creator.name) };
      }
      const given = cleanText(creator.given || creator.firstName);
      const family = cleanText(creator.family || creator.lastName);
      if (!given && !family) {
        return null;
      }
      return { given, family };
    })
    .filter(Boolean);
}

function buildIssuedFromDate(dateValue) {
  const match = String(dateValue || "").match(/\d{4}/);
  return match ? { "date-parts": [[Number(match[0])]] } : undefined;
}

function parseMarkdownItemMetadata(text, itemKey) {
  const body = String(text || "");
  if (!body.trim()) {
    return null;
  }

  const titleMatch = body.match(/^##\s*\d+\.\s*(.+)$/m)
    || body.match(/^#\s+(.+)$/m)
    || body.match(/\*\*Title\*\*:\s*(.+)$/im);
  const typeMatch = body.match(/\*\*Type\*\*:\s*([^|\n]+)/i);
  const dateMatch = body.match(/\*\*Date\*\*:\s*([^|\n]*)/i);
  const authorsMatch = body.match(/\*\*Authors?\*\*:\s*([^\n]+)/i);
  const doiMatch = body.match(/\*\*DOI\*\*:\s*([^\n]+)/i) || body.match(/\b(10\.\d{4,9}\/[^\s)]+)/i);
  const urlMatch = body.match(/\*\*URL\*\*:\s*(\S+)/i) || body.match(/(https?:\/\/[^\s)]+)/i);

  const title = cleanText(titleMatch ? titleMatch[1] : "");
  const itemType = cleanText(typeMatch ? typeMatch[1] : "");
  const authorsRaw = cleanText(authorsMatch ? authorsMatch[1] : "");
  const doi = cleanText(doiMatch ? (doiMatch[1] || doiMatch[0]) : "");
  const url = cleanText(urlMatch ? urlMatch[1] : "");

  if (!title && !doi && !url) {
    return null;
  }

  const csl = {
    id: itemKey,
    type: ZOTERO_TO_CSL_TYPE[itemType] || "document",
    title: title || "Untitled"
  };

  if (authorsRaw && !/^no authors$/i.test(authorsRaw)) {
    csl.author = [{ literal: authorsRaw }];
  }

  const issued = buildIssuedFromDate(dateMatch ? dateMatch[1] : "");
  if (issued) {
    csl.issued = issued;
  }
  if (doi) {
    csl.DOI = doi.replace(/[).,;\s]+$/, "");
  }
  if (url) {
    csl.URL = url.replace(/[).,;\s]+$/, "");
  }

  return csl;
}

function mapZoteroMetadataToCsl(itemKey, result) {
  const parsedItems = parseResolvedCitekeysResult(result);
  if (parsedItems.length) {
    const item = { ...parsedItems[0] };
    item.id = itemKey;
    return item;
  }

  let payload = {};
  try {
    payload = extractJsonFromToolResult(result);
  } catch (_error) {
    payload = result && result.structuredContent && typeof result.structuredContent === "object"
      ? result.structuredContent
      : {};
  }

  const record = payload.item || payload.metadata || payload;
  if (!record || typeof record !== "object") {
    return parseMarkdownItemMetadata(toolText(result), itemKey);
  }

  const title = cleanText(record.title || record.Title);
  const itemType = cleanText(record.itemType || record.item_type || record.type || "document");
  const doi = cleanText(record.DOI || record.doi);
  const url = cleanText(record.url || record.URL);

  if (!title && !doi && !url) {
    return parseMarkdownItemMetadata(toolText(result), itemKey);
  }

  const csl = {
    id: itemKey,
    type: ZOTERO_TO_CSL_TYPE[itemType] || "document",
    title: title || "Untitled"
  };

  const authors = normalizeCreatorsToCslAuthors(record.creators || record.author || record.authors);
  if (authors.length) {
    csl.author = authors;
  }

  const issued = buildIssuedFromDate(record.date || record.year || record.Date);
  if (issued) {
    csl.issued = issued;
  }

  if (doi) {
    csl.DOI = doi;
  }
  if (url) {
    csl.URL = url;
  }

  const venue = cleanText(record.publicationTitle || record["container-title"] || record.venue);
  if (venue) {
    csl["container-title"] = venue;
  }

  return csl;
}

function describeMetadataMappingFailure(result) {
  const text = toolText(result).trim();
  if (!text) {
    return "empty metadata response";
  }
  if (text.length > 160) {
    return `unrecognized metadata format (${text.slice(0, 160)}…)`;
  }
  return `unrecognized metadata format (${text})`;
}

function applyRequestedCitekey(item, requestedKey) {
  if (!item || !requestedKey) {
    return item;
  }
  item.id = requestedKey;
  return item;
}

function collectCslItems(value, items = [], requestedKey = "") {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectCslItems(entry, items, requestedKey);
    }
    return items;
  }

  if (!value || typeof value !== "object") {
    return items;
  }

  const wrapperKey = cleanText(value.citekey || value.citeKey || value.key || requestedKey);

  if (isCslItem(value)) {
    items.push(applyRequestedCitekey(normalizeCslItemId({ ...value }), wrapperKey || value.id));
    return items;
  }

  for (const key of ["item", "csl", "metadata", "cslItem", "entry"]) {
    if (isCslItem(value[key])) {
      items.push(applyRequestedCitekey(normalizeCslItemId({ ...value[key] }), wrapperKey));
    }
  }

  for (const key of ["items", "resolved", "results", "entries", "citekeys"]) {
    if (Array.isArray(value[key])) {
      collectCslItems(value[key], items, wrapperKey);
    }
  }

  if (typeof value.content === "string") {
    try {
      collectCslItems(JSON.parse(value.content), items, wrapperKey);
    } catch (_error) {}
  }

  if (typeof value.bibliographyContent === "string") {
    try {
      collectCslItems(JSON.parse(value.bibliographyContent), items, wrapperKey);
    } catch (_error) {}
  }

  return items;
}

function dedupeCslItems(items) {
  const byId = new Map();

  for (const item of items) {
    if (!isCslItem(item)) {
      continue;
    }
    const normalized = normalizeCslItemId({ ...item });
    byId.set(normalized.id, normalized);
  }

  return [...byId.values()];
}

function parseResolvedCitekeysResult(result) {
  const structured = result && result.structuredContent && typeof result.structuredContent === "object"
    ? result.structuredContent
    : {};

  let items = collectCslItems(structured);

  if (!items.length) {
    try {
      items = collectCslItems(extractJsonFromToolResult(result));
    } catch (_error) {}
  }

  if (!items.length) {
    const text = toolText(result);
    const fenced = text.match(/```json\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        items = collectCslItems(JSON.parse(fenced[1]));
      } catch (_error) {}
    }
  }

  return dedupeCslItems(items);
}

function isRequestedKeyResolved(key, items) {
  return items.some((item) => item.id === key);
}

function listUnresolvedKeys(requested, items) {
  return requested.filter((key) => !isRequestedKeyResolved(key, items));
}

function normalizeCslIdsToZoteroKeys(content) {
  const parsed = JSON.parse(content);
  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : [];

  for (const item of items) {
    normalizeCslItemId(item);
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
  const normalized = normalizeCitationResult(result);
  const quality = assessMetadataQuality(normalized);
  if (!quality.canImport) {
    throw new Error(`Source metadata is not strong enough to import: ${quality.reasons.join(", ")}`);
  }

  const fields = {
    title: cleanValue(normalized.title),
    creators: Array.isArray(normalized.authors)
      ? normalized.authors.map((author) => ({ creatorType: "author", name: cleanValue(author) })).filter((author) => author.name)
      : []
  };

  const fieldMappings = [
    ["date", normalized.year],
    ["publicationTitle", normalized.venue],
    ["DOI", normalized.doi],
    ["url", normalized.url],
    ["abstractNote", normalized.abstract]
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
    tags: ["academic-research", normalized.source ? `source:${normalized.source}` : "source:external"],
    writeToken: buildWriteToken(normalized, claim)
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

  async hasTool(name) {
    const result = await this.client.listTools();
    const tools = Array.isArray(result.tools) ? result.tools : [];
    return tools.some((tool) => tool.name === name);
  }

  async search(text, limit = 5) {
    const result = await this.client.callTool("zotero_suggest_citations", {
      text,
      limit,
      qmode: "everything"
    });

    const structuredResults = parseZoteroStructuredResults(result);
    return structuredResults.length ? structuredResults : parseZoteroSearchResults(toolText(result));
  }

  async resolveCitekeys(citekeys) {
    const result = await this.client.callTool(
      "zotero_resolve_citekeys",
      {
        citekeys,
        tryZotero: true,
        preferBBT: true
      },
      120000
    );

    return parseResolvedCitekeysResult(result);
  }

  async resolveBbtCitekeys(citekeys) {
    const result = await this.client.callTool(
      "zotero_bbt_resolve_citekeys",
      { citekeys },
      120000
    );

    return parseResolvedCitekeysResult(result);
  }

  async fetchCslItemMetadataDetailed(itemKey) {
    const result = await this.client.callTool("zotero_item_metadata", { item_key: itemKey }, 60000);
    const item = mapZoteroMetadataToCsl(itemKey, result);
    if (item) {
      return { item, detail: "" };
    }
    return { item: null, detail: describeMetadataMappingFailure(result) };
  }

  async fetchCslItemMetadata(itemKey) {
    const { item } = await this.fetchCslItemMetadataDetailed(itemKey);
    return item;
  }

  async resolveUnresolvedCitekeys(requested, items, warnings) {
    let unresolved = listUnresolvedKeys(requested, items);

    const canBbtResolve = unresolved.length
      ? await this.hasTool("zotero_bbt_resolve_citekeys").catch(() => false)
      : false;
    if (canBbtResolve) {
      const bbtItems = await this.resolveBbtCitekeys(unresolved);
      for (const item of bbtItems) {
        items.push(item);
      }
      const afterBbt = listUnresolvedKeys(requested, items);
      if (afterBbt.length < unresolved.length) {
        warnings.push(`Better BibTeX resolved ${unresolved.length - afterBbt.length} additional citekey(s).`);
      }
      unresolved = afterBbt;
    } else if (unresolved.length) {
      warnings.push("Better BibTeX resolver unavailable; trying per-item metadata lookup.");
    }

    for (const key of unresolved) {
      const { item, detail } = await this.fetchCslItemMetadataDetailed(key);
      if (item) {
        item.id = key;
        items.push(item);
        continue;
      }

      if (!canBbtResolve) {
        warnings.push(`Could not map metadata for @${key}: ${detail || "unknown response shape"}`);
        continue;
      }

      try {
        const bbtItems = await this.resolveBbtCitekeys([key]);
        const bbtItem = bbtItems.find((entry) => entry.id === key) || bbtItems[0];
        if (bbtItem) {
          bbtItem.id = key;
          items.push(bbtItem);
          warnings.push(`Resolved @${key} via Better BibTeX after metadata lookup failed.`);
          continue;
        }
      } catch (_error) {}

      warnings.push(`Could not map metadata for @${key}: ${detail || "unknown response shape"}`);
    }
  }

  async exportBibliographyForCitekeys(citekeys) {
    const requested = [...new Set((citekeys || []).filter(Boolean))];
    const warnings = [];

    if (!requested.length) {
      return {
        content: "[]",
        count: 0,
        requestedCount: 0,
        unresolved: [],
        warnings: []
      };
    }

    let items = [];
    const canResolve = await this.hasTool("zotero_resolve_citekeys").catch(() => false);
    if (canResolve) {
      items = await this.resolveCitekeys(requested);
    } else {
      warnings.push("Zotero MCP tool zotero_resolve_citekeys is unavailable; falling back to per-item metadata lookup.");
    }

    let unresolved = listUnresolvedKeys(requested, items);

    if (unresolved.length) {
      await this.resolveUnresolvedCitekeys(requested, items, warnings);
    }

    const finalUnresolved = listUnresolvedKeys(requested, items);
    const deduped = dedupeCslItems(items);

    if (finalUnresolved.length) {
      warnings.push(`Could not resolve ${finalUnresolved.length} citekey(s) from Zotero: ${finalUnresolved.join(", ")}`);
    }

    return {
      content: normalizeCslIdsToZoteroKeys(JSON.stringify(deduped)),
      count: deduped.length,
      requestedCount: requested.length,
      unresolved: finalUnresolved,
      warnings
    };
  }

  async createItemFromResult(result, claim = "") {
    const toolResult = await this.client.callTool("zotero_create_item", buildZoteroCreateItemArgs(result, claim), 60000);
    const text = toolText(toolResult);
    const structured = toolResult.structuredContent && typeof toolResult.structuredContent === "object" ? toolResult.structuredContent : {};
    const key = structured.key || parseCreatedZoteroKey(text);

    if (!key) {
      throw new Error(text || "Zotero did not return a created item key.");
    }

    return { key, text };
  }
}

module.exports = {
  buildZoteroCreateItemArgs,
  ZoteroMcpClient,
  collectCslItems,
  dedupeCslItems,
  describeMetadataMappingFailure,
  isRequestedKeyResolved,
  listUnresolvedKeys,
  makeZoteroBaseUrl,
  mapZoteroMetadataToCsl,
  normalizeCslIdsToZoteroKeys,
  parseMarkdownItemMetadata,
  parseResolvedCitekeysResult,
  parseZoteroStructuredResults,
  parseCreatedZoteroKey,
  parseZoteroSearchResults
};
