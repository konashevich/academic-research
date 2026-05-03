"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { loadBibliographyFromContent, searchBibliography } = require("../src/bibliographyIndex");

test("loads CSL JSON and searches by title and author", () => {
  const items = loadBibliographyFromContent(JSON.stringify([
    {
      id: "NAKAMOTO2008",
      title: "Bitcoin: A Peer-to-Peer Electronic Cash System",
      author: [{ family: "Nakamoto", given: "Satoshi" }],
      issued: { "date-parts": [[2008]] },
      DOI: "10.0000/example",
      "container-title": "Bitcoin.org"
    },
    {
      id: "SMITH2020",
      title: "Unrelated Paper",
      author: [{ family: "Smith", given: "Jane" }]
    }
  ]));

  const results = searchBibliography(items, "peer electronic cash Nakamoto");

  assert.equal(results[0].citekey, "NAKAMOTO2008");
  assert.equal(results[0].alreadyInBibliography, true);
  assert.equal(results[0].year, "2008");
});
