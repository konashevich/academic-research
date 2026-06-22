"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { renderCitationSearchHtml } = require("../src/citationSearchPanel");

test("renders citation results as actionable evidence cards", () => {
  const html = renderCitationSearchHtml({
    nonce: "abc123",
    sessionId: "session-1",
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
  assert.match(html, /session-1/);
  assert.match(html, /A claim about learning outcomes &lt;with markup&gt;/);
  assert.match(html, /Learning Outcomes/);
  assert.match(html, /data-action="insert"/);
  assert.match(html, /data-action="importInsert"/);
  assert.match(html, /data-action="register"/);
  assert.match(html, /data-action="open"/);
  assert.match(html, /Add this paper to Zotero, sync the bibliography/);
  assert.match(html, /Save this claim and candidate source to the reference register/);
  assert.match(html, /Open the paper in your default browser/);
  assert.match(html, /class="info-icon"/);
});

test("downgrades weak external metadata to register", () => {
  const html = renderCitationSearchHtml({
    nonce: "abc123",
    sessionId: "session-1",
    claim: "A claim",
    results: [
      {
        source: "OpenAlex",
        title: "",
        canImport: false,
        metadataQuality: { reasons: ["missing title"] }
      }
    ]
  });

  assert.doesNotMatch(html, /data-action="importInsert"/);
  assert.match(html, /Import disabled: missing title/);
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

test("renders provider status details", () => {
  const html = renderCitationSearchHtml({
    nonce: "abc123",
    claim: "A claim",
    results: [],
    providerStatuses: [
      { label: "Zotero MCP", ok: true, detail: "search only; import unavailable" },
      { label: "Google Scholar MCP", ok: false, detail: "Timed out" }
    ]
  });

  assert.match(html, /Zotero MCP: search only; import unavailable/);
  assert.match(html, /Google Scholar MCP: Timed out/);
});

test("renders agent relevance badges and collapsed dropped section", () => {
  const html = renderCitationSearchHtml({
    nonce: "abc123",
    claim: "Blockchain in higher education",
    results: [
      {
        source: "OpenAlex",
        title: "Blockchain for credentials",
        agentScore: 91,
        agentVerdict: "relevant",
        agentReason: "Directly addresses blockchain in education.",
        url: "https://example.test/one"
      }
    ],
    droppedResults: [
      {
        source: "OpenAlex",
        title: "Medical imaging survey",
        agentScore: 8,
        agentVerdict: "irrelevant",
        agentReason: "Unrelated medical field.",
        url: "https://example.test/two"
      }
    ],
    providerStatuses: [
      { label: "Relevance agent", ok: true, detail: "kept 1, dropped 1" }
    ]
  });

  assert.match(html, /Relevance 91/);
  assert.match(html, /Directly addresses blockchain in education/);
  assert.match(html, /Hidden by agent \(1\)/);
  assert.match(html, /data-section="dropped"/);
  assert.match(html, /Unrelated medical field/);
});

test("allows insert actions for hidden bibliography matches", () => {
  const html = renderCitationSearchHtml({
    nonce: "abc123",
    claim: "A claim",
    results: [],
    droppedResults: [
      {
        source: "Local bibliography",
        title: "Known paper",
        alreadyInBibliography: true,
        citekey: "KNOWN2024"
      }
    ]
  });

  assert.match(html, /data-action="insert"[^>]*data-section="dropped"/);
});

test("renders skipped relevance agent status without warning styling", () => {
  const html = renderCitationSearchHtml({
    nonce: "abc123",
    claim: "A claim",
    results: [{ title: "Paper" }],
    providerStatuses: [
      { label: "Relevance agent", ok: false, skipped: true, detail: "no API key" }
    ]
  });

  assert.match(html, /class="skipped">Relevance agent: no API key/);
});

test("expands dropped section when all candidates were filtered", () => {
  const html = renderCitationSearchHtml({
    nonce: "abc123",
    claim: "Blockchain claim",
    results: [],
    droppedResults: [{ title: "Hidden paper", agentScore: 5, agentVerdict: "irrelevant" }],
    expandDropped: true
  });

  assert.match(html, /All candidates were filtered as low relevance/);
  assert.match(html, /dropped-panel open/);
});
