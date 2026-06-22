"use strict";

const HUB_STEPS = ["welcome", "infrastructure", "project", "deploy"];

function normalizeStep(step) {
  return HUB_STEPS.includes(step) ? step : "welcome";
}

function stepIndex(step) {
  return HUB_STEPS.indexOf(normalizeStep(step));
}

function nextStep(step) {
  const index = stepIndex(step);
  return index < HUB_STEPS.length - 1 ? HUB_STEPS[index + 1] : step;
}

function previousStep(step) {
  const index = stepIndex(step);
  return index > 0 ? HUB_STEPS[index - 1] : step;
}

function createDefaultProjectForm(config) {
  const defaults = config?.get?.("scaffoldDefaults") || {};
  return {
    title: defaults.title || "",
    authorName: defaults.authorName || "",
    affiliation: defaults.affiliation || "",
    email: defaults.email || "",
    language: defaults.language || "en-GB",
    target: config?.get?.("defaultTarget", "lncs") || defaults.target || "lncs",
    researchContext: defaults.researchContext || ""
  };
}

function createDefaultComponents(config, hasGit = false) {
  const defaults = config?.get?.("scaffoldDefaults") || {};
  return {
    manuscript: defaults.manuscript !== false,
    bibliography: defaults.bibliography !== false,
    makefile: defaults.makefile !== false,
    instructions: defaults.instructions !== false,
    vscode: defaults.vscode !== false,
    csl: defaults.csl !== false,
    gitInit: defaults.gitInit === false ? false : !hasGit
  };
}

function createHubViewModel(state = {}) {
  const step = normalizeStep(state.step || "welcome");
  return {
    step,
    stepIndex: stepIndex(step),
    stepCount: HUB_STEPS.length,
    infra: state.infra || {},
    credentials: state.credentials || { apiKey: "", libraryId: "", cursorApiKey: "" },
    project: state.project || createDefaultProjectForm(),
    components: state.components || createDefaultComponents(),
    profiles: state.profiles || [],
    deploy: state.deploy || {
      plan: null,
      progress: [],
      done: false,
      error: "",
      warnings: [],
      overwritePaperYaml: false,
      overwritePaperMd: false,
      overwriteTemplateFiles: false
    },
    busy: Boolean(state.busy),
    message: state.message || ""
  };
}

module.exports = {
  HUB_STEPS,
  createDefaultComponents,
  createDefaultProjectForm,
  createHubViewModel,
  nextStep,
  normalizeStep,
  previousStep,
  stepIndex
};
