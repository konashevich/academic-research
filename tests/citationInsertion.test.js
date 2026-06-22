"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { planCitationInsertion } = require("../src/citationInsertion");

test("plans append insertion for ordinary selected text", () => {
  const plan = planCitationInsertion("Important claim", "SMITH2020");

  assert.equal(plan.mode, "append-after-selection");
  assert.equal(plan.leadingText, " ");
  assert.equal(plan.citation, "[@SMITH2020]");
});

test("plans replacement for citation needed marker", () => {
  const plan = planCitationInsertion("Important claim [citation needed]", "SMITH2020");

  assert.equal(plan.mode, "replace-inside-selection");
  assert.deepEqual(plan.replacementSpan, { start: 16, end: 33 });
});

test("plans replacement for placeholder citation", () => {
  const plan = planCitationInsertion("Important claim [@ref12]", "SMITH2020");

  assert.equal(plan.mode, "replace-inside-selection");
  assert.deepEqual(plan.replacementSpan, { start: 16, end: 24 });
});

test("rejects ambiguous selections with multiple unresolved markers", () => {
  const plan = planCitationInsertion("First [citation needed]. Second [@ref2].", "SMITH2020");

  assert.equal(plan.mode, "ambiguous-unresolved-marker");
});

test("rejects invalid citekeys before building Pandoc syntax", () => {
  const plan = planCitationInsertion("Important claim", "bad/key");

  assert.equal(plan.mode, "invalid-citekey");
});
