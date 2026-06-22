# Manage Paper Target Profiles

Use this skill when helping the user customize journal/book output targets for the Academic Research extension.

## Storage locations

| Scope | Path |
|---|---|
| Bundled (read-only) | `vendor/iade-paper-template/templates/<id>/header.tex` + targets in bundled `paper.yaml` |
| Global user profiles | `<globalStorage>/profiles/<id>/` |
| Workspace export (agent-editable) | `.academic/imported-profiles/<id>/` |

Open global storage from the editor:

```
Academic Research: Open Profiles Folder
```

Command id: `academicResearch.openProfilesFolder`

## Profile file format

Each global profile folder contains:

- `profile.yaml` — Pandoc/LaTeX settings (`description`, `csl`, `documentclass`, `classoption`, `template`, `geometry`, `fontsize`, `extra_pandoc_args`)
- `header.tex` — LaTeX fragment copied to `templates/<id>/header.tex` on deploy
- `profile.meta.json` — metadata (`clonedFrom`, `createdAt`, `label`)

## Commands for agents

| Command | Purpose |
|---|---|
| `academicResearch.scaffoldPaperProject` | Headless deploy with JSON args (`title`, `authorName`, `target`, `overwrite`, `dryRun`, `components`) |
| `academicResearch.cloneTargetProfile` | Clone bundled profile: `{ "from": "lncs", "id": "my-thesis" }` |
| `academicResearch.exportProfileToWorkspace` | Copy a profile into `.academic/imported-profiles/<id>/` for editing |
| `academicResearch.importProfileFromWorkspace` | Install a workspace profile from `.academic/imported-profiles/<id>/` into global storage |
| `academicResearch.manageProfiles` | Interactive profile manager UI |

## Typical agent workflow

1. Export a bundled profile to the workspace for editing.
2. Edit `profile.yaml` and `header.tex` under `.academic/imported-profiles/<id>/`.
3. Run `academicResearch.importProfileFromWorkspace` with the profile id, or use **Manage Paper Profiles → Import from workspace**.
4. Re-deploy or update `paper.yaml` `targets:` — deploy merges bundled + global profiles automatically.

## Scaffold defaults

Extension settings:

- `academicResearch.defaultTemplateId` — default `iade-default`
- `academicResearch.defaultTarget` — default `lncs`
- `academicResearch.scaffoldDefaults` — default form fields and component toggles
