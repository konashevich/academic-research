"use strict";

const { isValidCitekey } = require("./citationResults");

function findReplacementSpans(text) {
  const spans = [];
  const markerRegex = /\[citation needed\]|\[@ref\d+\]/gi;
  let match;

  while ((match = markerRegex.exec(text))) {
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0]
    });
  }

  return spans;
}

function findReplacementSpan(text) {
  const spans = findReplacementSpans(text);
  return spans.length === 1 ? { start: spans[0].start, end: spans[0].end } : null;
}

function planCitationInsertion(selectedText, citekey) {
  if (!isValidCitekey(citekey)) {
    return {
      mode: "invalid-citekey",
      citation: "",
      replacementSpan: null,
      leadingText: "",
      trailingText: "",
      reason: `Invalid citekey: ${citekey}`
    };
  }

  const citation = `[@${citekey}]`;
  const replacementSpans = findReplacementSpans(selectedText);

  if (replacementSpans.length === 1) {
    const replacementSpan = {
      start: replacementSpans[0].start,
      end: replacementSpans[0].end
    };
    return {
      mode: "replace-inside-selection",
      citation,
      replacementSpan,
      leadingText: "",
      trailingText: ""
    };
  }

  if (replacementSpans.length > 1) {
    return {
      mode: "ambiguous-unresolved-marker",
      citation,
      replacementSpan: null,
      leadingText: "",
      trailingText: "",
      reason: "Selection contains multiple unresolved citation markers. Select one marker or a smaller claim."
    };
  }

  const needsLeadingSpace = selectedText.length > 0 && !/\s$/.test(selectedText);

  return {
    mode: "append-after-selection",
    citation,
    replacementSpan: null,
    leadingText: needsLeadingSpace ? " " : "",
    trailingText: ""
  };
}

module.exports = {
  findReplacementSpan,
  findReplacementSpans,
  planCitationInsertion
};
