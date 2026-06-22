"use strict";

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function canonicalDoi(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/[).,;:\s]+$/g, "")
    .toLowerCase();
}

function canonicalUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, "");
  } catch (_error) {
    return raw.replace(/[).,;\s]+$/g, "");
  }
}

function normalizeAuthors(authors) {
  if (!Array.isArray(authors)) {
    return [];
  }
  return authors
    .flatMap((author) => String(author || "").split(/\s+(?:and|&)\s+/i))
    .map(cleanText)
    .filter(Boolean);
}

function resultFingerprint(result) {
  const doi = canonicalDoi(result.doi || result.DOI);
  if (doi) {
    return `doi:${doi}`;
  }

  const url = canonicalUrl(result.url || result.URL);
  if (url) {
    return `url:${url.toLowerCase()}`;
  }

  const title = normalizeText(result.title);
  const year = cleanText(result.year);
  return title ? `title:${title}|${year}` : "";
}

function assessMetadataQuality(result) {
  const reasons = [];
  const title = cleanText(result.title);
  const doi = canonicalDoi(result.doi);
  const url = canonicalUrl(result.url);

  if (!title || title.length < 8) {
    reasons.push("missing title");
  }
  if (!doi && !url) {
    reasons.push("missing DOI or durable URL");
  }
  if (title && /^(untitled|unknown|\[citation)/i.test(title)) {
    reasons.push("weak title");
  }

  return {
    canImport: reasons.length === 0,
    reasons
  };
}

function normalizeCitationResult(result) {
  const normalized = {
    ...result,
    source: cleanText(result.source) || "Unknown",
    id: cleanText(result.id),
    title: cleanText(result.title),
    year: cleanText(result.year),
    venue: cleanText(result.venue),
    doi: canonicalDoi(result.doi || result.DOI),
    url: canonicalUrl(result.url || result.URL),
    abstract: cleanText(result.abstract),
    authors: normalizeAuthors(result.authors),
    citekey: cleanText(result.citekey),
    alreadyInBibliography: Boolean(result.alreadyInBibliography),
    alreadyInZotero: Boolean(result.alreadyInZotero),
    openAccess: Boolean(result.openAccess)
  };
  normalized.fingerprint = resultFingerprint(normalized);
  normalized.metadataQuality = assessMetadataQuality(normalized);
  normalized.canImport = normalized.metadataQuality.canImport;
  normalized.providers = Array.isArray(result.providers) && result.providers.length
    ? result.providers.map(cleanText).filter(Boolean)
    : [normalized.source].filter(Boolean);
  return normalized;
}

function findBibliographyMatch(result, bibliography) {
  const normalized = normalizeCitationResult(result);
  const resultDoi = canonicalDoi(normalized.doi);
  const resultUrl = canonicalUrl(normalized.url).toLowerCase();
  const resultTitle = normalizeText(normalized.title);
  const resultYear = cleanText(normalized.year);

  for (const item of bibliography || []) {
    const itemDoi = canonicalDoi(item.doi);
    if (resultDoi && itemDoi && resultDoi === itemDoi) {
      return item;
    }

    const itemUrl = canonicalUrl(item.url).toLowerCase();
    if (resultUrl && itemUrl && resultUrl === itemUrl) {
      return item;
    }

    const itemTitle = normalizeText(item.title);
    const itemYear = cleanText(item.year);
    if (resultTitle && itemTitle && resultTitle === itemTitle && (!resultYear || !itemYear || resultYear === itemYear)) {
      return item;
    }
  }

  return null;
}

function preferValue(current, next, field) {
  if (!current) {
    return next || "";
  }
  if (field === "abstract" && next && next.length > current.length) {
    return next;
  }
  return current;
}

function mergeResult(base, next) {
  const merged = { ...base };
  const providers = new Set([...(base.providers || [base.source]), ...(next.providers || [next.source])].filter(Boolean));

  merged.source = [...providers].join(", ");
  merged.providers = [...providers];
  merged.title = preferValue(base.title, next.title, "title");
  merged.year = preferValue(base.year, next.year, "year");
  merged.venue = preferValue(base.venue, next.venue, "venue");
  merged.doi = preferValue(base.doi, next.doi, "doi");
  merged.url = preferValue(base.url, next.url, "url");
  merged.abstract = preferValue(base.abstract, next.abstract, "abstract");
  merged.authors = base.authors && base.authors.length ? base.authors : next.authors;
  merged.citationCount = Math.max(Number(base.citationCount) || 0, Number(next.citationCount) || 0);
  merged.openAccess = Boolean(base.openAccess || next.openAccess);
  merged.alreadyInBibliography = Boolean(base.alreadyInBibliography || next.alreadyInBibliography);
  merged.alreadyInZotero = Boolean(base.alreadyInZotero || next.alreadyInZotero);
  merged.citekey = base.alreadyInBibliography && base.citekey ? base.citekey : (next.citekey || base.citekey);
  merged.fingerprint = resultFingerprint(merged);
  merged.metadataQuality = assessMetadataQuality(merged);
  merged.canImport = merged.metadataQuality.canImport;
  return merged;
}

function mergeCitationResults(results, bibliography = []) {
  const byFingerprint = new Map();
  const merged = [];

  for (const rawResult of results || []) {
    let result = normalizeCitationResult(rawResult);
    const bibliographyMatch = result.alreadyInBibliography ? null : findBibliographyMatch(result, bibliography);
    if (bibliographyMatch) {
      result = normalizeCitationResult({
        ...result,
        alreadyInBibliography: true,
        citekey: bibliographyMatch.id,
        providers: ["Local bibliography", ...(result.providers || [result.source])]
      });
    }

    const key = result.fingerprint || `index:${merged.length}`;
    if (byFingerprint.has(key)) {
      const index = byFingerprint.get(key);
      merged[index] = mergeResult(merged[index], result);
    } else {
      byFingerprint.set(key, merged.length);
      merged.push(result);
    }
  }

  return merged;
}

function isValidCitekey(value) {
  return /^[A-Za-z0-9_.:-]+$/.test(String(value || ""));
}

function isProtectedFromAgentDrop(result) {
  return Boolean(result.alreadyInBibliography || result.alreadyInZotero);
}

function applyAgentRankings(results, rankings, minScore = 40) {
  const rankingById = new Map();
  for (const ranking of rankings || []) {
    if (ranking && ranking.id !== undefined && ranking.id !== null) {
      rankingById.set(String(ranking.id), ranking);
    }
  }

  const annotated = (results || []).map((result, index) => {
    const id = `cand-${index}`;
    const ranking = rankingById.get(id) || null;
    const hasRanking = Boolean(ranking);
    const score = Number(ranking?.score);
    return {
      ...result,
      _rankingId: id,
      agentRanked: hasRanking,
      agentScore: Number.isFinite(score) ? score : undefined,
      agentVerdict: hasRanking ? (cleanText(ranking?.verdict) || "weak") : "unranked",
      agentReason: cleanText(ranking?.reason)
    };
  });

  const kept = [];
  const dropped = [];

  for (const item of annotated) {
    if (isProtectedFromAgentDrop(item)) {
      kept.push(item);
      continue;
    }

    if (!item.agentRanked) {
      kept.push(item);
      continue;
    }

    const belowThreshold = item.agentScore < minScore || item.agentVerdict === "irrelevant";
    if (belowThreshold) {
      dropped.push(item);
    } else {
      kept.push(item);
    }
  }

  const verdictOrder = { relevant: 0, weak: 1, unranked: 2, irrelevant: 3 };
  const sortRanked = (left, right) => {
    const leftScore = Number.isFinite(left.agentScore) ? left.agentScore : -1;
    const rightScore = Number.isFinite(right.agentScore) ? right.agentScore : -1;
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }
    return (verdictOrder[left.agentVerdict] ?? 9) - (verdictOrder[right.agentVerdict] ?? 9);
  };

  kept.sort(sortRanked);
  dropped.sort(sortRanked);

  return { results: kept, dropped };
}

module.exports = {
  applyAgentRankings,
  assessMetadataQuality,
  canonicalDoi,
  canonicalUrl,
  cleanText,
  findBibliographyMatch,
  isProtectedFromAgentDrop,
  isValidCitekey,
  mergeCitationResults,
  normalizeCitationResult,
  normalizeText,
  resultFingerprint
};
