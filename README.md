# Coassemble integration brief — workspace <workspaceId>

Goal: put a Coassemble course inside your product for a named learner, and find out when they finish.

Facts
- API base: https://api.coassemble.com/api. Use every URL below verbatim, including /api.
- Authorization is the whole key: COASSEMBLE:<workspaceId>:<secret>. Do NOT add a Bearer prefix.
- Keep the key in a server-side .env file. Never put it in browser code, email, or an AI chat.
- If a key is exposed, revoke it in Developer > API keys and create another.
- Published API specification: https://api.coassemble.com/api/docs/json

Steps (the Developer console ticks each one as it happens)
1. GET https://api.coassemble.com/api/v1/headless/courses. Choose a published course from the response. A new workspace normally includes a demo; if none exists, ask the owner to create and publish one.
2. POST https://api.coassemble.com/api/v1/headless/embed/course
   {"action":"view","courseId":"<id from the courses response>","identifier":"<your learner id>"}
   Only add clientIdentifier when you intentionally need to separate customers of your own.
   The link expires in 3 hours. Mint it server-side per learner per page load; do not store it.
3. The response is the signed URL as plain text. Render that URL in an iframe:
   allow="fullscreen; autoplay; presentation; clipboard-write"
   First check whether the app has a server. A static site needs one serverless function that holds
   the key and returns the signed link. The browser must never receive the key.
4. Optional: POST https://api.coassemble.com/api/v1/headless/webhooks {"url":"https://your-server.example/completed","events":["course.completed"]}

Check your work
- After each step, GET https://api.coassemble.com/api/v1/headless/setup/status with the same key.
- Report only the steps that status confirms. Its lastFailure includes a fix; allowances shows learner headroom.
- Reuse one test identifier, such as test-anna. Each new identifier consumes another identified learner.
- Test keys stay test keys after an upgrade. Create a production key when going live.
- Test SCORM packages expire 30 days after export. Production packages do not expire.
- If you cannot make HTTP calls, say so; the person can watch the steps on the Developer page.

Working example: https://github.com/coassemble/embed-starter

Deliverable: server-side code in the app’s language, plus one link the person can open now.

## Run the starter

Use Node 24, then run these three commands:

```sh
git clone https://github.com/coassemble/embed-starter
cd embed-starter && cp .env.example .env    # paste your key into .env
npm install && npm run dev                  # opens a page with your course in it
```

The local page opens automatically. If your terminal cannot open a browser, open the URL it prints.

## How this example works

- `api/embed.js` is the one serverless function. It reads the key from the server environment, finds the demo from setup status or another published workspace course, and mints a fresh view link on every page load.
- `public/index.html` and `public/app.js` render that link in one iframe. They receive no API key.
- `server.mjs` runs the same function locally with Node's built-in HTTP server. There are no runtime dependencies.
- `COASSEMBLE_IDENTIFIER` defaults to `test-anna`. In your own app, derive it from the signed-in user on the server. Authenticate the function using your application's existing login before making the example public.
- `COASSEMBLE_API_BASE` can point at a different Coassemble environment; include `/api`. `OPEN_BROWSER=false` disables automatic browser opening.

## Deploy the function

The default export in `api/embed.js` is a Web Standard Node handler, directly supported by [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js). Keep `setup-contract.js` beside it, deploy `public/` as static content, and configure `COASSEMBLE_KEY` as a server-only environment variable. Other function hosts can adapt the same `serveEmbed(Request) → Response` handler.

## Verify

Run `npm test` for local HTTP tests covering course discovery, fresh links, error handling and the key boundary. The tests use a local fake API and consume no learner allowance.

`ci-proposals/` contains the proposed product-release sandbox/browser check. It is not an enabled workflow. It uses the existing successful production deployment events and checks the frontend/backend commit pair. The workflow, test workspace and secret must be approved and configured before it can run.

This README and the API/iframe constants are generated from the Author repository's shared integration brief. Update them there with `node docs/scripts/generate-setup-brief.mjs --starter-dir=/path/to/embed-starter`; verify drift with the same command plus `--check`.
