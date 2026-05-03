"use strict";

function findReplacementSpan(text) {
  const citationNeeded = text.match(/\[citation needed\]/i);
  if (citationNeeded && citationNeeded.index !== undefined) {
    return {
      start: citationNeeded.index,
      end: citationNeeded.index + citationNeeded[0].length
    };
  }

  const placeholder = text.match(/\[@ref\d+\]/i);
  if (placeholder && placeholder.index !== undefined) {
    return {
      start: placeholder.index,
      end: placeholder.index + placeholder[0].length
    };
  }

  return null;
}

function planCitationInsertion(selectedText, citekey) {
  const citation = `[@${citekey}]`;
  const replacementSpan = findReplacementSpan(selectedText);

  if (replacementSpan) {
    return {
      mode: "replace-inside-selection",
      citation,
      replacementSpan,
      leadingText: "",
      trailingText: ""
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
  planCitationInsertion
};
