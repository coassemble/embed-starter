import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createAppServer } from '../server.mjs';
import { API_BASE, EMBED_ALLOW, STARTER_COMMANDS } from '../setup-contract.js';

const key = 'COASSEMBLE:123:test-server-secret';

async function listen(server) {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}`;
}

async function fixture(t, { setup = { demoCourseId: 42, course: { id: 42, title: 'Demo course', published: '2026-09-14' }, keyMode: 'test' }, courses = [], failure = null, env = {} } = {}) {
    const calls = [];
    let issued = 0;
    const provider = createServer(async (req, res) => {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        calls.push({ path: req.url, method: req.method, authorization: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
        res.setHeader('Content-Type', 'application/json');
        if (failure) { res.writeHead(failure); res.end(JSON.stringify({ message: key })); return; }
        if (req.url.includes('/setup/status')) res.end(JSON.stringify(setup));
        else if (req.url.includes('/courses?')) res.end(JSON.stringify(courses));
        else if (req.url.endsWith('/embed/course')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.end(`https://example.test/embed/signed-${++issued}`);
        }
        else { res.writeHead(404); res.end('{}'); }
    });
    const providerUrl = await listen(provider);
    const serverEnv = { COASSEMBLE_KEY: key, COASSEMBLE_API_BASE: `${providerUrl}/api`, ...env };
    const app = createAppServer(serverEnv);
    const url = await listen(app);
    t.after(() => { app.closeAllConnections(); provider.closeAllConnections(); app.close(); provider.close(); });
    return { url, providerUrl, calls, serverEnv };
}

test('each page load selects the exact demo and reads its fresh plain-text view URL without a clientIdentifier', async (t) => {
    const { url, calls } = await fixture(t);
    const first = await fetch(`${url}/api/embed`, { method: 'POST' });
    const second = await fetch(`${url}/api/embed`, { method: 'POST' });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    assert.notEqual((await first.json()).url, (await second.json()).url);
    const requests = calls.filter((call) => call.path.endsWith('/embed/course'));
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0].body, { action: 'view', courseId: 42, identifier: 'test-anna' });
    assert.ok(calls.every((call) => call.authorization === key));
    assert.equal(calls.some((call) => call.path.includes('/courses?')), false);
});

test('fallback chooses published workspace content and leaves drafts and customer-specific courses alone', async (t) => {
    const { url, calls } = await fixture(t, { setup: { course: { id: 2, title: 'Customer course', published: '2026-09-14' } }, courses: [
        { id: 1, published: null }, { id: 2, published: '2026-09-14', clientIdentifier: 'customer' }, { id: 3, title: 'Published', published: '2026-09-14' }
    ] });
    const response = await fetch(`${url}/api/embed`, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).course.id, 3);
    assert.equal(calls.at(-1).body.courseId, 3);
});

test('missing key, missing courses and provider rejections fail without exposing the key or minting empty courses', async (t) => {
    const missingKey = await fixture(t, { env: { COASSEMBLE_KEY: '' } });
    assert.equal((await fetch(`${missingKey.url}/api/embed`, { method: 'POST' })).status, 503);
    assert.equal(missingKey.calls.length, 0);
    const missingCourse = await fixture(t, { setup: {}, courses: [] });
    assert.equal((await fetch(`${missingCourse.url}/api/embed`, { method: 'POST' })).status, 404);
    assert.equal(missingCourse.calls.some((call) => call.method === 'POST'), false);
    const rejected = await fixture(t, { failure: 401 });
    const response = await fetch(`${rejected.url}/api/embed`, { method: 'POST' });
    assert.equal(response.status, 401);
    assert.equal((await response.text()).includes(key), false);
});

test('only public assets and same-origin POSTs are served; the browser never receives the API key', async (t) => {
    const { url } = await fixture(t);
    for (const path of ['/', '/app.js', '/iframe-policy.js', '/style.css']) {
        const response = await fetch(url + path);
        assert.equal(response.status, 200);
        assert.equal((await response.text()).includes(key), false);
    }
    for (const path of ['/.env', '/api/embed.js', '/setup-contract.js', '/server.mjs']) assert.equal((await fetch(url + path)).status, 404);
    assert.equal((await fetch(`${url}/api/embed`)).status, 405);
    assert.equal((await fetch(`${url}/api/embed`, { method: 'POST', headers: { Origin: 'https://another.example' } })).status, 403);
});

test('the documented Node command loads the local .env and opens a usable HTTP page', async (t) => {
    const { serverEnv } = await fixture(t);
    const folder = await mkdtemp(join(tmpdir(), 'embed-starter-test-'));
    await writeFile(join(folder, '.env'), Object.entries({ ...serverEnv, OPEN_BROWSER: 'false' }).map(([name, value]) => `${name}=${value}`).join('\n'));
    const child = spawn(process.execPath, ['--env-file-if-exists=.env', fileURLToPath(new URL('../server.mjs', import.meta.url))], { cwd: folder, stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(async () => { child.kill(); await rm(folder, { recursive: true, force: true }); });
    const output = await new Promise((resolve, reject) => {
        child.stdout.once('data', resolve);
        child.once('error', reject);
        child.once('exit', (code) => reject(new Error(`The documented command exited before serving a page (exit ${code}). Use Node 24.`)));
    });
    const url = output.toString().match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    assert.ok(url);
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(`${url}/api/embed`, { method: 'POST' })).status, 200);
});

test('README and iframe permissions carry the shared console contract', async () => {
    const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
    assert.ok(readme.includes(STARTER_COMMANDS));
    assert.ok(readme.includes(API_BASE));
    const iframePolicy = await import('../public/iframe-policy.js');
    assert.equal(iframePolicy.EMBED_ALLOW, EMBED_ALLOW);
});
