#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# build.sh — Universal academic paper build script
# =============================================================================
# Reads paper.yaml and produces a PDF via Pandoc + citeproc.
#
# Usage:
#   ./build.sh                  # Build using active target from paper.yaml
#   ./build.sh -t ledger        # Override target
#   ./build.sh --draft          # Skip reference verification
#   ./build.sh -t frontiers --draft
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$SCRIPT_DIR/paper.yaml"

# ── Defaults ─────────────────────────────────────────────────────────────────
DRAFT=false
TARGET_OVERRIDE=""

# ── Parse arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    -t|--target)  TARGET_OVERRIDE="$2"; shift 2 ;;
    --draft)      DRAFT=true; shift ;;
    -h|--help)
      echo "Usage: ./build.sh [-t TARGET] [--draft]"
      echo ""
      echo "Targets are defined in paper.yaml under 'targets:'."
      echo "  -t, --target   Override the active target (e.g., lncs, ledger, frontiers)"
      echo "  --draft        Skip reference verification"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Check dependencies ──────────────────────────────────────────────────────
for cmd in pandoc python3; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "❌ Required command '$cmd' not found. Please install it."
    exit 1
  fi
done

# ── YAML parser (pure bash, no yq dependency) ───────────────────────────────
# Extracts simple scalar values from paper.yaml. For nested keys, use dot
# notation: yaml_get "project.manuscript"
yaml_get() {
  local key="$1"
  local file="${2:-$CONFIG}"

  # Handle dotted keys by matching indented YAML
  # This is a lightweight parser — works for our flat/shallow YAML structure
  python3 -c "
import yaml, sys
with open('$file') as f:
    data = yaml.safe_load(f)
keys = '$key'.split('.')
val = data
for k in keys:
    if isinstance(val, dict) and k in val:
        val = val[k]
    else:
        sys.exit(1)
if val is None:
    val = ''
print(val)
" 2>/dev/null
}

# ── Read configuration ──────────────────────────────────────────────────────
MANUSCRIPT="$(yaml_get 'project.manuscript')"
BIBLIOGRAPHY="$(yaml_get 'project.bibliography')"

if [[ -n "$TARGET_OVERRIDE" ]]; then
  TARGET="$TARGET_OVERRIDE"
else
  TARGET="$(yaml_get 'target')"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Academic Paper Builder"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Manuscript:    $MANUSCRIPT"
echo "  Bibliography:  $BIBLIOGRAPHY"
echo "  Target:        $TARGET"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Read target profile ──────────────────────────────────────────────────────
CSL="$(yaml_get "targets.$TARGET.csl")"
DOCCLASS="$(yaml_get "targets.$TARGET.documentclass")"
CLASSOPT="$(yaml_get "targets.$TARGET.classoption")"
TEMPLATE="$(yaml_get "targets.$TARGET.template")"
GEOMETRY="$(yaml_get "targets.$TARGET.geometry")"
FONTSIZE="$(yaml_get "targets.$TARGET.fontsize")"
DESCRIPTION="$(yaml_get "targets.$TARGET.description" 2>/dev/null || echo "$TARGET")"

echo "  Description:   $DESCRIPTION"
echo "  CSL style:     $CSL"
echo "  Class:         $DOCCLASS"
echo "  Geometry:      $GEOMETRY"
echo ""

# ── Validate files exist ────────────────────────────────────────────────────
for f in "$MANUSCRIPT" "$BIBLIOGRAPHY" "$CSL"; do
  if [[ ! -f "$SCRIPT_DIR/$f" ]]; then
    echo "❌ File not found: $f"
    exit 1
  fi
done

# ── Reference verification ──────────────────────────────────────────────────
if [[ "$DRAFT" == "true" ]]; then
  echo "🚧 DRAFT MODE: Skipping reference verification."
else
  echo "🔍 Verifying references..."
  if python3 "$SCRIPT_DIR/scripts/verify_refs.py" \
      --paper "$SCRIPT_DIR/$MANUSCRIPT" \
      --bib "$SCRIPT_DIR/$BIBLIOGRAPHY"; then
    echo ""
  else
    echo ""
    echo "❌ Build aborted due to reference errors."
    echo "   Use './build.sh --draft' to skip verification."
    exit 1
  fi
fi

# ── Construct output filename ────────────────────────────────────────────────
BASENAME="${MANUSCRIPT%.md}"
if [[ "$DRAFT" == "true" ]]; then
  OUTPUT="${BASENAME}_${TARGET}_draft.pdf"
else
  OUTPUT="${BASENAME}_${TARGET}.pdf"
fi

# ── Build Pandoc command ─────────────────────────────────────────────────────
PANDOC_ARGS=(
  "$SCRIPT_DIR/$MANUSCRIPT"
  -s
  --citeproc
  --bibliography="$SCRIPT_DIR/$BIBLIOGRAPHY"
  --csl="$SCRIPT_DIR/$CSL"
  -V "documentclass=$DOCCLASS"
  -V "fontsize=$FONTSIZE"
  -V "geometry:$GEOMETRY"
)

# Add classoption if non-empty
if [[ -n "$CLASSOPT" ]]; then
  PANDOC_ARGS+=(-V "classoption=$CLASSOPT")
fi

# Add header template if specified and exists
if [[ -n "$TEMPLATE" && "$TEMPLATE" != "None" && "$TEMPLATE" != "null" ]]; then
  if [[ -f "$SCRIPT_DIR/$TEMPLATE" ]]; then
    PANDOC_ARGS+=(--include-in-header="$SCRIPT_DIR/$TEMPLATE")
  else
    echo "⚠️  Template not found: $TEMPLATE (proceeding without it)"
  fi
fi

PANDOC_ARGS+=(-o "$SCRIPT_DIR/$OUTPUT")

echo "📄 Building PDF → $OUTPUT"
pandoc "${PANDOC_ARGS[@]}"

if [[ $? -eq 0 ]]; then
  echo "✅ Successfully created $OUTPUT"
else
  echo "❌ Error: PDF generation failed."
  exit 1
fi
