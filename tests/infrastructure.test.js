"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { getFreePort } = require("../src/infrastructure/getFreePort");
const { checkPrerequisites } = require("../src/infrastructure/prerequisiteChecker");
const { CredentialStore } = require("../src/infrastructure/credentialStore");
const {
  createHubViewModel,
  nextStep,
  previousStep,
  stepIndex
} = require("../src/writingHub/writingHubState");
const { renderWritingHubHtml } = require("../src/writingHub/writingHubHtml");
const { makeZoteroBaseUrl } = require("../src/zoteroMcpClient");
const { makeScholarBaseUrl } = require("../src/scholarMcpClient");

test("getFreePort returns a positive port", async () => {
  const port = await getFreePort("127.0.0.1");
  assert.ok(port > 0);
});

test("hub step navigation moves forward and back", () => {
  assert.equal(stepIndex("welcome"), 0);
  assert.equal(nextStep("welcome"), "infrastructure");
  assert.equal(previousStep("infrastructure"), "welcome");
});

test("writing hub html includes infrastructure form", () => {
  const view = createHubViewModel({
    step: "infrastructure",
    credentials: { apiKey: "", libraryId: "14105076" },
    infra: {
      prerequisites: {
        checks: [{ label: "Python 3", ok: true, detail: "Python 3.12.0" }]
      },
      infraStatus: "setup needed"
    }
  });
  const html = renderWritingHubHtml({ nonce: "nonce123", view });
  assert.match(html, /Install &amp; verify/);
  assert.match(html, /libraryId/);
  assert.match(html, /Academic Writing Hub/);
});

test("endpoint helpers accept infrastructure endpoint objects", () => {
  const endpoints = { host: "127.0.0.1", zoteroPort: 8001, scholarPort: 4100 };
  assert.equal(makeZoteroBaseUrl(endpoints), "http://127.0.0.1:8001");
  assert.equal(makeScholarBaseUrl(endpoints), "http://127.0.0.1:4100");
});

test("credential store tracks library id in memory", async () => {
  const secrets = new Map();
  const context = {
    secrets: {
      get: async (key) => secrets.get(key),
      store: async (key, value) => secrets.set(key, value),
      delete: async (key) => secrets.delete(key)
    },
    globalState: {
      values: new Map(),
      get(key, fallback) {
        return this.values.has(key) ? this.values.get(key) : fallback;
      },
      async update(key, value) {
        this.values.set(key, value);
      }
    }
  };
  const store = new CredentialStore(context);
  await store.setZoteroApiKey("abc123");
  await store.setZoteroLibraryId("99");
  assert.equal(await store.getZoteroApiKey(), "abc123");
  assert.equal(store.getZoteroLibraryId(), "99");
  assert.equal(await store.hasZoteroCredentials(), true);
});

test("checkPrerequisites returns structured checks", async () => {
  const result = await checkPrerequisites();
  assert.ok(Array.isArray(result.checks));
  assert.equal(typeof result.ok, "boolean");
});
