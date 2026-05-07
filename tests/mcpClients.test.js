"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { parseSseEvents } = require("../src/mcpSseClient");
const {
  buildZoteroCreateItemArgs,
  normalizeCslIdsToZoteroKeys,
  parseCreatedZoteroKey,
  parseZoteroSearchResults
} = require("../src/zoteroMcpClient");
const { normalizeScholarResults } = require("../src/scholarMcpClient");

test("parses SSE events with CRLF separators", () => {
  const parsed = parseSseEvents("event: message\r\ndata: {\"id\":1}\r\n\r\n");

  assert.deepEqual(parsed.events, ['{"id":1}']);
  assert.equal(parsed.buffer, "");
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
