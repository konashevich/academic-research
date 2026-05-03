"use strict";

function getLineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function offsetToPosition(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle] <= offset && (middle === lineStarts.length - 1 || lineStarts[middle + 1] > offset)) {
      return {
        line: middle,
        character: offset - lineStarts[middle]
      };
    }
    if (lineStarts[middle] > offset) {
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }

  return { line: 0, character: offset };
}

function extractCitationOccurrences(text) {
  const occurrences = [];
  const citationBlockRegex = /\[([^\]]*@[^\]]*)\]/g;
  const keyRegex = /@([A-Za-z0-9_.-]+)/g;
  let blockMatch;

  while ((blockMatch = citationBlockRegex.exec(text))) {
    const block = blockMatch[1];
    let keyMatch;

    while ((keyMatch = keyRegex.exec(block))) {
      const keyStart = blockMatch.index + 1 + keyMatch.index;
      occurrences.push({
        key: keyMatch[1],
        start: keyStart,
        end: keyStart + keyMatch[0].length,
        block: blockMatch[0]
      });
    }
  }

  return occurrences;
}

function extractCitationNeededOccurrences(text) {
  const occurrences = [];
  const regex = /\[citation needed\]/gi;
  let match;

  while ((match = regex.exec(text))) {
    occurrences.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0]
    });
  }

  return occurrences;
}

function findCitationIssues(text, bibliographyIds) {
  const ids = new Set(bibliographyIds);
  const lineStarts = getLineStarts(text);
  const issues = [];

  for (const occurrence of extractCitationNeededOccurrences(text)) {
    issues.push({
      type: "citation-needed",
      key: "",
      message: "This claim is marked as needing a citation.",
      start: offsetToPosition(lineStarts, occurrence.start),
      end: offsetToPosition(lineStarts, occurrence.end)
    });
  }

  for (const occurrence of extractCitationOccurrences(text)) {
    const isPlaceholder = /^ref\d+$/i.test(occurrence.key);
    const exists = ids.has(occurrence.key);

    if (!exists || isPlaceholder) {
      issues.push({
        type: isPlaceholder ? "placeholder" : "missing",
        key: occurrence.key,
        message: isPlaceholder
          ? `Placeholder citation @${occurrence.key} still needs a real source.`
          : `Citation @${occurrence.key} is missing from the bibliography.`,
        start: offsetToPosition(lineStarts, occurrence.start),
        end: offsetToPosition(lineStarts, occurrence.end)
      });
    }
  }

  return issues;
}

module.exports = {
  extractCitationNeededOccurrences,
  extractCitationOccurrences,
  findCitationIssues,
  getLineStarts,
  offsetToPosition
};
