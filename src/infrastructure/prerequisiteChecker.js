"use strict";

const childProcess = require("child_process");

function runCommand(command, args, timeoutMs = 8000) {
  return new Promise((resolve) => {
    childProcess.execFile(command, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, detail: (stderr || error.message || "").trim() });
        return;
      }
      resolve({ ok: true, detail: String(stdout || "").trim().split("\n")[0] });
    });
  });
}

async function checkPython() {
  const python = await runCommand("python3", ["--version"]);
  return {
    id: "python",
    label: "Python 3",
    ok: python.ok,
    detail: python.ok ? python.detail : "python3 not found",
    installHint: "Install Python 3.11+ from https://www.python.org/downloads/"
  };
}

async function checkUv() {
  const uv = await runCommand("uv", ["--version"]);
  if (uv.ok) {
    return {
      id: "uv",
      label: "uv package manager",
      ok: true,
      detail: uv.detail,
      installHint: ""
    };
  }

  const uvx = await runCommand("uvx", ["--version"]);
  return {
    id: "uv",
    label: "uv package manager",
    ok: uvx.ok,
    detail: uvx.ok ? uvx.detail : "uv/uvx not found",
    installHint: "curl -LsSf https://astral.sh/uv/install.sh | sh"
  };
}

async function checkPrerequisites() {
  const checks = await Promise.all([checkPython(), checkUv()]);
  return {
    ok: checks.every((item) => item.ok),
    checks
  };
}

module.exports = {
  checkPrerequisites,
  checkPython,
  checkUv,
  runCommand
};
