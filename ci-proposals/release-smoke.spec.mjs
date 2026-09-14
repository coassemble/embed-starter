import { test, expect } from '@playwright/test';
import { once } from 'node:events';
import { createAppServer } from '../server.mjs';
import { API_BASE, EMBED_ALLOW } from '../setup-contract.js';

let server;
let url;

test.beforeAll(async () => {
    if (!process.env.COASSEMBLE_KEY) throw new Error('Configure the dedicated sandbox key in COASSEMBLE_KEY.');
    const response = await fetch(`${process.env.COASSEMBLE_API_BASE || API_BASE}/v1/headless/setup/status`, { headers: { Authorization: process.env.COASSEMBLE_KEY } });
    if (!response.ok) throw new Error(`Sandbox setup/status returned HTTP ${response.status}.`);
    const setup = await response.json();
    if (setup.keyMode !== 'test') throw new Error('The release smoke requires a test key; no production learners may be used.');
    if (!setup.demoCourseId) throw new Error('The dedicated sandbox workspace must contain the published first-run demo.');
    server = createAppServer(process.env);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    url = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(() => { server?.closeAllConnections(); server?.close(); });

test('a release can open the real demo in an iframe without exposing its key', async ({ page }) => {
    const leakedRequests = [];
    const scriptErrors = [];
    page.on('request', (request) => {
        if (JSON.stringify({ url: request.url(), headers: request.headers(), body: request.postData() }).includes(process.env.COASSEMBLE_KEY)) leakedRequests.push(request.method());
    });
    page.on('pageerror', (error) => scriptErrors.push(error.message));
    await page.goto(url);
    const frameElement = page.locator('#course');
    await expect(frameElement).toBeVisible();
    await expect(frameElement).toHaveAttribute('allow', EMBED_ALLOW);
    const frame = page.frameLocator('#course');
    await expect(frame.locator('.modern-course-player')).toBeVisible();
    await expect(frame.locator('.test-mode')).toBeVisible();
    await expect(page.locator('#status')).toContainText('New starter induction');
    expect(leakedRequests).toEqual([]);
    expect(scriptErrors).toEqual([]);
    await page.screenshot({ path: 'test-results/starter-course.png', fullPage: true });
});
