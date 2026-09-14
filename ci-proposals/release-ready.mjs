import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_BASE } from '../setup-contract.js';

export const PRODUCTION_ENVIRONMENTS = {
    frontend: 'main - coassemble-frontend-prod',
    backend: 'main - coassemble-backend-prod'
};

export async function checkRelease({ eventName, event, repository, token, fetchImpl = fetch }) {
    if (eventName !== 'workflow_dispatch' && (eventName !== 'deployment_status' || event.deployment_status?.state !== 'success' || !Object.values(PRODUCTION_ENVIRONMENTS).includes(event.deployment?.environment))) {
        return { ready: false, reason: 'This event is not a successful production deployment.' };
    }
    if (repository !== 'coassemble/coassemble-author') throw new Error('Release verification must run against coassemble/coassemble-author.');
    if (!token) throw new Error('GITHUB_TOKEN with deployments:read is required.');

    async function read(path) {
        const response = await fetchImpl(`https://api.github.com/repos/${repository}/${path}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
        });
        if (!response.ok) throw new Error(`GitHub deployment verification failed: HTTP ${response.status}.`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('GitHub deployment verification returned an invalid list.');
        return data;
    }

    async function latestSuccess(environment) {
        for (let page = 1; ; page += 1) {
            // 100 is GitHub's documented maximum page size, not a deployment-history cap.
            const deployments = await read(`deployments?environment=${encodeURIComponent(environment)}&per_page=100&page=${page}`);
            for (const deployment of deployments) {
                if (deployment.environment !== environment) throw new Error('GitHub returned a deployment from the wrong environment.');
                const [status] = await read(`deployments/${deployment.id}/statuses?per_page=1`);
                if (status?.state === 'success') return { id: deployment.id, sha: deployment.sha, environment, statusId: status.id, succeededAt: status.created_at };
            }
            if (deployments.length < 100) return null;
        }
    }

    const [frontend, backend] = await Promise.all(Object.values(PRODUCTION_ENVIRONMENTS).map(latestSuccess));
    if (!frontend || !backend) return { ready: false, reason: 'Both production services need a successful deployment.' };
    if (frontend.sha !== backend.sha) return { ready: false, reason: 'The latest successful production frontend and backend deployments have different SHAs.', frontend, backend };
    if (!/^[a-f0-9]{40}$/.test(frontend.sha)) throw new Error('GitHub returned an invalid released SHA.');
    if (eventName === 'deployment_status') {
        const deployedService = event.deployment.environment === PRODUCTION_ENVIRONMENTS.frontend ? frontend : backend;
        if (event.deployment.sha !== frontend.sha || event.deployment.id !== deployedService.id) {
            return { ready: false, reason: 'The triggering deployment has been superseded.', frontend, backend };
        }
    }
    return { ready: true, sha: frontend.sha, apiBase: API_BASE, frontend, backend };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const result = await checkRelease({ eventName: process.env.GITHUB_EVENT_NAME, event, repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN });
    console.log(JSON.stringify(result, null, 2));
    await writeFile('release-receipt.json', `${JSON.stringify(result, null, 2)}\n`);
    if (process.env.GITHUB_OUTPUT) {
        await appendFile(process.env.GITHUB_OUTPUT, `ready=${result.ready}\nsha=${result.sha || ''}\napi_base=${result.apiBase || ''}\n`);
    }
}
