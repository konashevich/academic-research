#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# init-project.sh — Interactive setup wizard for a new academic paper project
# =============================================================================
# Run this once after cloning/creating the template to configure your project.
# It fills in paper.yaml, creates the manuscript scaffold, configures MCP
# connections, and syncs bibliography from Zotero.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$SCRIPT_DIR/paper.yaml"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Academic Paper — Project Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Helper ───────────────────────────────────────────────────────────────────
prompt() {
  local var_name="$1"
  local prompt_text="$2"
  local default="$3"
  local result

  if [[ -n "$default" ]]; then
    read -rp "  $prompt_text [$default]: " result
    result="${result:-$default}"
  else
    read -rp "  $prompt_text: " result
  fi
  eval "$var_name=\"$result\""
}

select_option() {
  local var_name="$1"
  local prompt_text="$2"
  shift 2
  local options=("$@")

  echo "  $prompt_text"
  local i=1
  for opt in "${options[@]}"; do
    echo "    $i) $opt"
    ((i++))
  done

  local choice
  read -rp "  Enter number [1]: " choice
  choice="${choice:-1}"

  if [[ "$choice" -ge 1 && "$choice" -le "${#options[@]}" ]]; then
    eval "$var_name=\"${options[$((choice-1))]}\""
  else
    echo "  Invalid choice, using default."
    eval "$var_name=\"${options[0]}\""
  fi
}

# ── Step 1: Project details ─────────────────────────────────────────────────
echo "📝 Step 1: Project Details"
echo ""
prompt TITLE "Paper title" ""
prompt AUTHOR_NAME "Your name" ""
prompt AUTHOR_AFFILIATION "Affiliation" ""
prompt AUTHOR_EMAIL "Email" ""

echo ""
select_option LANGUAGE "Language variant:" "en-GB (British English)" "en-US (American English)"
# Extract just the locale code
LANG_CODE="${LANGUAGE%% *}"

# ── Step 2: Target journal ──────────────────────────────────────────────────
echo ""
echo "📎 Step 2: Target Journal/Output"
echo ""
select_option TARGET "Select initial target:" \
  "lncs" \
  "ledger" \
  "frontiers" \
  "report"

echo ""
echo "  Selected: $TARGET"

# ── Step 3: MCP Infrastructure ──────────────────────────────────────────────
echo ""
echo "🔌 Step 3: MCP Server Configuration"
echo ""

MCP_HOST="${ACADEMIC_MCP_HOST:-localhost}"
ZOTERO_PORT="9180"
SCHOLAR_PORT="3847"

check_port() {
  local host=$1
  local port=$2
  timeout 1 bash -c "</dev/tcp/$host/$port" 2>/dev/null
}

if check_port "$MCP_HOST" "$ZOTERO_PORT" && check_port "$MCP_HOST" "$SCHOLAR_PORT"; then
  echo "  ✓ Auto-detected active MCP servers at ${MCP_HOST} (ports ${ZOTERO_PORT}, ${SCHOLAR_PORT})."
  echo "  (Skipping manual configuration)"
else
  echo "  Your Zotero and Google Scholar MCP servers need to be reachable."
  echo "  Enter the hostname or IP of the machine running them."
  echo ""
  prompt MCP_HOST "MCP server host" "$MCP_HOST"
  prompt ZOTERO_PORT "Zotero MCP port" "$ZOTERO_PORT"
  prompt SCHOLAR_PORT "Google Scholar MCP port" "$SCHOLAR_PORT"
fi

# ── Step 4: CSL style download ──────────────────────────────────────────────
echo ""
echo "📚 Step 4: Citation Styles"
echo ""

CSL_REPO="https://raw.githubusercontent.com/citation-style-language/styles/master"

download_csl() {
  local name="$1"
  local url="$2"
  local dest="$SCRIPT_DIR/styles/${name}.csl"

  if [[ -f "$dest" ]]; then
    echo "  ✓ $name.csl already exists"
    return 0
  fi

  echo -n "  Downloading $name.csl... "
  if curl -sfL "$url" -o "$dest" 2>/dev/null; then
    echo "✓"
  else
    echo "✗ (failed — you can add it manually later)"
  fi
}

echo "  Downloading standard CSL styles from citation-style-language/styles..."
download_csl "lncs" "$CSL_REPO/springer-lecture-notes-in-computer-science.csl"
download_csl "frontiers" "$CSL_REPO/frontiers.csl"
download_csl "ieee" "$CSL_REPO/ieee.csl"
download_csl "apa" "$CSL_REPO/apa.csl"

# Ledger uses a custom style — create a placeholder if not present
if [[ ! -f "$SCRIPT_DIR/styles/ledger.csl" ]]; then
  echo "  ℹ  Ledger CSL: not in the standard repository. Add manually to styles/ledger.csl"
fi

# ── Step 5: Write configuration ─────────────────────────────────────────────
echo ""
echo "⚙️  Writing configuration..."

# Use Python to update paper.yaml properly
python3 - <<PYEOF
import yaml

with open('$CONFIG') as f:
    config = yaml.safe_load(f)

config['project']['title'] = "$TITLE"
config['project']['authors'] = [{
    'name': "$AUTHOR_NAME",
    'affiliation': "$AUTHOR_AFFILIATION",
    'email': "$AUTHOR_EMAIL"
}]
config['project']['language'] = "$LANG_CODE"
config['target'] = "$TARGET"
config['mcp'] = {
    'host': "$MCP_HOST",
    'zotero_port': int("$ZOTERO_PORT"),
    'scholar_port': int("$SCHOLAR_PORT")
}

with open('$CONFIG', 'w') as f:
    yaml.dump(config, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

print("  ✓ paper.yaml updated")
PYEOF

# ── Step 6: Configure .vscode/mcp.json ──────────────────────────────────────
cat > "$SCRIPT_DIR/.vscode/mcp.json" <<MCPEOF
{
  "servers": {
    "zotero-mcp": {
      "url": "http://${MCP_HOST}:${ZOTERO_PORT}/sse"
    },
    "google-scholar": {
      "url": "http://${MCP_HOST}:${SCHOLAR_PORT}/sse"
    }
  }
}
MCPEOF
echo "  ✓ .vscode/mcp.json configured"

# ── Step 7: Update copilot-instructions with language preference ─────────────
sed -i "s/en-GB/$LANG_CODE/g" "$SCRIPT_DIR/.github/copilot-instructions.md" 2>/dev/null || true
if [[ "$LANG_CODE" == "en-US" ]]; then
  sed -i "s/British English/American English/g" "$SCRIPT_DIR/.github/copilot-instructions.md" 2>/dev/null || true
  sed -i 's/"en-GB"/"en-US"/g' "$SCRIPT_DIR/.vscode/settings.json" 2>/dev/null || true
fi
echo "  ✓ Language preference set to $LANG_CODE"

# ── Step 8: Create manuscript scaffold if empty ─────────────────────────────
MANUSCRIPT="$SCRIPT_DIR/paper.md"
if [[ ! -s "$MANUSCRIPT" ]] || grep -q "Your Paper Title Here" "$MANUSCRIPT" 2>/dev/null; then
  cat > "$MANUSCRIPT" <<MDEOF
---
title: "$TITLE"
author:
  - name: "$AUTHOR_NAME"
    affiliation: "$AUTHOR_AFFILIATION"
    email: "$AUTHOR_EMAIL"
date: "$(date +%Y)"
bibliography: refs/bibliography.json
csl: styles/${TARGET}.csl
---

## Abstract

*Write your abstract here.*

## 1. Introduction

## 2. Background

## 3. Methodology

## 4. Results

## 5. Discussion

## 6. Conclusion

## References
MDEOF
  echo "  ✓ paper.md scaffold created"
else
  echo "  ℹ  paper.md already has content — skipping scaffold"
fi

# ── Step 9: Test MCP connectivity ────────────────────────────────────────────
echo ""
echo "🔌 Testing MCP server connectivity..."
echo -n "  Zotero MCP (${MCP_HOST}:${ZOTERO_PORT})... "
if curl -sf --max-time 3 "http://${MCP_HOST}:${ZOTERO_PORT}/sse" >/dev/null 2>&1; then
  echo "✓ reachable"
else
  echo "✗ not reachable (check server is running)"
fi

echo -n "  Google Scholar MCP (${MCP_HOST}:${SCHOLAR_PORT})... "
if curl -sf --max-time 3 "http://${MCP_HOST}:${SCHOLAR_PORT}/sse" >/dev/null 2>&1; then
  echo "✓ reachable"
else
  echo "✗ not reachable (check server is running)"
fi

# ── Step 10: Initialize Git ─────────────────────────────────────────────────
echo ""
if [[ ! -d "$SCRIPT_DIR/.git" ]]; then
  echo "📦 Initialising Git repository..."
  cd "$SCRIPT_DIR"
  git init -q
  git add -A
  git commit -q -m "Initial project setup: $TITLE"
  echo "  ✓ Git repository initialised with initial commit"
else
  echo "  ℹ  Git repository already exists"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Project setup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Next steps:"
echo "    1. Open this folder in VS Code"
echo "    2. Start writing in paper.md"
echo "    3. Use Copilot Chat to search literature and manage references"
echo "    4. Run './build.sh' to generate PDF"
echo "    5. Run './build.sh -t ledger' to switch journal format"
echo ""
echo "  Useful commands:"
echo "    make pdf          Build PDF (active target)"
echo "    make draft        Build without ref verification"
echo "    make verify       Check references only"
echo "    make urls         Check URL health in bibliography"
echo "    make switch TO=x  Switch active target to x"
echo ""
