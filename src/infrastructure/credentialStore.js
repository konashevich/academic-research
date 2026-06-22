"use strict";

const SECRET_API_KEY = "academicResearch.zoteroApiKey";
const SECRET_CURSOR_API_KEY = "academicResearch.cursorApiKey";

class CredentialStore {
  constructor(context) {
    this.context = context;
  }

  async getZoteroApiKey() {
    return this.context.secrets.get(SECRET_API_KEY);
  }

  async setZoteroApiKey(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      await this.context.secrets.delete(SECRET_API_KEY);
      return;
    }
    await this.context.secrets.store(SECRET_API_KEY, trimmed);
  }

  getZoteroLibraryId() {
    return String(this.context.globalState.get("zoteroLibraryId", "") || "").trim();
  }

  async setZoteroLibraryId(value) {
    const trimmed = String(value || "").trim();
    await this.context.globalState.update("zoteroLibraryId", trimmed);
  }

  async hasZoteroCredentials() {
    const apiKey = await this.getZoteroApiKey();
    const libraryId = this.getZoteroLibraryId();
    return Boolean(apiKey && libraryId);
  }

  async getCursorApiKey() {
    return this.context.secrets.get(SECRET_CURSOR_API_KEY);
  }

  async setCursorApiKey(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      await this.context.secrets.delete(SECRET_CURSOR_API_KEY);
      return;
    }
    await this.context.secrets.store(SECRET_CURSOR_API_KEY, trimmed);
  }

  async hasCursorApiKey() {
    return Boolean(await this.getCursorApiKey());
  }
}

module.exports = {
  CredentialStore,
  SECRET_API_KEY,
  SECRET_CURSOR_API_KEY
};
