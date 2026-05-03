"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { parseAcademicPaperYaml, resolveEnvironmentDefault } = require("../src/paperYaml");

test("parses IADE paper.yaml fields used by the extension", () => {
  const config = parseAcademicPaperYaml(`
project:
  title: "Example Paper"
  language: "en-US" # inline comment
  manuscript: "paper.md"
  bibliography: "refs/bibliography.json"

target: ledger

targets:
  ledger:
    description: "Ledger Journal"
    csl: "styles/ledger.csl"
    documentclass: article
    classoption: ""
    template: "templates/ledger/header.tex"
    geometry: "a4paper,margin=2.5cm"
    fontsize: "11pt"

mcp:
  host: "localhost"
  zotero_port: 9180
  scholar_port: 3847
`);

  assert.equal(config.project.title, "Example Paper");
  assert.equal(config.project.language, "en-US");
  assert.equal(config.project.manuscript, "paper.md");
  assert.equal(config.project.bibliography, "refs/bibliography.json");
  assert.equal(config.target, "ledger");
  assert.equal(config.activeTarget.csl, "styles/ledger.csl");
  assert.equal(config.activeTarget.description, "Ledger Journal");
  assert.deepEqual(config.targets, ["ledger"]);
  assert.equal(config.mcp.zoteroPort, 9180);
});

test("resolves shell-style environment defaults used in paper.yaml", () => {
  assert.equal(resolveEnvironmentDefault("${ACADEMIC_MCP_HOST:-localhost}"), "localhost");
});
