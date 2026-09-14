# Product-release smoke proposal

This directory is reviewable prep. No GitHub Actions workflow or scheduled job is enabled.

`product-release-smoke.yml` belongs in **coassemble-author**, so releases of the product trigger the starter check. It responds directly to GitHub `deployment_status` success events from `main - coassemble-frontend-prod` and `main - coassemble-backend-prod`. Manual dispatch checks the currently released pair for diagnosis. Changes to the starter repository alone do not provide release coverage.

`release-ready.mjs` reads each production environment's deployment history and latest statuses through the GitHub API, using only the built-in token with `deployments: read` and `contents: read`. The latest successful frontend and backend must have the same commit, and a deployment event must still refer to the current successful deployment of its service. The first completed service waits for its partner; the partner's success event checks the pair again. Failed, nonproduction and superseded events do not run the browser smoke. Same-commit redeployments are checked again. A release that leaves the services at different commits does not qualify as a verified pair; its saved receipt explains the mismatch.

The existing Render GitHub app already emits these events; no dispatcher, deployment write token or new release-hook service is needed. On 14 September 2026, production frontend deployment `6427481744` and backend deployment `6427481723` both had latest status `success` at commit `9a0e19956b16b9e3328112ed601280ecf0673c76`. The smoke uses the canonical production API `https://api.coassemble.com/api`; it never navigates to Render's `environment_url`. Staging, hotfix and enterprise environment names are separate targets and are excluded from this production workflow.

Approval/configuration needed:

1. Approve the new CI job under Author `AGENTS.md` Rule 13.
2. Publish `coassemble/embed-starter` and approve using its `main` branch as the smoke target.
3. Select a dedicated Sandbox workspace with the published `New starter induction` demo. Reserve the stable learner identifier `embed-starter-release-smoke`; reusing it prevents a new learner allowance charge per release.
4. Create environment `embed-starter-sandbox` in the product repository, with server-only secret `EMBED_STARTER_SANDBOX_KEY`. Its key must report `keyMode: test` on setup/status. Its protection rules must allow the already-approved workflow to run automatically after every production deployment; a per-run manual reviewer would turn this into manual coverage. The key is supplied only to the browser smoke step.
5. Install the approved workflow and observe an actual paired production deployment, then inspect its original screenshot, release receipt and logs. Manual dispatch can validate setup first. No pre-deploy CI or branch-push event is treated as proof that a release is live.

The smoke runs the published starter's local HTTP tests, starts its real server against the released API, loads the returned link in Chromium, verifies the actual modern player and its test-mode badge, and rejects browser requests containing the API key. It records a screenshot; this verifies loading rather than course completion. Completion remains part of the main first-run integration proof.

The gate is covered by deterministic tests for matching and split SHAs, the second service completing, stale/failed/nonproduction events, paginated deployment history, manual diagnosis and safe GitHub errors. `release-receipt.json` records the selected deployment/status IDs and commit with each workflow run, including the reason when a pair is not ready. Failed GitHub reads fail the job instead of silently treating the release as verified.

The Playwright dependency is isolated here; the starter has no runtime dependencies. Its default timeout is unchanged pending the first real release measurement. After a measured baseline, adjust any failing budget with the actual timing evidence.

Local smoke after configuration:

```sh
npm ci --prefix ci-proposals
npm exec --prefix ci-proposals -- playwright install chromium
COASSEMBLE_KEY='<sandbox key from your environment>' npm run smoke --prefix ci-proposals
```

Set secrets through the environment or your secret manager; do not paste a real key into a saved command, ticket or screenshot.

GitHub references: [deployment status workflow event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#deployment_status), [list deployments](https://docs.github.com/en/rest/deployments/deployments#list-deployments), [list deployment statuses](https://docs.github.com/en/rest/deployments/statuses#list-deployment-statuses).
