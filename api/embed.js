import { API_BASE } from '../setup-contract.js';

class SetupError extends Error {
    constructor(message, status = 502) {
        super(message);
        this.status = status;
    }
}

function apiError(status, path) {
    if (status === 401) return new SetupError('The Coassemble key is invalid or revoked. Update COASSEMBLE_KEY in .env, then restart.', 401);
    if (status === 403) return new SetupError('Coassemble refused this request. Check the key, plan and learner allowance in Developer.', 403);
    if (status === 429) return new SetupError('Coassemble is receiving too many requests. Wait, then try again.', 429);
    return new SetupError(`Coassemble returned HTTP ${status} for ${path}. Check Developer > Requests.`);
}

async function mintCourseLink(env) {
    const key = env.COASSEMBLE_KEY?.trim();
    if (!key) throw new SetupError('Set COASSEMBLE_KEY in .env to the whole key from Developer > API keys, then restart.', 503);
    const base = new URL(env.COASSEMBLE_API_BASE || API_BASE);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new SetupError('COASSEMBLE_API_BASE must be an HTTP API URL including /api.', 503);

    async function call(path, body) {
        const response = await fetch(`${base.toString().replace(/\/$/, '')}${path}`, {
            method: body ? 'POST' : 'GET',
            headers: { Authorization: key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}),
            cache: 'no-store'
        });
        if (!response.ok) throw apiError(response.status, path);
        return response;
    }

    const setup = await (await call('/v1/headless/setup/status')).json();
    // Setup status identifies the seeded demo even if another course was created first.
    let course = setup.demoCourseId && setup.course?.id === setup.demoCourseId && setup.course.published ? setup.course : null;
    if (!course) {
        // The courses API documents zero-based pages with 100 courses per page.
        let page = 0;
        while (!course) {
            const courses = await (await call(`/v1/headless/courses?page=${page}&length=100`)).json();
            if (!Array.isArray(courses)) throw new SetupError('Coassemble returned an invalid course list. Check Developer > Requests.');
            course = courses.find((item) => item.published && !item.deleted && item.clientIdentifier == null);
            if (course || courses.length < 100) break;
            page += 1;
        }
    }
    if (!course) throw new SetupError('No published course is available. Ask the workspace owner to create and publish a course, then try again.', 404);
    const body = { action: 'view', courseId: course.id, identifier: env.COASSEMBLE_IDENTIFIER || 'test-anna' };
    if (setup.themeId != null) body.themeId = setup.themeId;
    const signedLink = await (await call('/v1/headless/embed/course', body)).text();
    let url;
    try { url = new URL(signedLink); } catch { throw new SetupError('Coassemble did not return a valid signed link. Check Developer > Requests.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.toString().includes(key)) throw new SetupError('Coassemble did not return a valid signed link. Check Developer > Requests.');
    return { url: url.toString(), course: { id: course.id, title: course.title }, keyMode: setup.keyMode };
}

export async function serveEmbed(request, env = process.env) {
    const headers = { 'Cache-Control': 'no-store' };
    if (request.method !== 'POST') return Response.json({ message: 'Use POST to request a fresh course link.' }, { status: 405, headers: { ...headers, Allow: 'POST' } });
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return Response.json({ message: 'Open this example from its own page.' }, { status: 403, headers });
    try {
        return Response.json(await mintCourseLink(env), { headers });
    } catch (error) {
        // Provider bodies and credentials never become browser responses.
        return Response.json({ message: error instanceof SetupError ? error.message : 'Could not contact Coassemble. Check the API base URL and try again.' }, { status: error instanceof SetupError ? error.status : 502, headers });
    }
}

// This Web Standard handler also deploys as a Node serverless function at /api/embed.
export default { fetch: (request) => serveEmbed(request) };
