"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildCitationQuery } = require("../src/citationQuery");

test("cleans citation markers and markdown from selected claims", () => {
  const query = buildCitationQuery("**Important claim** [@OLD2020] with [context](https://example.test) [citation needed].");

  assert.equal(query.ok, true);
  assert.equal(query.claim, "**Important claim** [@OLD2020] with [context](https://example.test) [citation needed].");
  assert.equal(query.queryText, "Important claim with context.");
});

test("rejects oversized citation selections", () => {
  const query = buildCitationQuery("x".repeat(20), { maxSelectionLength: 10 });

  assert.equal(query.ok, false);
  assert.equal(query.reason, "too-long");
});

test("extracts claim text from a citation-needed line", () => {
  const { extractClaimTextFromLine } = require("../src/citationQuery");

  assert.equal(
    extractClaimTextFromLine("Transformer models scale well [citation needed]."),
    "Transformer models scale well."
  );
});
