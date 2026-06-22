---
applyTo: '**'
---

# Academic Writing Rules

These rules govern the AI agent's behaviour when writing or editing academic prose in this workspace.

## Language & Tone
1. **Language variant**: Follow the `language` setting in `paper.yaml` (en-GB or en-US). en-GB uses: "analyse", "tokenised", "colour", "behaviour", "recognised", etc. en-US uses: "analyze", "tokenized", "color", "behavior", "recognized", etc.
2. **Confidence**: Use assertive, declarative statements. Avoid hedging words ("may", "might", "could", "seems", "appears", "suggests", "indicates", "potentially", "possibly", "arguably", "somewhat") unless expressing genuine epistemic uncertainty about an open research question.
3. **Register**: Formal academic register. No colloquialisms, no contractions in prose.

## Structure & Formatting
4. **Narrative flow**: Favour continuous prose over bullet-point lists. Sections should read as coherent arguments, not as slide decks.
5. **No bold in body text**: Bold is reserved for headings and structural elements only.
6. **Section numbering**: Use numbered sections (## 1. Introduction, ## 2. Background, etc.).
7. **Paragraphs**: Each paragraph should develop one idea. Aim for 4–8 sentences per paragraph.

## Citations
8. **Every factual claim requires a citation**. If the agent introduces a claim and no source is available, it must flag it with `[citation needed]` rather than fabricating a reference.
9. **Citation syntax**: Pandoc-style: `[@citekey]`, `[@key1; @key2]`, `[@key, p. 42]`.
10. **No invented references**: Never generate bibliographic entries. All references must come from the Zotero library or be flagged for the user to source.

## Editing Discipline
11. **Surgical edits**: When modifying existing text, change only the specific lines discussed. Do not refactor, reword, or restructure surrounding text unless explicitly asked.
12. **Preserve author voice**: The agent assists but does not impose its own stylistic preferences over the author's established voice.
13. **Track what changed**: After any edit, briefly state what was changed and why.
