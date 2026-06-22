"use strict";

const { escapeHtml } = require("../citationSearchPanel");

const ZOTERO_KEYS_URL = "https://www.zotero.org/settings/keys/new";

function renderZoteroSetupGuide() {
  return `
    <details class="setup-guide" open>
      <summary>How to connect Zotero</summary>
      <div class="setup-guide-body">
        <p>Your library stays on <strong>zotero.org</strong>. This extension only needs an API key to search it and add citations while you write.</p>
        <ol class="setup-steps">
          <li>
            <a href="${ZOTERO_KEYS_URL}">Create an API key</a> on Zotero.
            Log in, allow <strong>Read/Write</strong> for your personal library, and copy the key (about 24 characters — shown once).
          </li>
          <li>Paste the key into <strong>API key</strong> below.</li>
          <li>Click <strong>Detect library ID</strong>, or copy the number from your profile URL (<code>zotero.org/users/12345</code> → ID is <code>12345</code>).</li>
          <li>Click <strong>Install &amp; verify</strong>. The key is stored in your editor’s secure storage (not in project files). Local search services start on your machine.</li>
          <li>When verification shows green checks, click <strong>Continue</strong>.</li>
        </ol>
        <p class="muted setup-note">
          <strong>Connect to AI chat</strong> is optional — only if you want Cursor/VS Code chat to use the same Zotero connection.
          Citation search in the editor works without it.
        </p>
      </div>
    </details>`;
}

module.exports = {
  ZOTERO_KEYS_URL,
  renderZoteroSetupGuide
};
