"use strict";

const https = require("https");

function fetchZoteroUserId(apiKey) {
  const trimmed = String(apiKey || "").trim();
  if (!trimmed) {
    return Promise.reject(new Error("API key is required."));
  }

  return new Promise((resolve, reject) => {
    const request = https.get(
      `https://api.zotero.org/keys/${encodeURIComponent(trimmed)}`,
      {
        headers: {
          "Zotero-API-Key": trimmed
        }
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode && response.statusCode >= 400) {
            reject(new Error(`Zotero API returned HTTP ${response.statusCode}.`));
            return;
          }

          try {
            const parsed = JSON.parse(body);
            const userId = String(parsed.userID || parsed.userId || "").trim();
            if (!userId) {
              reject(new Error("Zotero API did not return a user ID."));
              return;
            }
            resolve(userId);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);
    request.setTimeout(15000, () => {
      request.destroy(new Error("Timed out while contacting Zotero API."));
    });
  });
}

module.exports = {
  fetchZoteroUserId
};
