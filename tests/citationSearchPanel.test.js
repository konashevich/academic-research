"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { renderCitationSearchHtml } = require("../src/citationSearchPanel");

test("renders citation results as actionable evidence cards", () => {
  const html = renderCitationSearchHtml({
    nonce: "abc123",
    claim: "A claim about learning outcomes <with markup>",
    results: [
      {
        source: "Local bibliography",
        alreadyInBibliography: true,
        citekey: "KEY2024",
        title: "Learning Outcomes",
        authors: ["Jane Smith"],
        year: "2024",
        venue: "Journal of Tests",
        doi: "10.1234/example",
        abstract: "A useful source."
      },
      {
        source: "OpenAlex",
        alreadyInBibliography: false,
        title: "External Source",
        authors: ["Alex Reader"],
        url: "https://example.test/source"
      }
    ]
  });

  assert.match(html, /Evidence Review/);
  assert.match(html, /A claim about learning outcomes &lt;with markup&gt;/);
  assert.match(html, /Learning Outcomes/);
  assert.match(html, /data-action="insert"/);
  assert.match(html, /data-action="importInsert"/);
  assert.match(html, /data-action="register"/);
});

test("does not offer Zotero import when importing is disabled", () => {
  const html = renderCitationSearchHtml({
    nonce: "abc123",
    claim: "A claim",
    canImportToZotero: false,
    results: [
      {
        source: "OpenAlex",
        title: "External Source"
      }
    ]
  });

  assert.doesNotMatch(html, /data-action="importInsert"/);
  assert.equal((html.match(/data-action="register"/g) || []).length, 1);
});

test("renders an empty search state with a register action", () => {
  const html = renderCitationSearchHtml({
    nonce: "abc123",
    claim: "A claim with no candidates",
    results: []
  });

  assert.match(html, /No citation candidates found/);
  assert.match(html, /data-action="registerClaim"/);
});
