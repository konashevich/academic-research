---
name: create-paper
description: Initialises the academic paper template in the current empty workspace.
---

When the user asks you to "create-paper", execute the following workflow in the terminal using the `gh` CLI. 

1. Identify the name of the current workspace directory (e.g. if the user opened a folder named `cloud-technologies-in-law`, use that as the `<project-name>`).
2. Run these exact commands in the terminal sequentially:

```bash
# Create the repo on GitHub using the template (without cloning as a subfolder)
gh repo create <project-name> --template konashevich/academic-paper-template --private

# Clone the newly created repository directly into the current directory (.)
gh repo clone <project-name> .

# Run the setup wizard
./init-project.sh
```