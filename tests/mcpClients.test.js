"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { McpSseClient, extractJsonFromToolResult, parseSseEvents } = require("../src/mcpSseClient");
const {
  buildZoteroCreateItemArgs,
  listUnresolvedKeys,
  mapZoteroMetadataToCsl,
  normalizeCslIdsToZoteroKeys,
  parseCreatedZoteroKey,
  parseMarkdownItemMetadata,
  parseResolvedCitekeysResult,
  parseZoteroStructuredResults,
  parseZoteroSearchResults
} = require("../src/zoteroMcpClient");
const { normalizeScholarResults } = require("../src/scholarMcpClient");

test("parses SSE events with CRLF separators", () => {
  const parsed = parseSseEvents("event: message\r\ndata: {\"id\":1}\r\n\r\n");

  assert.deepEqual(parsed.events, ['{"id":1}']);
  assert.equal(parsed.buffer, "");
});

test("prefers structured MCP tool content over text parsing", () => {
  const parsed = extractJsonFromToolResult({
    structuredContent: { key: "STRUCTURED" },
    content: [{ type: "text", text: "{\"key\":\"TEXT\"}" }]
  });

  assert.equal(parsed.key, "STRUCTURED");
});

test("removes timed-out SSE chunk waiters", async () => {
  const client = new McpSseClient("http://localhost:1");

  await assert.rejects(client.readChunk(1), /Timed out waiting for MCP response/);
  const nextChunk = client.readChunk(100);
  client.pushChunk("next");

  assert.equal(await nextChunk, "next");
});

test("parses Zotero suggestion text into citation candidates", () => {
  const results = parseZoteroSearchResults([
    "# Suggestions (top 1)",
    "1. Bitcoin Historical Node Count Charts — No authors (Key `NEVWKQWC`) [match: title:bitcoin]"
  ].join("\n"));

  assert.equal(results[0].source, "Zotero");
  assert.equal(results[0].citekey, "NEVWKQWC");
  assert.equal(results[0].title, "Bitcoin Historical Node Count Charts");
});

test("parses Zotero structured suggestion results", () => {
  const results = parseZoteroStructuredResults({
    structuredContent: {
      results: [
        {
          key: "STRUCTKEY",
          title: "Structured Zotero Source",
          creators: [{ given: "Jane", family: "Smith" }],
          year: "2024",
          DOI: "10.1234/structured"
        }
      ]
    }
  });

  assert.equal(results[0].source, "Zotero");
  assert.equal(results[0].citekey, "STRUCTKEY");
  assert.equal(results[0].title, "Structured Zotero Source");
  assert.deepEqual(results[0].authors, ["Jane Smith"]);
});

test("ignores Zotero structured suggestions without citekeys", () => {
  const results = parseZoteroStructuredResults({
    structuredContent: {
      results: [
        {
          title: "Zotero item without key",
          creators: ["Jane Smith"]
        }
      ]
    }
  });

  assert.deepEqual(results, []);
});


test("parses resolved citekeys from structured MCP content", () => {
  const items = parseResolvedCitekeysResult({
    structuredContent: {
      resolved: [
        {
          citekey: "ABC123",
          item: {
            id: "17365128/ABC123",
            type: "article-journal",
            title: "Resolved Source"
          }
        }
      ]
    }
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].id, "ABC123");
  assert.equal(items[0].title, "Resolved Source");
});

test("uses manuscript citekey when resolve wrapper differs from Zotero item id", () => {
  const items = parseResolvedCitekeysResult({
    structuredContent: {
      resolved: [
        {
          citekey: "smith2024",
          item: {
            id: "QU8VKVB6",
            type: "article-journal",
            title: "Better BibTeX Source"
          }
        }
      ]
    }
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].id, "smith2024");
});

test("maps markdown item metadata responses to CSL JSON", () => {
  const item = parseMarkdownItemMetadata([
    "## 1. Bitcoin Historical Node Count Charts",
    "**Type**: webpage | **Date**: 2024 | **Key**: `NEVWKQWC`",
    "**Authors**: Luke Dashjr",
    "A collection of historical charts."
  ].join("\n"), "NEVWKQWC");

  assert.equal(item.id, "NEVWKQWC");
  assert.equal(item.type, "webpage");
  assert.equal(item.title, "Bitcoin Historical Node Count Charts");
  assert.deepEqual(item.author, [{ literal: "Luke Dashjr" }]);
});

test("maps Zotero item metadata payloads to CSL JSON", () => {
  const item = mapZoteroMetadataToCsl("NEVWKQWC", {
    structuredContent: {
      title: "Bitcoin Historical Node Count Charts",
      itemType: "webpage",
      creators: [{ creatorType: "author", name: "Luke Dashjr" }],
      date: "2024",
      url: "https://example.test/bitcoin"
    }
  });

  assert.equal(item.id, "NEVWKQWC");
  assert.equal(item.type, "webpage");
  assert.equal(item.title, "Bitcoin Historical Node Count Charts");
  assert.deepEqual(item.author, [{ literal: "Luke Dashjr" }]);
  assert.equal(item.URL, "https://example.test/bitcoin");
});

test("parses resolved citekeys from direct CSL item arrays", () => {
  const items = parseResolvedCitekeysResult({
    structuredContent: {
      items: [
        { id: "PLAINKEY", type: "book", title: "Plain Key" }
      ]
    }
  });

  assert.deepEqual(items.map((item) => item.id), ["PLAINKEY"]);
});

test("tracks unresolved citekeys after project-scoped resolution", () => {
  const unresolved = listUnresolvedKeys(
    ["KNOWN", "MISSING"],
    [{ id: "KNOWN", type: "book", title: "Known" }]
  );

  assert.deepEqual(unresolved, ["MISSING"]);
});

test("normalizes Zotero library-prefixed CSL ids to item keys", () => {
  const content = normalizeCslIdsToZoteroKeys(JSON.stringify({
    items: [
      { id: "17365128/PI76NP4W", title: "Legal and Regulatory Framework" },
      { id: "PLAINKEY", title: "Plain Key" }
    ]
  }));
  const parsed = JSON.parse(content);

  assert.deepEqual(parsed.map((item) => item.id), ["PI76NP4W", "PLAINKEY"]);
});

test("builds Zotero create item args from an external result", () => {
  const args = buildZoteroCreateItemArgs({
    source: "OpenAlex",
    title: "Academic Source",
    authors: ["Jane Smith"],
    year: "2024",
    venue: "Journal of Testing",
    doi: "10.1234/example",
    url: "https://example.test/source",
    abstract: "Useful abstract."
  }, "claim text");

  assert.equal(args.itemType, "journalArticle");
  assert.equal(args.fields.title, "Academic Source");
  assert.deepEqual(args.fields.creators, [{ creatorType: "author", name: "Jane Smith" }]);
  assert.equal(args.fields.DOI, "10.1234/example");
  assert.equal(args.fields.publicationTitle, "Journal of Testing");
  assert.deepEqual(args.tags, ["academic-research", "source:OpenAlex"]);
  assert.match(args.writeToken, /^academic-research-[a-f0-9]{32}$/);
});

test("parses created Zotero key from MCP tool text", () => {
  assert.equal(parseCreatedZoteroKey("## ✅ Item created\nKey: `NEWKEY`"), "NEWKEY");
  assert.equal(parseCreatedZoteroKey("```json\n{\"key\":\"JSONKEY\"}\n```"), "JSONKEY");
});

test("normalizes Google Scholar structured results", () => {
  const results = normalizeScholarResults({
    structuredContent: {
      result: [
        {
          Title: "[PDF][PDF] Bitcoin: A peer-to-peer electronic cash system",
          Authors: "S Nakamoto - 2008 - assets.pubpub.org",
          Abstract: "A peer-to-peer version of electronic cash.",
          URL: "https://example.test/paper.pdf"
        }
      ]
    }
  });

  assert.equal(results[0].source, "Google Scholar");
  assert.equal(results[0].title, "Bitcoin: A peer-to-peer electronic cash system");
  assert.deepEqual(results[0].authors, ["S Nakamoto"]);
  assert.equal(results[0].year, "2008");
});
