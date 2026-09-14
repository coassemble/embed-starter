# Product-release smoke proposal

This directory is reviewable prep. No GitHub Actions workflow or scheduled job is enabled.

`product-release-smoke.yml` belongs in **coassemble-author**, so releases of the product trigger the starter check. It responds directly to GitHub `deployment_status` success events from `main - coassemble-frontend-prod` and `main - coassemble-backend-prod`. Manual dispatch checks the currently released pair for diagnosis. Changes to the starter repository alone do not provide release coverage.

`release-ready.mjs` reads each production environment's deployment history, latest statuses and Git trees through the GitHub API, using only the built-in token with `deployments: read` and `contents: read`. A deployment event must still refer to the current successful deployment and status of its service. Its commit is the target release: each service's complete build-root tree at its deployed commit must equal that root at the target commit. The frontend and backend can therefore remain at different commits when the older service's content is unchanged. A frontend-only or backend-only release runs the smoke without waiting for a partner that Render will not redeploy.

If the partner's content changed, the first completed service waits for its partner; the partner's success event checks the pair again. Failed, nonproduction and superseded events do not run the browser smoke. Same-commit redeployments are checked again. Manual diagnosis tries the current services' deployed commits as target snapshots and requires one to match both live service roots; it never substitutes an undeployed branch tip. A mismatched pair saves the target and deployed tree SHAs in its receipt.

Read-only Render metadata on 14 September 2026 confirmed production frontend `srv-ctflt15umphs73ebnbu0` uses root directory `frontend`, and backend `srv-ctfm0d5umphs73ebo190` uses `backend`; both auto-deploy from `main`. Render's root-directory filter prevents changes outside that root from triggering its automatic deploy. The API returned no additional `buildFilter` field. The gate compares those entire directory trees, including nested files, rather than a potentially truncated changed-file list. Revisit these two roots if the production build configuration changes. [Render monorepo deployment rules](https://render.com/docs/monorepo-support).

The existing Render GitHub app already emits these events; no dispatcher, deployment write token or new release-hook service is needed. On 14 September 2026, production frontend deployment `6427481744` and backend deployment `6427481723` both had latest status `success` at commit `9a0e19956b16b9e3328112ed601280ecf0673c76`. The smoke uses the canonical production API `https://api.coassemble.com/api`; it never navigates to Render's `environment_url`. Staging, hotfix and enterprise environment names are separate targets and are excluded from this production workflow.

Publication and the prepared workflow were authorized with the ENG-11708 deployment on 14 September 2026. The starter repository is published; release coverage still needs this configuration:

1. Select a dedicated Sandbox workspace with the published `New starter induction` demo. Reserve the stable learner identifier `embed-starter-release-smoke`; reusing it prevents a new learner allowance charge per release.
2. Create environment `embed-starter-sandbox` in the product repository, with server-only secret `EMBED_STARTER_SANDBOX_KEY`. Its key must report `keyMode: test` on setup/status. Its protection rules must allow the already-approved workflow to run automatically after every production deployment; a per-run manual reviewer would turn this into manual coverage. The key is supplied only to the browser smoke step.
3. Install the approved workflow and observe an actual production release, then inspect its original screenshot, release receipt and logs. Manual dispatch can validate setup first. No pre-deploy CI or branch-push event is treated as proof that a release is live.

The smoke runs the published starter's local HTTP tests, starts its real server against the released API, loads the returned link in Chromium, verifies the actual modern player and its test-mode badge, and rejects browser requests containing the API key. It records a screenshot; this verifies loading rather than course completion. Completion remains part of the main first-run integration proof.

The gate is covered by deterministic tests for same-commit releases, frontend-only and backend-only releases, a changed partner still pending or failed, the partner completing, stale deployment/status events, paginated deployment history, manual diagnosis and same-commit redeploys. `release-receipt.json` records the selected deployment/status IDs, deployed commits and service-root tree SHAs, including the target tree and reason when a pair is not ready. Failed GitHub reads and invalid or truncated Git trees fail the job instead of silently treating the release as verified.

The Playwright dependency is isolated here; the starter has no runtime dependencies. Its default timeout is unchanged pending the first real release measurement. After a measured baseline, adjust any failing budget with the actual timing evidence.

Local smoke after configuration:

```sh
npm ci --prefix ci-proposals
npm exec --prefix ci-proposals -- playwright install chromium
COASSEMBLE_KEY='<sandbox key from your environment>' npm run smoke --prefix ci-proposals
```

Set secrets through the environment or your secret manager; do not paste a real key into a saved command, ticket or screenshot.

GitHub references: [deployment status workflow event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#deployment_status), [list deployments](https://docs.github.com/en/rest/deployments/deployments#list-deployments), [list deployment statuses](https://docs.github.com/en/rest/deployments/statuses#list-deployment-statuses), [get a commit object](https://docs.github.com/en/rest/git/commits#get-a-commit-object), [get a Git tree](https://docs.github.com/en/rest/git/trees#get-a-tree).
