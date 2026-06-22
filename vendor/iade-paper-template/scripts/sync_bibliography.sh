#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# sync_bibliography.sh — Sync bibliography from Zotero MCP to local CSL JSON
# =============================================================================
# This script calls the Zotero MCP server to export the full library as CSL JSON
# and saves it to refs/bibliography.json.
#
# Prerequisites:
#   - Zotero MCP server must be running
#   - curl must be available
#   - paper.yaml must exist with MCP host configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG="$ROOT_DIR/paper.yaml"
OUTPUT="$ROOT_DIR/refs/bibliography.json"

# Read MCP configuration from paper.yaml
if command -v python3 &>/dev/null && [[ -f "$CONFIG" ]]; then
  MCP_HOST=$(python3 -c "
import yaml
with open('$CONFIG') as f:
    c = yaml.safe_load(f)
print(c.get('mcp', {}).get('host', 'localhost'))
")
  ZOTERO_PORT=$(python3 -c "
import yaml
with open('$CONFIG') as f:
    c = yaml.safe_load(f)
print(c.get('mcp', {}).get('zotero_port', 9180))
")
else
  MCP_HOST="${ACADEMIC_MCP_HOST:-localhost}"
  ZOTERO_PORT="9180"
fi

MCP_URL="http://${MCP_HOST}:${ZOTERO_PORT}"

echo "📚 Syncing bibliography from Zotero MCP..."
echo "   Server: $MCP_URL"
echo "   Output: $OUTPUT"

# Check connectivity first
if ! curl -sf --max-time 5 "$MCP_URL/sse" >/dev/null 2>&1; then
  echo "❌ Cannot reach Zotero MCP at $MCP_URL"
  echo "   Make sure the Zotero MCP server is running."
  exit 1
fi

# The actual sync is typically done through the MCP protocol via the AI agent.
# This script provides a manual fallback / reminder.
echo ""
echo "ℹ️  Bibliography sync is best done through the AI agent in VS Code:"
echo "    Ask Copilot: 'Sync my bibliography from Zotero'"
echo ""
echo "   The agent will:"
echo "   1. Call export_bibliography_content via Zotero MCP"
echo "   2. Save the CSL JSON to refs/bibliography.json"
echo "   3. Validate the result"
echo ""

# If the bibliography file doesn't exist yet, create an empty one
if [[ ! -f "$OUTPUT" ]]; then
  echo "[]" > "$OUTPUT"
  echo "   Created empty bibliography file: $OUTPUT"
fi

echo "   Current bibliography: $(python3 -c "import json; print(len(json.load(open('$OUTPUT'))))" 2>/dev/null || echo "0") items"
