"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  assessMetadataQuality,
  canonicalDoi,
  canonicalUrl,
  isValidCitekey,
  mergeCitationResults
} = require("../src/citationResults");

test("canonicalizes DOI and URL values for duplicate detection", () => {
  assert.equal(canonicalDoi("https://doi.org/10.1234/ABC."), "10.1234/abc");
  assert.equal(canonicalUrl("https://Example.test/source?utm_source=x#section"), "https://example.test/source");
});

test("merges duplicate provider candidates and preserves bibliography citekey", () => {
  const bibliography = [
    {
      id: "KNOWN2024",
      title: "Known Paper",
      year: "2024",
      doi: "10.1234/known",
      url: "",
      authors: ["Jane Smith"]
    }
  ];
  const merged = mergeCitationResults([
    {
      source: "OpenAlex",
      title: "Known Paper",
      year: "2024",
      doi: "https://doi.org/10.1234/known",
      abstract: "Short."
    },
    {
      source: "Google Scholar",
      title: "Known Paper",
      year: "2024",
      doi: "10.1234/known",
      abstract: "A longer and more useful abstract."
    }
  ], bibliography);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].alreadyInBibliography, true);
  assert.equal(merged[0].citekey, "KNOWN2024");
  assert.match(merged[0].source, /OpenAlex/);
  assert.match(merged[0].source, /Google Scholar/);
  assert.equal(merged[0].abstract, "A longer and more useful abstract.");
});

test("marks weak metadata as not importable", () => {
  const quality = assessMetadataQuality({ title: "", doi: "", url: "" });

  assert.equal(quality.canImport, false);
  assert.ok(quality.reasons.includes("missing title"));
  assert.equal(isValidCitekey("GOOD:key_2024"), true);
  assert.equal(isValidCitekey("bad/key"), false);
});
