"use strict";

const { ZoteroMcpClient } = require("../zoteroMcpClient");
const { ScholarMcpClient } = require("../scholarMcpClient");
const { searchOpenAlex } = require("../openAlexClient");

async function checkZoteroHealth(endpoints) {
  const client = new ZoteroMcpClient(endpoints);
  try {
    await client.health();
    const results = await client.search("citation", 1);
    return { ok: true, detail: `ready (${results.length} test hit)` };
  } catch (error) {
    return { ok: false, detail: error.message };
  } finally {
    await client.close();
  }
}

async function checkScholarHealth(endpoints) {
  const client = new ScholarMcpClient(endpoints);
  try {
    const results = await client.search("machine learning", 1);
    return { ok: true, detail: `ready (${results.length} test hit)` };
  } catch (error) {
    return { ok: false, detail: error.message };
  } finally {
    await client.close();
  }
}

async function checkOpenAlexHealth(email = "") {
  try {
    const results = await searchOpenAlex("citation", { limit: 1, email });
    return { ok: true, detail: `ready (${results.length} test hit)` };
  } catch (error) {
    return { ok: false, detail: error.message };
  }
}

async function runHealthChecks(endpoints, options = {}) {
  const [zotero, scholar, openAlex] = await Promise.all([
    checkZoteroHealth(endpoints),
    checkScholarHealth(endpoints),
    checkOpenAlexHealth(options.openAlexEmail || "")
  ]);

  return {
    ok: zotero.ok && scholar.ok && openAlex.ok,
    zotero,
    scholar,
    openAlex
  };
}

module.exports = {
  checkOpenAlexHealth,
  checkScholarHealth,
  checkZoteroHealth,
  runHealthChecks
};
