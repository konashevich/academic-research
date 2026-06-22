import { Agent } from "@cursor/sdk";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function buildPrompt({ claim, queryText, candidates }) {
  return `You are ranking academic citation candidates for relevance to a manuscript claim.

CLAIM:
${claim}

SEARCH QUERY (cleaned):
${queryText}

CANDIDATES (JSON):
${JSON.stringify(candidates, null, 2)}

For each candidate id, assess whether the source supports or relates to the CLAIM (not just keyword overlap). Penalize sources from unrelated fields.

Return ONLY a JSON object with this exact shape (no markdown, no extra text):
{
  "rankings": [
    { "id": "<candidate id>", "score": <0-100>, "verdict": "relevant"|"weak"|"irrelevant", "reason": "<one short sentence>" }
  ]
}

Include one entry per candidate id. Score 80+ = clearly relevant, 50-79 = weak/partial, below 50 = irrelevant or wrong field.`;
}

function extractRankings(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    throw new Error("empty agent response");
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.rankings)) {
      return parsed.rankings;
    }
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_error) {}

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    const parsed = JSON.parse(fenced[1].trim());
    if (Array.isArray(parsed.rankings)) {
      return parsed.rankings;
    }
  }

  const objectMatch = raw.match(/\{[\s\S]*"rankings"[\s\S]*\}/);
  if (objectMatch) {
    const parsed = JSON.parse(objectMatch[0]);
    if (Array.isArray(parsed.rankings)) {
      return parsed.rankings;
    }
  }

  throw new Error("could not parse rankings JSON from agent response");
}

async function main() {
  try {
    const payload = JSON.parse(await readStdin());
    const {
      apiKey,
      model = "composer-2.5",
      projectRoot,
      claim,
      queryText,
      candidates
    } = payload;

    if (!apiKey) {
      process.stdout.write(JSON.stringify({ ok: false, error: "missing API key" }));
      process.exit(1);
      return;
    }

    const result = await Agent.prompt(buildPrompt({ claim, queryText, candidates }), {
      apiKey,
      model: { id: model },
      local: {
        cwd: projectRoot || process.cwd(),
        settingSources: []
      }
    });

    if (result.status === "error") {
      process.stdout.write(JSON.stringify({ ok: false, error: `agent run failed: ${result.id}` }));
      process.exit(2);
      return;
    }

    const text = typeof result.result === "string" ? result.result : JSON.stringify(result.result);
    const rankings = extractRankings(text);
    process.stdout.write(JSON.stringify({ ok: true, rankings }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error.message || String(error) }));
    process.exit(1);
  }
}

main();
