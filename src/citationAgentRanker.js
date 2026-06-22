"use strict";

const path = require("path");
const { spawn } = require("child_process");
const { applyAgentRankings } = require("./citationResults");

const RANK_SCRIPT = path.join(__dirname, "..", "tools", "rank-citations.mjs");
const MIN_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 13;
const KILL_GRACE_MS = 2000;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateAbstract(value, maxLength = 400) {
  const text = cleanText(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function buildRankingPayload(claim, queryText, results) {
  const candidates = (results || []).map((result, index) => {
    const id = `cand-${index}`;
    return {
      id,
      title: cleanText(result.title),
      authors: Array.isArray(result.authors) ? result.authors.slice(0, 6) : [],
      year: cleanText(result.year),
      venue: cleanText(result.venue),
      abstract: truncateAbstract(result.abstract),
      doi: cleanText(result.doi),
      source: cleanText(result.source)
    };
  });

  return {
    claim: cleanText(claim),
    queryText: cleanText(queryText),
    candidates
  };
}

function parseAgentRankingResponse(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return { ok: false, error: "empty response" };
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed.ok === false) {
      return { ok: false, error: parsed.error || "agent runner failed" };
    }
    if (Array.isArray(parsed.rankings)) {
      return { ok: true, rankings: parsed.rankings };
    }
  } catch (_error) {}

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1].trim());
      if (Array.isArray(parsed.rankings)) {
        return { ok: true, rankings: parsed.rankings };
      }
    } catch (_error) {}
  }

  const objectMatch = raw.match(/\{[\s\S]*"rankings"[\s\S]*\}/);
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0]);
      if (Array.isArray(parsed.rankings)) {
        return { ok: true, rankings: parsed.rankings };
      }
    } catch (_error) {}
  }

  return { ok: false, error: "could not parse agent rankings" };
}

function checkSdkNodeVersion() {
  const match = /^v(\d+)\.(\d+)/.exec(process.version);
  if (!match) {
    return { ok: false, detail: `unsupported Node ${process.version}` };
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major < MIN_NODE_MAJOR || (major === MIN_NODE_MAJOR && minor < MIN_NODE_MINOR)) {
    return {
      ok: false,
      detail: `Node ${process.version} is too old for Cursor SDK (need >= 22.13)`
    };
  }

  return { ok: true };
}

function shouldRunAgentRanking({ enabled, apiKey, resultCount }) {
  return Boolean(enabled && apiKey && resultCount > 0);
}

function skippedResult(original, detail) {
  return {
    ok: false,
    results: original,
    dropped: [],
    status: { ok: false, skipped: true, detail }
  };
}

function runRankingScript(payload, { extensionPath, timeoutMs }) {
  const scriptPath = path.join(extensionPath, "tools", "rank-citations.mjs");

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: payload.projectRoot || extensionPath,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let killTimer = null;

    const finish = (error, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (killTimer) {
        clearTimeout(killTimer);
      }
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, KILL_GRACE_MS);
      finish(new Error("agent ranking timed out"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      finish(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      if (code !== 0 && !stdout.trim()) {
        finish(new Error(stderr.trim() || `agent runner exited with code ${code}`));
        return;
      }
      finish(null, { stdout, stderr, code });
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function rankCitationResults({
  claim,
  queryText,
  results,
  projectRoot,
  extensionPath,
  apiKey,
  model,
  minScore,
  timeoutMs,
  enabled = true,
  onLog,
  runner = runRankingScript
}) {
  const original = Array.isArray(results) ? [...results] : [];
  const log = typeof onLog === "function" ? onLog : () => {};

  if (!enabled) {
    return skippedResult(original, "disabled");
  }

  if (!apiKey) {
    return skippedResult(original, "no API key");
  }

  if (!original.length) {
    return skippedResult(original, "no candidates");
  }

  const nodeCheck = checkSdkNodeVersion();
  if (!nodeCheck.ok) {
    log(nodeCheck.detail);
    return {
      ok: false,
      results: original,
      dropped: [],
      status: { ok: false, skipped: false, detail: nodeCheck.detail }
    };
  }

  const payload = buildRankingPayload(claim, queryText, original);

  try {
    const run = await runner(
      {
        ...payload,
        apiKey,
        model,
        projectRoot
      },
      {
        extensionPath: extensionPath || path.dirname(RANK_SCRIPT),
        timeoutMs: timeoutMs || 60000
      }
    );

    log(`runner exit code=${run.code ?? "unknown"}`);
    if (run.stderr?.trim()) {
      log(`runner stderr: ${run.stderr.trim()}`);
    }

    const parsed = parseAgentRankingResponse(run.stdout);
    if (!parsed.ok) {
      log(parsed.error || "parse failed");
      return {
        ok: false,
        results: original,
        dropped: [],
        status: { ok: false, skipped: false, detail: parsed.error || "parse failed" }
      };
    }

    const ranked = applyAgentRankings(original, parsed.rankings, minScore);
    log(`kept ${ranked.results.length}, dropped ${ranked.dropped.length}`);
    return {
      ok: true,
      results: ranked.results,
      dropped: ranked.dropped,
      status: {
        ok: true,
        skipped: false,
        detail: `kept ${ranked.results.length}, dropped ${ranked.dropped.length}`
      }
    };
  } catch (error) {
    log(error.message || "agent failed");
    return {
      ok: false,
      results: original,
      dropped: [],
      status: { ok: false, skipped: false, detail: error.message || "agent failed" }
    };
  }
}

module.exports = {
  buildRankingPayload,
  checkSdkNodeVersion,
  parseAgentRankingResponse,
  rankCitationResults,
  runRankingScript,
  shouldRunAgentRanking,
  truncateAbstract
};
