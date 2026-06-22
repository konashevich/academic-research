"use strict";

const { writeWorkspaceMcpConfigs } = require("../infrastructure/mcpConfigWriter");

async function writeScaffoldMcpConfig(workspaceRoot, endpoints) {
  return writeWorkspaceMcpConfigs(workspaceRoot, {
    host: endpoints.host || "127.0.0.1",
    zoteroPort: endpoints.zoteroPort,
    scholarPort: endpoints.scholarPort
  });
}

module.exports = {
  writeScaffoldMcpConfig
};
