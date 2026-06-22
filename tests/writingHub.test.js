"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createHubViewModel,
  nextStep,
  previousStep,
  stepIndex,
  HUB_STEPS
} = require("../src/writingHub/writingHubState");
const { renderWritingHubHtml } = require("../src/writingHub/writingHubHtml");
const {
  buildMcpServerEntries,
  mergeMcpConfig
} = require("../src/infrastructure/mcpConfigWriter");

test("hub steps cover welcome, infrastructure, project, and deploy", () => {
  assert.deepEqual(HUB_STEPS, ["welcome", "infrastructure", "project", "deploy"]);
  assert.equal(stepIndex("deploy"), 3);
});

test("writing hub infrastructure step renders AI chat connect action when setup is complete", () => {
  const view = createHubViewModel({
    step: "infrastructure",
    infra: {
      setupComplete: true,
      prerequisites: { checks: [] },
      health: {
        zotero: { ok: true, detail: "ready" },
        scholar: { ok: true, detail: "ready" },
        openAlex: { ok: true, detail: "ready" }
      },
      infraStatus: "ready"
    }
  });
  const html = renderWritingHubHtml({ nonce: "nonce", view });
  assert.match(html, /Connect to AI chat/);
  assert.match(html, /Detect library ID/);
});

test("project step renders deploy form fields and advanced toggles", () => {
  const view = createHubViewModel({
    step: "project",
    project: {
      title: "My Paper",
      authorName: "Author",
      target: "lncs"
    },
    profiles: [{ id: "lncs", label: "LNCS", bundled: true }],
    components: { manuscript: true, gitInit: false }
  });
  const html = renderWritingHubHtml({ nonce: "nonce", view });
  assert.match(html, /Project setup/);
  assert.match(html, /Research context/);
  assert.match(html, /Deploy project|Review &amp; deploy/);
});

test("deploy step renders summary and deploy button", () => {
  const view = createHubViewModel({
    step: "deploy",
    project: { target: "lncs" },
    deploy: {
      plan: {
        files: [{ path: "paper.md", action: "create" }],
        conflicts: []
      },
      infra: { endpointsLabel: "127.0.0.1:9180" }
    },
    infra: { endpointsLabel: "127.0.0.1:9180" }
  });
  const html = renderWritingHubHtml({ nonce: "nonce", view });
  assert.match(html, /Deploy project/);
  assert.match(html, /Target:/);
});

test("mcp config writer merges server entries without dropping existing servers", () => {
  const merged = mergeMcpConfig(
    {
      mcpServers: {
        "existing-server": { url: "http://127.0.0.1:1/sse" }
      }
    },
    buildMcpServerEntries({ host: "127.0.0.1", zoteroPort: 8000, scholarPort: 4101 })
  );

  assert.equal(merged.mcpServers["existing-server"].url, "http://127.0.0.1:1/sse");
  assert.equal(merged.mcpServers["zotero-mcp"].url, "http://127.0.0.1:8000/sse");
  assert.equal(merged.mcpServers["google-scholar"].url, "http://127.0.0.1:4101/sse");
});

test("deploy step shows note when infrastructure is not ready", () => {
  const view = createHubViewModel({
    step: "deploy",
    project: { target: "lncs" },
    deploy: {
      plan: { create: [], conflicts: [] }
    },
    infra: { setupComplete: false, endpointsLabel: "not configured" }
  });
  const html = renderWritingHubHtml({ nonce: "nonce", view });
  assert.match(html, /Zotero is not connected yet/);
  assert.match(html, /default ports/);
});

test("welcome and infrastructure steps offer scaffold without zotero", () => {
  const welcomeHtml = renderWritingHubHtml({
    nonce: "nonce",
    view: createHubViewModel({ step: "welcome" })
  });
  assert.match(welcomeHtml, /Set up paper project only/);

  const infraHtml = renderWritingHubHtml({
    nonce: "nonce",
    view: createHubViewModel({
      step: "infrastructure",
      infra: { setupComplete: false, prerequisites: { checks: [] } }
    })
  });
  assert.match(infraHtml, /Set up paper project without Zotero/);
});

test("hub navigation walks project and deploy steps", () => {
  assert.equal(nextStep("infrastructure"), "project");
  assert.equal(nextStep("project"), "deploy");
  assert.equal(previousStep("deploy"), "project");
});
