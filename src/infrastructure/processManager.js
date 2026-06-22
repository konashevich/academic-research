"use strict";

const childProcess = require("child_process");

class ProcessManager {
  constructor(logFn) {
    this.logFn = logFn || (() => {});
    this.processes = new Map();
  }

  log(message) {
    this.logFn(message);
  }

  start(name, command, args, options = {}) {
    this.stop(name);

    const child = childProcess.spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });

    child.stdout.on("data", (chunk) => {
      this.log(`[${name}] ${String(chunk).trimEnd()}`);
    });
    child.stderr.on("data", (chunk) => {
      this.log(`[${name}] ${String(chunk).trimEnd()}`);
    });
    child.on("exit", (code, signal) => {
      if (this.processes.get(name) === child) {
        this.processes.delete(name);
      }
      this.log(`[${name}] exited code=${code ?? "null"} signal=${signal || "none"}`);
    });

    this.processes.set(name, child);
    return child;
  }

  stop(name) {
    const child = this.processes.get(name);
    if (!child) {
      return;
    }
    this.processes.delete(name);
    try {
      child.kill("SIGTERM");
    } catch (_error) {}
  }

  stopAll() {
    for (const name of [...this.processes.keys()]) {
      this.stop(name);
    }
  }

  isRunning(name) {
    const child = this.processes.get(name);
    return Boolean(child && child.exitCode === null && !child.killed);
  }
}

module.exports = {
  ProcessManager
};
