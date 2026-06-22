"use strict";

function yamlQuote(value) {
  if (value === null || value === undefined) {
    return '""';
  }
  const text = String(value);
  if (/^[a-zA-Z0-9_.-]+$/.test(text)) {
    return text;
  }
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function yamlList(items) {
  if (!items.length) {
    return "[]";
  }
  return `[${items.map((item) => yamlQuote(item)).join(", ")}]`;
}

function buildTargetSection(targetId, profile) {
  const lines = [
    `  ${targetId}:`,
    `    description: ${yamlQuote(profile.description || targetId)}`,
    `    csl: ${yamlQuote(profile.csl || `styles/${targetId}.csl`)}`,
    `    documentclass: ${profile.documentclass || "article"}`,
    `    classoption: ${yamlQuote(profile.classoption || "")}`,
    `    template: ${yamlQuote(profile.template || `templates/${targetId}/header.tex`)}`,
    `    geometry: ${yamlQuote(profile.geometry || "")}`,
    `    fontsize: ${yamlQuote(profile.fontsize || "10pt")}`,
    `    extra_pandoc_args: ${yamlList(profile.extra_pandoc_args || [])}`
  ];
  return lines.join("\n");
}

function buildPaperYaml(form, targets, mcp) {
  const title = form.title || "Your Paper Title Here";
  const authorName = form.authorName || "First Author";
  const affiliation = form.affiliation || "University of Example";
  const email = form.email || "author@example.edu";
  const language = form.language || "en-GB";
  const target = form.target || "lncs";
  const date = form.date || String(new Date().getFullYear());
  const shortTitle = form.shortTitle || title.split(/\s+/).slice(0, 4).join(" ");

  const targetBlocks = Object.entries(targets)
    .map(([id, profile]) => buildTargetSection(id, profile))
    .join("\n\n");

  const host = mcp.host || "127.0.0.1";
  const zoteroPort = mcp.zoteroPort || 9180;
  const scholarPort = mcp.scholarPort || 3847;

  return `# =============================================================================
# Academic Paper Configuration
# =============================================================================

project:
  title: ${yamlQuote(title)}
  short_title: ${yamlQuote(shortTitle)}
  authors:
    - name: ${yamlQuote(authorName)}
      affiliation: ${yamlQuote(affiliation)}
      email: ${yamlQuote(email)}
  date: ${yamlQuote(date)}
  language: ${yamlQuote(language)}
  manuscript: "paper.md"
  bibliography: "refs/bibliography.json"

target: ${target}

targets:
${targetBlocks}

mcp:
  host: ${yamlQuote(host)}
  zotero_port: ${zoteroPort}
  scholar_port: ${scholarPort}
`;
}

function buildManuscriptFrontmatter(form, targetProfile) {
  const title = form.title || "Your Paper Title Here";
  const authorName = form.authorName || "First Author";
  const affiliation = form.affiliation || "University of Example";
  const email = form.email || "author@example.edu";
  const date = form.date || String(new Date().getFullYear());
  const csl = targetProfile?.csl || `styles/${form.target || "lncs"}.csl`;

  return `---
title: ${yamlQuote(title)}
author:
  - name: ${yamlQuote(authorName)}
    affiliation: ${yamlQuote(affiliation)}
    email: ${yamlQuote(email)}
date: ${yamlQuote(date)}
bibliography: refs/bibliography.json
csl: ${yamlQuote(csl)}
---

## Abstract

*Write your abstract here. An abstract should be a concise summary (150–300 words) of the paper's purpose, methods, results, and conclusions.*

## 1. Introduction

## 2. Background

## 3. Methodology

## 4. Results

## 5. Discussion

## 6. Conclusion

## References
`;
}

module.exports = {
  buildManuscriptFrontmatter,
  buildPaperYaml,
  buildTargetSection,
  yamlQuote
};
