import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRelease, PRODUCTION_ENVIRONMENTS } from '../ci-proposals/release-ready.mjs';
import { API_BASE } from '../setup-contract.js';

const sha = 'a'.repeat(40);
const olderSha = 'b'.repeat(40);
const frontend = { id: 20, sha, environment: PRODUCTION_ENVIRONMENTS.frontend };
const backend = { id: 10, sha, environment: PRODUCTION_ENVIRONMENTS.backend };
const currentRoots = { frontend: '1'.repeat(40), backend: '2'.repeat(40) };
const previousRoots = { frontend: '3'.repeat(40), backend: '4'.repeat(40) };

function successEvent(deployment, statusId = deployment.id * 10) {
    return { deployment_status: { id: statusId, state: 'success', environment_url: 'https://wrong-render-host.example' }, deployment };
}

function fixture({ deployments = [frontend, backend], states = {}, roots = { [sha]: currentRoots, [olderSha]: previousRoots }, eventName = 'deployment_status', event = successEvent(frontend) } = {}) {
    const calls = [];
    const snapshots = Object.fromEntries(Object.keys(roots).map((sha, index) => [sha, (index + 1).toString(16).padStart(40, '0')]));
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
            const statusMatch = url.pathname.match(/deployments\/(\d+)\/statuses$/);
            if (statusMatch) {
                const id = Number(statusMatch[1]);
                return Response.json([{ id: id * 10, state: states[id] || 'success', created_at: '2026-09-14T01:05:30Z' }]);
            }
            const commitSha = url.pathname.match(/git\/commits\/([a-f0-9]{40})$/)?.[1];
            if (commitSha && snapshots[commitSha]) return Response.json({ sha: commitSha, tree: { sha: snapshots[commitSha] } });
            const treeSha = url.pathname.match(/git\/trees\/([a-f0-9]{40})$/)?.[1];
            const sourceSha = Object.keys(snapshots).find((sha) => snapshots[sha] === treeSha);
            if (sourceSha) {
                assert.equal(url.search, '', 'read the complete nonrecursive repository tree');
                return Response.json({ sha: treeSha, truncated: false, tree: Object.entries(roots[sourceSha]).map(([path, sha]) => ({ path, type: 'tree', sha })) });
            }
            throw new Error(`Unexpected GitHub request: ${url.pathname}`);
        } }
    };
}

test('successful paired deployments use the released SHA and fixed production API, never Render environment_url', async () => {
    const { options, calls } = fixture();
    const release = await checkRelease(options);
    assert.equal(release.ready, true);
    assert.equal(release.sha, sha);
    assert.equal(release.apiBase, API_BASE);
    assert.equal(release.frontend.id, 20);
    assert.equal(release.backend.id, 10);
    assert.equal(release.frontend.treeSha, currentRoots.frontend);
    assert.equal(release.backend.targetTreeSha, currentRoots.backend);
    assert.equal(calls.filter((url) => url.pathname.includes('/git/commits/')).length, 1);
    assert.equal(JSON.stringify(release).includes('wrong-render-host'), false);
});

for (const changedService of ['frontend', 'backend']) {
    test(`${changedService}-only releases qualify when the older partner has identical service-root content`, async () => {
        const partner = changedService === 'frontend' ? 'backend' : 'frontend';
        const deployments = { frontend, backend };
        deployments[partner] = { ...deployments[partner], sha: olderSha };
        const roots = { [sha]: { ...currentRoots, [partner]: previousRoots[partner] }, [olderSha]: previousRoots };
        const { options } = fixture({ deployments: Object.values(deployments), roots, event: successEvent(deployments[changedService]) });
        const release = await checkRelease(options);
        assert.equal(release.ready, true);
        assert.equal(release.sha, sha);
        assert.equal(release[partner].sha, olderSha);
        assert.equal(release[partner].root, partner);
        assert.equal(release[partner].treeSha, release[partner].targetTreeSha);
        assert.notEqual(roots[sha][changedService], roots[olderSha][changedService]);
        const manual = await checkRelease({ ...options, eventName: 'workflow_dispatch', event: {} });
        assert.equal(manual.ready, true, 'manual diagnosis must also support either service being the newer release');
        assert.equal(manual.sha, sha);
    });
}

test('a changed partner must finish deploying before its success event starts the smoke', async () => {
    const pendingBackend = { ...backend, id: 11 };
    const deployments = [frontend, pendingBackend, { ...backend, sha: olderSha }];
    for (const state of ['pending', 'in_progress', 'failure']) {
        const partial = fixture({ deployments, states: { 11: state } });
        const release = await checkRelease(partial.options);
        assert.equal(release.ready, false);
        assert.equal(release.targetSha, sha);
        assert.equal(release.backend.sha, olderSha);
        assert.notEqual(release.backend.treeSha, release.backend.targetTreeSha);
        assert.equal((await checkRelease({ ...partial.options, eventName: 'workflow_dispatch', event: {} })).ready, false);
    }
    const completed = fixture({ deployments, event: successEvent(pendingBackend) });
    assert.equal((await checkRelease(completed.options)).ready, true);
});

test('failed, nonproduction and superseded events cannot certify a release', async () => {
    for (const event of [
        { ...successEvent(frontend), deployment_status: { state: 'failure' } },
        successEvent({ ...frontend, environment: 'main - coassemble-frontend-staging' })
    ]) {
        const { calls, options } = fixture({ event });
        assert.equal((await checkRelease(options)).ready, false);
        assert.equal(calls.length, 0);
    }
    for (const event of [successEvent({ ...frontend, id: 19 }), successEvent({ ...frontend, sha: olderSha }), successEvent(frontend, 199)]) {
        const { options, calls } = fixture({ event });
        assert.equal((await checkRelease(options)).ready, false);
        assert.equal(calls.some((url) => url.pathname.includes('/git/')), false);
    }
    const regressed = fixture({ deployments: [frontend, { ...frontend, id: 19, sha: olderSha }, backend], states: { 20: 'failure' } });
    assert.equal((await checkRelease(regressed.options)).ready, false, 'an old success event cannot override its deployment latest failure status');
});

test('same-commit redeployments are checked again, but both services still need a successful deployment', async () => {
    const redeployed = { ...frontend, id: 21 };
    assert.equal((await checkRelease(fixture({ deployments: [redeployed, frontend, backend], event: successEvent(redeployed) }).options)).ready, true);
    assert.equal((await checkRelease(fixture({ states: { 10: 'failure' } }).options)).ready, false);
});

test('latest status and paginated history determine the current successful service, without a history cap', async () => {
    const failed = Array.from({ length: 100 }, (_, index) => ({ ...frontend, id: 200 + index, sha: olderSha }));
    const { options, calls } = fixture({ deployments: [...failed, frontend, backend], states: Object.fromEntries(failed.map(({ id }) => [id, id === 200 ? 'inactive' : 'failure'])) });
    assert.equal((await checkRelease(options)).ready, true);
    assert.ok(calls.some((url) => url.searchParams.get('page') === '2'));
    assert.equal(calls.some((url) => url.pathname.endsWith('/statuses') && url.searchParams.get('per_page') !== '1'), false);
});

test('manual diagnostics use deployed commit content and GitHub HTTP errors remain safe', async () => {
    const { options } = fixture({ eventName: 'workflow_dispatch', event: {} });
    assert.equal((await checkRelease(options)).ready, true);
    await assert.rejects(checkRelease({ ...options, fetchImpl: async () => new Response('test-github-token', { status: 403 }) }), { message: 'GitHub deployment verification failed: HTTP 403.' });
    await assert.rejects(checkRelease({ ...options, repository: 'other/repository' }), /coassemble\/coassemble-author/);
    await assert.rejects(checkRelease({ ...options, token: '' }), /deployments:read and contents:read/);
    await assert.rejects(checkRelease({ ...options, fetchImpl: async (input, init) => input.includes('/git/') ? new Response('test-github-token', { status: 503 }) : options.fetchImpl(input, init) }), { message: 'GitHub deployment verification failed: HTTP 503.' });
});

test('incomplete or malformed GitHub trees cannot certify unchanged service content', async () => {
    const { options } = fixture();
    for (const mutate of [
        (tree) => ({ ...tree, truncated: true }),
        (tree) => ({ ...tree, tree: null }),
        (tree) => ({ ...tree, tree: tree.tree.filter(({ path }) => path !== 'backend') }),
        (tree) => ({ ...tree, tree: tree.tree.map((entry) => ({ ...entry, type: 'blob' })) }),
        (tree) => ({ ...tree, tree: tree.tree.map((entry) => ({ ...entry, sha: 'invalid' })) })
    ]) {
        await assert.rejects(checkRelease({ ...options, fetchImpl: async (input, init) => {
            const response = await options.fetchImpl(input, init);
            return input.includes('/git/trees/') ? Response.json(mutate(await response.json())) : response;
        } }), /GitHub.*(tree|root)/);
    }
    await assert.rejects(checkRelease({ ...options, fetchImpl: async (input, init) => input.includes('/git/commits/') ? Response.json({ sha, tree: { sha: 'invalid' } }) : options.fetchImpl(input, init) }), /invalid release commit tree/);
    await assert.rejects(checkRelease({ ...options, fetchImpl: async () => Response.json({ message: 'test-github-token' }) }), /invalid list/);
    await assert.rejects(checkRelease({ ...options, fetchImpl: async () => new Response('test-github-token') }), { message: 'GitHub deployment verification returned invalid JSON.' });
});
