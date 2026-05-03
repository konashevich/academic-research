"use strict";

const fs = require("fs");

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getTitle(item) {
  return item.title || "";
}

function getYear(item) {
  const issued = item.issued || item["original-date"];
  const parts = issued && Array.isArray(issued["date-parts"]) ? issued["date-parts"] : [];
  return parts[0] && parts[0][0] ? String(parts[0][0]) : String(item.issued || item.date || "");
}

function getAuthors(item) {
  const authors = Array.isArray(item.author) ? item.author : [];
  return authors
    .map((author) => {
      if (author.literal) {
        return author.literal;
      }
      return [author.given, author.family].filter(Boolean).join(" ");
    })
    .filter(Boolean);
}

function itemToSearchText(item) {
  return normalizeText(
    [
      item.id,
      getTitle(item),
      getAuthors(item).join(" "),
      item["container-title"],
      item.DOI,
      item.URL,
      item.abstract,
      item.note
    ].join(" ")
  );
}

function loadBibliographyFromContent(content) {
  if (!content.trim()) {
    return [];
  }

  const parsed = JSON.parse(content);
  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : [];

  return items
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      raw: item,
      id: item.id || "",
      title: getTitle(item),
      year: getYear(item),
      authors: getAuthors(item),
      doi: item.DOI || item.doi || "",
      url: item.URL || item.url || "",
      venue: item["container-title"] || item.publisher || "",
      searchText: itemToSearchText(item)
    }))
    .filter((item) => item.id);
}

function loadBibliography(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return loadBibliographyFromContent(content);
}

function scoreBibliographyItem(item, query) {
  const terms = normalizeText(query).split(/\s+/).filter((term) => term.length > 2);

  if (!terms.length) {
    return 0;
  }

  let score = 0;
  const titleText = normalizeText(item.title);

  for (const term of terms) {
    if (titleText.includes(term)) {
      score += 5;
    }
    if (item.searchText.includes(term)) {
      score += 1;
    }
  }

  if (normalizeText(item.title) === normalizeText(query)) {
    score += 20;
  }

  return score;
}

function searchBibliography(items, query, limit = 8) {
  return items
    .map((item) => ({ item, score: scoreBibliographyItem(item, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title))
    .slice(0, limit)
    .map((entry) => ({
      source: "Local bibliography",
      alreadyInBibliography: true,
      citekey: entry.item.id,
      score: entry.score,
      ...entry.item
    }));
}

module.exports = {
  getAuthors,
  getTitle,
  getYear,
  loadBibliography,
  loadBibliographyFromContent,
  normalizeText,
  searchBibliography,
  scoreBibliographyItem
};
