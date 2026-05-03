"use strict";

function invertOpenAlexAbstract(index) {
  if (!index || typeof index !== "object") {
    return "";
  }

  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) {
      continue;
    }
    for (const position of positions) {
      words[position] = word;
    }
  }

  return words.filter(Boolean).join(" ");
}

function formatAuthors(authorships) {
  if (!Array.isArray(authorships)) {
    return [];
  }

  return authorships
    .map((authorship) => authorship && authorship.author && authorship.author.display_name)
    .filter(Boolean);
}

async function searchOpenAlex(query, options = {}) {
  const limit = options.limit || 8;
  const params = new URLSearchParams({
    search: query,
    filter: "has_abstract:true",
    per_page: String(limit)
  });

  if (options.email) {
    params.set("mailto", options.email);
  }

  const response = await fetch(`https://api.openalex.org/works?${params.toString()}`, {
    headers: {
      "User-Agent": "academic-research-vscode-extension"
    }
  });

  if (!response.ok) {
    throw new Error(`OpenAlex search failed: ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
  const results = Array.isArray(body.results) ? body.results : [];

  return results.map((work) => ({
    source: "OpenAlex",
    alreadyInBibliography: false,
    citekey: "",
    id: work.id || "",
    title: work.display_name || "",
    year: work.publication_year ? String(work.publication_year) : "",
    authors: formatAuthors(work.authorships),
    doi: work.doi ? work.doi.replace(/^https:\/\/doi.org\//, "") : "",
    url: work.primary_location && work.primary_location.landing_page_url ? work.primary_location.landing_page_url : work.id || "",
    venue:
      work.primary_location &&
      work.primary_location.source &&
      work.primary_location.source.display_name
        ? work.primary_location.source.display_name
        : "",
    abstract: invertOpenAlexAbstract(work.abstract_inverted_index),
    citationCount: work.cited_by_count || 0,
    openAccess: Boolean(work.open_access && work.open_access.is_oa)
  }));
}

module.exports = {
  invertOpenAlexAbstract,
  searchOpenAlex
};
