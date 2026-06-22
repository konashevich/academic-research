"use strict";

const path = require("path");

function getScholarVendorDir(extensionPath) {
  return path.join(extensionPath, "vendor", "google-scholar-mcp");
}

const DEFAULT_ZOTERO_PORT = 8000;

function buildZoteroCommand() {
  return {
    command: "uvx",
    args: ["zotero-mcp", "--transport", "sse"],
    env: {
      MCP_HOST: "127.0.0.1"
    }
  };
}

function buildScholarCommand(extensionPath, port) {
  const vendorDir = getScholarVendorDir(extensionPath);
  return {
    command: "uv",
    args: [
      "run",
      "--directory",
      vendorDir,
      "uvicorn",
      "asgi:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--no-access-log"
    ],
    cwd: vendorDir,
    env: {}
  };
}

async function waitForPort(host, port, timeoutMs = 30000) {
  const net = require("net");
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const reachable = await new Promise((resolve) => {
      const socket = net.createConnection({ host, port }, () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
      socket.setTimeout(1000, () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (reachable) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return false;
}

module.exports = {
  DEFAULT_ZOTERO_PORT,
  buildScholarCommand,
  buildZoteroCommand,
  getScholarVendorDir,
  waitForPort
};
