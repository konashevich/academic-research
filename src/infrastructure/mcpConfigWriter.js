"use strict";

const fs = require("fs");
const path = require("path");

function buildMcpServerEntries(endpoints) {
  const host = endpoints.host || "127.0.0.1";
  return {
    "zotero-mcp": {
      url: `http://${host}:${endpoints.zoteroPort}/sse`
    },
    "google-scholar": {
      url: `http://${host}:${endpoints.scholarPort}/sse`
    }
  };
}

function mergeMcpConfig(existing, entries) {
  const base = existing && typeof existing === "object" ? existing : {};
  const servers = base.mcpServers && typeof base.mcpServers === "object" ? base.mcpServers : {};
  return {
    ...base,
    mcpServers: {
      ...servers,
      ...entries
    }
  };
}

async function writeWorkspaceMcpConfigs(workspaceRoot, endpoints) {
  if (!workspaceRoot) {
    throw new Error("Open a workspace folder before writing MCP config files.");
  }

  const entries = buildMcpServerEntries(endpoints);
  const targets = [".vscode/mcp.json", ".cursor/mcp.json"];
  const written = [];

  for (const relativePath of targets) {
    const filePath = path.join(workspaceRoot, relativePath);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

    let existing = {};
    if (fs.existsSync(filePath)) {
      try {
        existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch (_error) {
        existing = {};
      }
    }

    const merged = mergeMcpConfig(existing, entries);
    await fs.promises.writeFile(filePath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
    written.push(relativePath);
  }

  return written;
}

module.exports = {
  buildMcpServerEntries,
  mergeMcpConfig,
  writeWorkspaceMcpConfigs
};
