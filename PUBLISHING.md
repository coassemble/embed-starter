# Publishing and release verification

Keep `.env` and `node_modules` excluded by `.gitignore`. Public starter publication and the prepared product-release workflow were authorized with the ENG-11708 deployment on 14 September 2026. The workflow still needs its dedicated Sandbox workspace and secret before activation.

Before publishing, verify the current Author branch and these files still share the brief:

```sh
cd /path/to/coassemble-author
node docs/scripts/generate-setup-brief.mjs --check --starter-dir=/Volumes/Development/embed-starter
cd /Volumes/Development/embed-starter
npm ci
npm test
```

For the initial public repository publication:

```sh
cd /Volumes/Development/embed-starter
git status --short
gh repo create coassemble/embed-starter --public --source=. --remote=origin --push --description "A server-side Coassemble course embed starter"
gh repo view coassemble/embed-starter --json url,visibility,defaultBranchRef
```

Then prove the exact three commands in the console against a fresh clone, using a dedicated test key and the real released frontend/backend. Verify browser requests contain no key, the demo renders, and a new page load mints a fresh link. Publish Author and Docs together so the console, README and hosted brief refer to the same working behavior.

The production-release workflow is `ci-proposals/product-release-smoke.yml`; its dedicated Sandbox secret/workspace is described in `ci-proposals/README.md`. It uses the existing production `deployment_status` events and checks the latest successful frontend/backend pair through the read-only GitHub API. Publishing this repository alone does not activate release coverage.
