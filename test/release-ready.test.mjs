import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRelease, PRODUCTION_ENVIRONMENTS } from '../ci-proposals/release-ready.mjs';
import { API_BASE } from '../setup-contract.js';

const sha = 'a'.repeat(40);
const olderSha = 'b'.repeat(40);
const frontend = { id: 20, sha, environment: PRODUCTION_ENVIRONMENTS.frontend };
const backend = { id: 10, sha, environment: PRODUCTION_ENVIRONMENTS.backend };

function fixture({ deployments = [frontend, backend], states = {}, eventName = 'deployment_status', event = { deployment_status: { state: 'success', environment_url: 'https://wrong-render-host.example' }, deployment: frontend } } = {}) {
    const calls = [];
    return {
        calls,
        options: { eventName, event, repository: 'coassemble/coassemble-author', token: 'test-github-token', fetchImpl: async (input, options) => {
            const url = new URL(input);
            calls.push(url);
            assert.equal(url.origin, 'https://api.github.com');
            assert.equal(options.headers.Authorization, 'Bearer test-github-token');
            if (url.pathname.endsWith('/deployments')) {
                const offset = (Number(url.searchParams.get('page')) - 1) * 100;
                return Response.json(deployments.filter((item) => item.environment === url.searchParams.get('environment')).slice(offset, offset + 100));
            }
            const id = Number(url.pathname.match(/deployments\/(\d+)\/statuses$/)?.[1]);
            return Response.json([{ id: id * 10, state: states[id] || 'success', created_at: '2026-09-14T01:05:30Z' }]);
        } }
    };
}

test('successful paired deployments use the released SHA and fixed production API, never Render environment_url', async () => {
    const { options } = fixture();
    const release = await checkRelease(options);
    assert.equal(release.ready, true);
    assert.equal(release.sha, sha);
    assert.equal(release.apiBase, API_BASE);
    assert.equal(release.frontend.id, 20);
    assert.equal(release.backend.id, 10);
    assert.equal(JSON.stringify(release).includes('wrong-render-host'), false);
});

test('the first completed service waits for the matching deployment; the second successful event starts the smoke', async () => {
    const partial = fixture({ deployments: [frontend, { ...backend, sha: olderSha }] });
    assert.equal((await checkRelease(partial.options)).ready, false);
    const completed = fixture({ event: { deployment_status: { state: 'success' }, deployment: backend } });
    assert.equal((await checkRelease(completed.options)).ready, true);
});

test('failed, nonproduction and superseded events cannot certify a release', async () => {
    for (const event of [
        { deployment_status: { state: 'failure' }, deployment: frontend },
        { deployment_status: { state: 'success' }, deployment: { ...frontend, environment: 'main - coassemble-frontend-staging' } }
    ]) {
        const { calls, options } = fixture({ event });
        assert.equal((await checkRelease(options)).ready, false);
        assert.equal(calls.length, 0);
    }
    for (const deployment of [{ ...frontend, id: 19 }, { ...frontend, sha: olderSha }]) {
        const { options } = fixture({ event: { deployment_status: { state: 'success' }, deployment } });
        assert.equal((await checkRelease(options)).ready, false);
    }
});

test('latest status and paginated history determine the current successful service, without a history cap', async () => {
    const failed = Array.from({ length: 100 }, (_, index) => ({ ...frontend, id: 200 + index, sha: olderSha }));
    const { options, calls } = fixture({ deployments: [...failed, frontend, backend], states: Object.fromEntries(failed.map(({ id }) => [id, id === 200 ? 'inactive' : 'failure'])) });
    assert.equal((await checkRelease(options)).ready, true);
    assert.ok(calls.some((url) => url.searchParams.get('page') === '2'));
    assert.equal(calls.some((url) => url.pathname.endsWith('/statuses') && url.searchParams.get('per_page') !== '1'), false);
});

test('manual diagnostics still require a matching live pair and GitHub errors remain safe', async () => {
    const { options } = fixture({ eventName: 'workflow_dispatch', event: {} });
    assert.equal((await checkRelease(options)).ready, true);
    await assert.rejects(checkRelease({ ...options, fetchImpl: async () => new Response('test-github-token', { status: 403 }) }), { message: 'GitHub deployment verification failed: HTTP 403.' });
    await assert.rejects(checkRelease({ ...options, repository: 'other/repository' }), /coassemble\/coassemble-author/);
});
