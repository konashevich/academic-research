"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildRankingPayload,
  parseAgentRankingResponse,
  rankCitationResults,
  shouldRunAgentRanking,
  truncateAbstract
} = require("../src/citationAgentRanker");
const { applyAgentRankings } = require("../src/citationResults");

test("buildRankingPayload trims abstracts and assigns stable ids", () => {
  const payload = buildRankingPayload("Blockchain claim", "blockchain query", [
    {
      title: "Chain Paper",
      authors: ["A", "B", "C", "D", "E", "F", "G"],
      abstract: "x".repeat(500),
      source: "OpenAlex"
    }
  ]);

  assert.equal(payload.candidates.length, 1);
  assert.equal(payload.candidates[0].id, "cand-0");
  assert.equal(payload.candidates[0].authors.length, 6);
  assert.ok(payload.candidates[0].abstract.length <= 403);
  assert.equal(truncateAbstract("short"), "short");
});

test("parseAgentRankingResponse accepts direct and fenced JSON", () => {
  const direct = parseAgentRankingResponse(JSON.stringify({
    ok: true,
    rankings: [{ id: "cand-0", score: 90, verdict: "relevant", reason: "Matches claim." }]
  }));
  assert.equal(direct.ok, true);
  assert.equal(direct.rankings.length, 1);

  const fenced = parseAgentRankingResponse('```json\n{"rankings":[{"id":"cand-1","score":20,"verdict":"irrelevant","reason":"Wrong field."}]}\n```');
  assert.equal(fenced.ok, true);
  assert.equal(fenced.rankings[0].id, "cand-1");

  const failed = parseAgentRankingResponse(JSON.stringify({ ok: false, error: "boom" }));
  assert.equal(failed.ok, false);
  assert.match(failed.error, /boom/);

  const malformed = parseAgentRankingResponse("not json");
  assert.equal(malformed.ok, false);
});

test("applyAgentRankings sorts kept results and moves low scores to dropped", () => {
  const results = [
    { title: "Blockchain in education", citekey: "A2024" },
    { title: "Medical imaging review", citekey: "B2024" },
    { title: "Distributed ledgers overview", citekey: "C2024" }
  ];

  const ranked = applyAgentRankings(results, [
    { id: "cand-0", score: 88, verdict: "relevant", reason: "Directly about blockchain." },
    { id: "cand-1", score: 12, verdict: "irrelevant", reason: "Medical topic." },
    { id: "cand-2", score: 72, verdict: "weak", reason: "Related distributed systems." }
  ], 40);

  assert.equal(ranked.results.length, 2);
  assert.equal(ranked.dropped.length, 1);
  assert.equal(ranked.results[0].title, "Blockchain in education");
  assert.equal(ranked.results[0].agentScore, 88);
  assert.equal(ranked.results[1].title, "Distributed ledgers overview");
  assert.equal(ranked.dropped[0].title, "Medical imaging review");
  assert.equal(ranked.results[0].citekey, "A2024");
});

test("applyAgentRankings keeps unranked and bibliography matches in main results", () => {
  const ranked = applyAgentRankings([
    { title: "Local match", alreadyInBibliography: true, citekey: "LOCAL2024" },
    { title: "No agent score" },
    { title: "Explicitly bad", citekey: "BAD2024" }
  ], [
    { id: "cand-0", score: 5, verdict: "irrelevant", reason: "Wrong topic." },
    { id: "cand-2", score: 10, verdict: "irrelevant", reason: "Unrelated." }
  ], 40);

  assert.equal(ranked.results.length, 2);
  assert.equal(ranked.dropped.length, 1);
  assert.equal(ranked.results[0].title, "Local match");
  assert.equal(ranked.results[1].title, "No agent score");
  assert.equal(ranked.results[1].agentVerdict, "unranked");
  assert.equal(ranked.dropped[0].title, "Explicitly bad");
});

test("shouldRunAgentRanking requires enabled state, key, and candidates", () => {
  assert.equal(shouldRunAgentRanking({ enabled: true, apiKey: "cursor_x", resultCount: 3 }), true);
  assert.equal(shouldRunAgentRanking({ enabled: false, apiKey: "cursor_x", resultCount: 3 }), false);
  assert.equal(shouldRunAgentRanking({ enabled: true, apiKey: "", resultCount: 3 }), false);
  assert.equal(shouldRunAgentRanking({ enabled: true, apiKey: "cursor_x", resultCount: 0 }), false);
});

test("rankCitationResults marks expected skips and preserves originals on runner failure", async () => {
  const results = [{ title: "One" }, { title: "Two" }];
  const logs = [];

  const skipped = await rankCitationResults({
    claim: "claim",
    queryText: "query",
    results,
    enabled: false
  });
  assert.equal(skipped.status.skipped, true);
  assert.equal(skipped.results.length, 2);

  const failed = await rankCitationResults({
    claim: "claim",
    queryText: "query",
    results,
    apiKey: "cursor_test",
    enabled: true,
    onLog: (message) => logs.push(message),
    runner: async () => {
      throw new Error("agent ranking timed out");
    }
  });

  assert.equal(failed.ok, false);
  assert.equal(failed.status.skipped, false);
  assert.equal(failed.results.length, 2);
  assert.match(logs.join("\n"), /timed out/);
});

test("rankCitationResults applies runner rankings through the orchestration layer", async () => {
  const ranked = await rankCitationResults({
    claim: "blockchain",
    queryText: "blockchain",
    results: [
      { title: "Good" },
      { title: "Bad" }
    ],
    apiKey: "cursor_test",
    enabled: true,
    runner: async () => ({
      stdout: JSON.stringify({
        ok: true,
        rankings: [
          { id: "cand-0", score: 90, verdict: "relevant", reason: "Matches." },
          { id: "cand-1", score: 5, verdict: "irrelevant", reason: "Wrong field." }
        ]
      }),
      stderr: "",
      code: 0
    })
  });

  assert.equal(ranked.ok, true);
  assert.equal(ranked.results.length, 1);
  assert.equal(ranked.dropped.length, 1);
  assert.equal(ranked.results[0].title, "Good");
});
