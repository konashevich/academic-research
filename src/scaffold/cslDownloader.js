"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");

const CSL_REPO = "https://raw.githubusercontent.com/citation-style-language/styles/master";

const CSL_STYLES = [
  { name: "lncs", url: `${CSL_REPO}/springer-lecture-notes-in-computer-science.csl` },
  { name: "frontiers", url: `${CSL_REPO}/frontiers.csl` },
  { name: "ieee", url: `${CSL_REPO}/ieee.csl` },
  { name: "apa", url: `${CSL_REPO}/apa.csl` }
];

function downloadUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          downloadUrl(response.headers.location).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

async function downloadCslStyles(workspaceRoot, options = {}) {
  const stylesDir = path.join(workspaceRoot, "styles");
  await fs.promises.mkdir(stylesDir, { recursive: true });

  const results = [];
  const styles = options.styles || CSL_STYLES;

  for (const style of styles) {
    const dest = path.join(stylesDir, `${style.name}.csl`);
    if (fs.existsSync(dest) && !options.overwrite) {
      results.push({ name: style.name, status: "skipped", path: dest });
      continue;
    }

    try {
      const content = await downloadUrl(style.url);
      await fs.promises.writeFile(dest, content, "utf8");
      results.push({ name: style.name, status: "downloaded", path: dest });
    } catch (error) {
      results.push({ name: style.name, status: "failed", error: error.message });
    }
  }

  if (!fs.existsSync(path.join(stylesDir, "ledger.csl"))) {
    results.push({
      name: "ledger",
      status: "missing",
      detail: "Ledger CSL is not in the standard repository; add styles/ledger.csl manually."
    });
  }

  return results;
}

module.exports = {
  CSL_STYLES,
  downloadCslStyles
};
