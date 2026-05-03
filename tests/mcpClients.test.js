"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { parseSseEvents } = require("../src/mcpSseClient");
const { normalizeCslIdsToZoteroKeys, parseZoteroSearchResults } = require("../src/zoteroMcpClient");
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
