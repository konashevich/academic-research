"use strict";

const http = require("http");
const https = require("https");

function splitSseEvent(buffer) {
  const match = buffer.match(/\r?\n\r?\n/);
  if (!match) {
    return null;
  }

  return {
    raw: buffer.slice(0, match.index),
    rest: buffer.slice(match.index + match[0].length)
  };
}

function parseSseEvents(buffer) {
  const events = [];
  let split;

  while ((split = splitSseEvent(buffer))) {
    buffer = split.rest;
    const data = split.raw
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s?/, ""))
      .join("\n");

    if (data) {
      events.push(data);
    }
  }

  return { events, buffer };
}

class McpSseClient {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl.replace(/\/sse$/, "");
    this.clientName = options.clientName || "academic-research-vscode";
    this.clientVersion = options.clientVersion || "0.1.0";
    this.requestId = 1;
    this.buffer = "";
    this.connected = false;
  }

  async connect() {
    if (this.connected) {
      return;
    }

    await this.openSseStream();
    const endpoint = await this.readEndpoint();
    this.endpoint = new URL(endpoint, this.baseUrl).toString();

    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: this.clientName,
        version: this.clientVersion
      }
    });
    await this.notify("notifications/initialized", {});
    this.connected = true;
  }

  async close() {
    if (this.sseRequest) {
      this.sseRequest.destroy();
    }
    if (this.sseResponse) {
      this.sseResponse.destroy();
    }
    this.connected = false;
  }

  openSseStream() {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}/sse`);
      const transport = url.protocol === "https:" ? https : http;
      const request = transport.get(url, {
        headers: {
          accept: "text/event-stream"
        }
      });

      this.sseRequest = request;
      this.chunkQueue = [];
      this.chunkWaiters = [];
      this.streamEnded = false;

      request.on("response", (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`MCP SSE connection failed: ${response.statusCode}`));
          response.resume();
          return;
        }

        this.sseResponse = response;
        response.setEncoding("utf8");
        response.on("data", (chunk) => this.pushChunk(chunk));
        response.on("end", () => this.endStream());
        response.on("error", (error) => this.endStream(error));
        resolve();
      });
      request.on("error", reject);
    });
  }

  pushChunk(chunk) {
    const waiter = this.chunkWaiters.shift();
    if (waiter) {
      waiter.resolve(chunk);
      return;
    }
    this.chunkQueue.push(chunk);
  }

  endStream(error) {
    this.streamEnded = true;
    while (this.chunkWaiters.length) {
      const waiter = this.chunkWaiters.shift();
      if (error) {
        waiter.reject(error);
      } else {
        waiter.resolve(null);
      }
    }
  }

  readChunk(timeoutMs) {
    if (this.chunkQueue.length) {
      return Promise.resolve(this.chunkQueue.shift());
    }
    if (this.streamEnded) {
      return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.chunkWaiters.findIndex((waiter) => waiter.resolve === resolve);
        if (index !== -1) {
          this.chunkWaiters.splice(index, 1);
        }
        reject(new Error("Timed out waiting for MCP response."));
      }, timeoutMs);
      this.chunkWaiters.push({
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  async readEndpoint(timeoutMs = 5000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const chunk = await this.readChunk(Math.max(1, timeoutMs - (Date.now() - started)));
      if (chunk === null) {
        throw new Error("MCP SSE stream ended before endpoint was sent.");
      }

      this.buffer += chunk;
      const split = splitSseEvent(this.buffer);

      if (split) {
        this.buffer = split.rest;
        const dataLine = split.raw.split(/\r?\n/).find((line) => line.startsWith("data: "));
        if (dataLine) {
          return dataLine.slice("data: ".length);
        }
      }
    }

    throw new Error("Timed out waiting for MCP SSE endpoint.");
  }

  async post(message) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`MCP POST failed: ${response.status} ${await response.text()}`);
    }
  }

  async nextMessage(timeoutMs = 30000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const parsed = parseSseEvents(this.buffer);
      this.buffer = parsed.buffer;

      if (parsed.events.length) {
        return JSON.parse(parsed.events[0]);
      }

      const remaining = Math.max(1, timeoutMs - (Date.now() - started));
      const chunk = await this.readChunk(remaining);
      if (chunk === null) {
        throw new Error("MCP SSE stream ended.");
      }

      this.buffer += chunk;
    }

    throw new Error("Timed out waiting for MCP response.");
  }

  async request(method, params = {}, timeoutMs = 30000) {
    await this.connectIfNeeded();
    return this.sendRequest(method, params, timeoutMs);
  }

  async sendRequest(method, params = {}, timeoutMs = 30000) {
    const id = this.requestId;
    this.requestId += 1;

    await this.post({
      jsonrpc: "2.0",
      id,
      method,
      params
    });

    while (true) {
      const message = await this.nextMessage(timeoutMs);
      if (message.id !== id) {
        continue;
      }
      if (message.error) {
        throw new Error(message.error.message || JSON.stringify(message.error));
      }
      return message.result;
    }
  }

  async notify(method, params = {}) {
    await this.post({
      jsonrpc: "2.0",
      method,
      params
    });
  }

  async callTool(name, args = {}, timeoutMs = 30000) {
    return this.request("tools/call", {
      name,
      arguments: args
    }, timeoutMs);
  }

  async listTools() {
    return this.request("tools/list", {});
  }

  async connectIfNeeded() {
    if (!this.connected) {
      await this.connect();
    }
  }
}

function extractJsonFromToolText(text) {
  const fenced = String(text || "").match(/```json\s*([\s\S]*?)```/i);
  if (fenced) {
    return JSON.parse(fenced[1]);
  }
  return JSON.parse(text);
}

function toolText(result) {
  return (result.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("\n\n");
}

module.exports = {
  McpSseClient,
  extractJsonFromToolText,
  parseSseEvents,
  splitSseEvent,
  toolText
};
