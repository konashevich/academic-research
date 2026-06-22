# =============================================================================
# Makefile — Academic Paper Build Shortcuts
# =============================================================================
# Usage:
#   make pdf              Build PDF using active target
#   make draft            Build PDF skipping reference check
#   make pdf TO=ledger    Build for a specific target
#   make verify           Run reference verification only
#   make urls             Check URL health in bibliography
#   make switch TO=x      Change the active target in paper.yaml
#   make clean            Remove generated PDFs
#   make sync             Sync bibliography from Zotero MCP
# =============================================================================

.PHONY: pdf draft verify urls switch clean sync help

# Default target
TO ?=

help:
	@echo "Academic Paper Build System"
	@echo ""
	@echo "  make pdf              Build PDF (active target from paper.yaml)"
	@echo "  make pdf TO=ledger    Build PDF for specific target"
	@echo "  make draft            Build PDF, skip reference verification"
	@echo "  make draft TO=ledger  Draft build for specific target"
	@echo "  make verify           Verify references only"
	@echo "  make urls             Check URL health in bibliography"
	@echo "  make switch TO=lncs   Change active target in paper.yaml"
	@echo "  make sync             Sync bibliography from Zotero MCP"
	@echo "  make clean            Remove generated PDFs"

pdf:
ifdef TO
	./build.sh -t $(TO)
else
	./build.sh
endif

draft:
ifdef TO
	./build.sh -t $(TO) --draft
else
	./build.sh --draft
endif

verify:
	@python3 scripts/verify_refs.py \
		--paper "$$(python3 -c "import yaml; print(yaml.safe_load(open('paper.yaml'))['project']['manuscript'])")" \
		--bib "$$(python3 -c "import yaml; print(yaml.safe_load(open('paper.yaml'))['project']['bibliography'])")"

urls:
	@python3 scripts/check_urls.py \
		"$$(python3 -c "import yaml; print(yaml.safe_load(open('paper.yaml'))['project']['bibliography'])")"

switch:
ifndef TO
	@echo "Usage: make switch TO=<target>"
	@echo "Available targets: lncs, ledger, frontiers, report"
	@exit 1
endif
	@python3 -c "\
import yaml; \
c = yaml.safe_load(open('paper.yaml')); \
t = '$(TO)'; \
assert t in c.get('targets', {}), f'Unknown target: {t}. Available: {list(c[\"targets\"].keys())}'; \
c['target'] = t; \
yaml.dump(c, open('paper.yaml', 'w'), default_flow_style=False, allow_unicode=True, sort_keys=False); \
print(f'✅ Active target switched to: {t}')"

sync:
	@bash scripts/sync_bibliography.sh

clean:
	@echo "Removing generated PDFs..."
	@rm -f paper_*.pdf *.pdf
	@echo "✓ Clean"
