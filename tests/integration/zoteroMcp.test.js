"use strict";

const assert = require("node:assert/strict");
const http = require("http");
const test = require("node:test");
const { ZoteroMcpClient } = require("../../src/zoteroMcpClient");

function zoteroReachable(host, port) {
  return new Promise((resolve) => {
    const request = http.get(`http://${host}:${port}/sse`, (response) => {
      response.resume();
      resolve(response.statusCode !== undefined && response.statusCode < 500);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(2500, () => {
      request.destroy();
      resolve(false);
    });
  });
}

test("live Zotero MCP resolves configured citekeys", async (t) => {
  if (process.env.ACADEMIC_RESEARCH_LIVE_ZOTERO !== "1") {
    t.skip("Set ACADEMIC_RESEARCH_LIVE_ZOTERO=1 to run live Zotero MCP tests.");
    return;
  }

  const host = process.env.ACADEMIC_RESEARCH_ZOTERO_HOST || "127.0.0.1";
  const port = Number(process.env.ACADEMIC_RESEARCH_ZOTERO_PORT || 9180);
  if (!(await zoteroReachable(host, port))) {
    t.skip(`Zotero MCP is not reachable at http://${host}:${port}.`);
    return;
  }

  const citekeys = String(process.env.ACADEMIC_RESEARCH_TEST_CITEKEYS || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  if (!citekeys.length) {
    t.skip("Set ACADEMIC_RESEARCH_TEST_CITEKEYS=key1,key2 for the live resolve test.");
    return;
  }

  const zotero = new ZoteroMcpClient({ host, zoteroPort: port });
  try {
    await zotero.health();
    assert.equal(await zotero.hasTool("zotero_resolve_citekeys"), true);

    const exportResult = await zotero.exportBibliographyForCitekeys(citekeys);
    assert.equal(
      exportResult.unresolved.length,
      0,
      `Unresolved citekeys: ${exportResult.unresolved.join(", ")}`
    );
    assert.ok(exportResult.count > 0);
  } finally {
    await zotero.close();
  }
});
