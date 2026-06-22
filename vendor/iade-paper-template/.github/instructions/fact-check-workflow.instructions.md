---
applyTo: '**'
---

# Fact-Checking Workflow

This workflow defines the process for verifying the accuracy of claims and citations in the manuscript.

## Core Rules
1. **No Proactive Edits**: Do not modify the paper unless explicitly instructed by the user after discussion.
2. **Chat-First Reporting**: Report findings for each text piece (quote, paragraph, or section) provided by the user.
3. **Structured Verification**: For every check, verify:
   - **Statement Accuracy**: Is the claim technically or historically correct? (Use web search and Google Scholar MCP.)
   - **Citation Existence**: Does the cited key exist in `refs/bibliography.json`?
   - **Content Alignment**: Does the source material actually support the claim being made?
4. **Iterative Discussion**: Provide recommendations and wait for user confirmation before making changes.
5. **Surgical Fixes**: When fixing, modify ONLY the specific lines or paragraph discussed.

## Execution Flow
1. User provides a text snippet, section, or asks for a full-paper review.
2. Agent searches `refs/bibliography.json` for cited keys.
3. Agent uses web search / Google Scholar MCP to verify external facts.
4. Agent reports findings in chat:
   - **Finding**: Technical accuracy / Citation status
   - **Discussion**: Nuance, context, or alternative interpretation
   - **Recommendation**: Proposed fix, alternative wording, or "leave as is"
5. Agent waits for user instruction before modifying text.

## Severity Levels
- **Critical**: Factually incorrect claim, non-existent citation, or citation that contradicts the claim
- **Warning**: Claim is imprecise or overly broad; citation is tangentially related
- **Info**: Minor stylistic suggestion or additional source that could strengthen the argument
