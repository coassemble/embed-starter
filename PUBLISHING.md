# Publish checklist and exact commands

Prepared locally for ENG-11717. No repository has been created or pushed, and no workflow has been enabled.

Two explicit approvals remain: publish these prepared files to the public repository `coassemble/embed-starter` on `main`; and install the prepared production-release CI workflow under Author `AGENTS.md` Rule 13, including its dedicated Sandbox workspace/secret configuration. These are publication and CI activation decisions. Local file preparation, checks and browser proof can continue without another approval. Keep `.env` and `node_modules` excluded by `.gitignore`.

Before publishing, verify the current Author branch and these files still share the brief:

```sh
cd /Volumes/Development/coassemble-author
node docs/scripts/generate-setup-brief.mjs --check --starter-dir=/Volumes/Development/embed-starter
cd /Volumes/Development/embed-starter
npm ci
npm test
```

After approval to create the public repository:

```sh
cd /Volumes/Development/embed-starter
git init --initial-branch=main
git add .
git commit -m "Add working Coassemble course embed starter"
gh repo create coassemble/embed-starter --public --source=. --remote=origin --push --description "A server-side Coassemble course embed starter"
gh repo view coassemble/embed-starter --json url,visibility,defaultBranchRef
```

Then prove the exact three commands in the console against a fresh clone, using a dedicated test key and the real released frontend/backend. Verify browser requests contain no key, the demo renders, and a new page load mints a fresh link. Publish Author and Docs together so the console, README and hosted brief refer to the same working behavior.

The separate CI approval covers `ci-proposals/product-release-smoke.yml` and the dedicated sandbox secret/workspace described in `ci-proposals/README.md`. The prepared workflow uses the existing production `deployment_status` events and checks the latest successful frontend/backend pair through the read-only GitHub API. Publishing this repository alone does not activate release coverage.
