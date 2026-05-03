"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  extractCitationNeededOccurrences,
  extractCitationOccurrences,
  findCitationIssues
} = require("../src/citationDiagnostics");

test("extracts Pandoc citation keys", () => {
  const occurrences = extractCitationOccurrences("A claim [@KNOWN2020; @MISSING, p. 42].");

  assert.deepEqual(
    occurrences.map((occurrence) => occurrence.key),
    ["KNOWN2020", "MISSING"]
  );
});

test("reports missing citations and unresolved placeholders", () => {
  const issues = findCitationIssues("A [@KNOWN2020]. B [@MISSING]. C [@ref1].", ["KNOWN2020"]);

  assert.deepEqual(
    issues.map((issue) => [issue.type, issue.key]),
    [
      ["missing", "MISSING"],
      ["placeholder", "ref1"]
    ]
  );
});

test("reports citation needed markers", () => {
  const occurrences = extractCitationNeededOccurrences("A claim [citation needed].");
  const issues = findCitationIssues("A claim [citation needed].", []);

  assert.equal(occurrences.length, 1);
  assert.deepEqual(
    issues.map((issue) => issue.type),
    ["citation-needed"]
  );
});
