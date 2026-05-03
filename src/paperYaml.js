"use strict";

const fs = require("fs");
const path = require("path");

function stripInlineComment(value) {
  let quote = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if ((char === "\"" || char === "'") && value[index - 1] !== "\\") {
      quote = quote === char ? null : quote || char;
      continue;
    }

    if (char === "#" && !quote) {
      return value.slice(0, index).trim();
    }
  }

  return value.trim();
}

function cleanScalar(rawValue) {
  const withoutComment = stripInlineComment(rawValue || "");

  if (!withoutComment || withoutComment === "null" || withoutComment === "~") {
    return "";
  }

  if (
    (withoutComment.startsWith("\"") && withoutComment.endsWith("\"")) ||
    (withoutComment.startsWith("'") && withoutComment.endsWith("'"))
  ) {
    return withoutComment.slice(1, -1);
  }

  if (withoutComment.startsWith("[") && withoutComment.endsWith("]")) {
    return withoutComment
      .slice(1, -1)
      .split(",")
      .map((item) => cleanScalar(item))
      .filter(Boolean);
  }

  if (/^\d+$/.test(withoutComment)) {
    return Number(withoutComment);
  }

  return withoutComment;
}

function resolveEnvironmentDefault(value) {
  if (typeof value !== "string") {
    return value;
  }

  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*):-([^}]+)\}/g, (_match, name, fallback) => {
    return process.env[name] || fallback;
  });
}

function parseYamlScalars(content) {
  const scalars = new Map();
  const stack = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#") || line.trimStart().startsWith("- ")) {
      continue;
    }

    const match = line.match(/^(\s*)([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) {
      continue;
    }

    const indent = match[1].length;
    const key = match[2];
    const value = match[3] || "";

    while (stack.length && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const currentPath = [...stack.map((entry) => entry.key), key];
    const cleaned = cleanScalar(value);

    if (value.trim()) {
      scalars.set(currentPath.join("."), cleaned);
    }

    if (!value.trim()) {
      stack.push({ indent, key });
    }
  }

  return scalars;
}

function parseAcademicPaperYaml(content) {
  const scalars = parseYamlScalars(content);
  const target = scalars.get("target") || "";
  const get = (key, fallback = "") => resolveEnvironmentDefault(scalars.get(key) ?? fallback);

  return {
    project: {
      title: get("project.title"),
      shortTitle: get("project.short_title"),
      date: get("project.date"),
      language: get("project.language", "en-GB"),
      manuscript: get("project.manuscript", "paper.md"),
      bibliography: get("project.bibliography", "refs/bibliography.json")
    },
    target,
    activeTarget: target
      ? {
          id: target,
          description: get(`targets.${target}.description`, target),
          csl: get(`targets.${target}.csl`),
          documentclass: get(`targets.${target}.documentclass`),
          classoption: get(`targets.${target}.classoption`),
          template: get(`targets.${target}.template`),
          geometry: get(`targets.${target}.geometry`),
          fontsize: get(`targets.${target}.fontsize`)
        }
      : null,
    targets: [...scalars.keys()]
      .filter((key) => key.startsWith("targets.") && key.endsWith(".description"))
      .map((key) => key.split(".")[1]),
    mcp: {
      host: get("mcp.host", "localhost"),
      zoteroPort: get("mcp.zotero_port", 9180),
      scholarPort: get("mcp.scholar_port", 3847)
    },
    rawScalars: Object.fromEntries(scalars)
  };
}

function readAcademicPaperYaml(rootDir) {
  const yamlPath = path.join(rootDir, "paper.yaml");
  const content = fs.readFileSync(yamlPath, "utf8");
  return {
    path: yamlPath,
    config: parseAcademicPaperYaml(content)
  };
}

module.exports = {
  cleanScalar,
  parseAcademicPaperYaml,
  parseYamlScalars,
  readAcademicPaperYaml,
  resolveEnvironmentDefault
};
