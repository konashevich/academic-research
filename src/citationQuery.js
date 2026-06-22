"use strict";

const MAX_SELECTION_LENGTH = 4000;
const MAX_QUERY_LENGTH = 700;

function collapseWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function stripMarkdownNoise(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[citation needed\]/gi, " ")
    .replace(/\[[^\]]*@[^\]]*\]/g, " ")
    .replace(/[@*_>#~]/g, " ");
}

function buildCitationQuery(selectedText, options = {}) {
  const maxSelectionLength = options.maxSelectionLength || MAX_SELECTION_LENGTH;
  const maxQueryLength = options.maxQueryLength || MAX_QUERY_LENGTH;
  const claim = collapseWhitespace(selectedText);

  if (!claim) {
    return {
      ok: false,
      reason: "empty",
      message: "Select manuscript text first."
    };
  }

  if (claim.length > maxSelectionLength) {
    return {
      ok: false,
      reason: "too-long",
      message: `Selection is too long for citation search. Select a specific claim under ${maxSelectionLength} characters.`
    };
  }

  const queryText = collapseWhitespace(stripMarkdownNoise(claim)).slice(0, maxQueryLength).trim();
  if (!queryText || queryText.length < 4) {
    return {
      ok: false,
      reason: "too-weak",
      message: "Selection does not contain enough searchable claim text."
    };
  }

  return {
    ok: true,
    claim,
    queryText
  };
}

function extractClaimTextFromLine(lineText) {
  return collapseWhitespace(stripMarkdownNoise(lineText));
}

module.exports = {
  MAX_QUERY_LENGTH,
  MAX_SELECTION_LENGTH,
  buildCitationQuery,
  collapseWhitespace,
  extractClaimTextFromLine,
  stripMarkdownNoise
};
