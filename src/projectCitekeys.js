"use strict";

const fs = require("fs");
const { extractCitationOccurrences } = require("./citationDiagnostics");
const { isValidCitekey } = require("./citationResults");

function isPlaceholderCitekey(value) {
  return /^ref\d+$/i.test(String(value || ""));
}

function collectCitekeysFromText(text) {
  const keys = new Set();

  for (const occurrence of extractCitationOccurrences(String(text || ""))) {
    if (!isPlaceholderCitekey(occurrence.key) && isValidCitekey(occurrence.key)) {
      keys.add(occurrence.key);
    }
  }

  return [...keys].sort();
}

function collectProjectCitekeys(project, options = {}) {
  const keys = new Set();
  const manuscriptTexts = options.manuscriptTexts || [];
  const useEditorManuscript = manuscriptTexts.length > 0;

  if (useEditorManuscript) {
    for (const text of manuscriptTexts) {
      for (const key of collectCitekeysFromText(text)) {
        keys.add(key);
      }
    }
  } else if (project.exists.manuscript && fs.existsSync(project.paths.manuscript)) {
    const manuscriptText = fs.readFileSync(project.paths.manuscript, "utf8");
    for (const key of collectCitekeysFromText(manuscriptText)) {
      keys.add(key);
    }
  }

  for (const key of options.additionalKeys || []) {
    if (isValidCitekey(key) && !isPlaceholderCitekey(key)) {
      keys.add(key);
    }
  }

  return [...keys].sort();
}

module.exports = {
  collectCitekeysFromText,
  collectProjectCitekeys,
  isPlaceholderCitekey
};
