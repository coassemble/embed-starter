# Coassemble embed starter

A small working integration: one server-side function that holds your API key, and one page that shows your course. No runtime dependencies.

## Run locally

Use Node 24 and a Coassemble API key from Developer > API keys. Your workspace needs a published course.

Run these commands in order. After the second command, open `.env` and set `COASSEMBLE_KEY` to the whole key before continuing. Do not add a Bearer prefix.

```sh
git clone https://github.com/coassemble/embed-starter
cd embed-starter && cp .env.example .env    # paste your key into .env
npm install && COASSEMBLE_API_BASE='https://api.coassemble.com/api' npm run dev    # opens your course
```

The browser opens your demo course, or another published workspace course. If it does not open automatically, open the URL printed in your terminal.

## How it works

- `api/embed.js` finds a published course and requests a fresh signed view link on each page load. The API key stays on the server.
- `public/` displays the link in an iframe with `fullscreen; autoplay; presentation; clipboard-write` permissions.
- `server.mjs` serves the page and the same embed function locally using Node's HTTP server.

## Use it in your app

Keep `COASSEMBLE_KEY` in your server environment. Reuse `api/embed.js` and `setup-contract.js` in your server or serverless host; `serveEmbed(Request)` returns a Web Standard `Response`.

Protect the embed endpoint with your application's login and derive the learner identifier from the signed-in user on the server. The local example uses `COASSEMBLE_IDENTIFIER=test-anna` so repeated testing reuses the same learner.

The browser calls `POST /api/embed` and puts the returned `url` in its iframe. Request a new link for each page load; do not store signed links or send the API key to the browser.

Optional settings in `.env.example` let you change the API environment, choose a local port, or disable automatic browser opening.

See the [integration guide](https://developers.coassemble.com/setup/embed.md) for the API calls and completion webhooks.

## Test locally

Run `npm test`. The HTTP tests use a local fake API and need no Coassemble key or learner allowance.
