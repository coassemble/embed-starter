import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { serveEmbed } from './api/embed.js';

const files = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/iframe-policy.js', ['iframe-policy.js', 'text/javascript; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']]
]);

export function createAppServer(env = process.env) {
    return createServer(async (incoming, outgoing) => {
        try {
            const url = new URL(incoming.url, `http://${incoming.headers.host}`);
            if (url.pathname === '/api/embed') {
                const response = await serveEmbed(new Request(url, { method: incoming.method, headers: incoming.headers }), env);
                outgoing.writeHead(response.status, Object.fromEntries(response.headers));
                outgoing.end(await response.text());
                return;
            }
            const file = files.get(url.pathname);
            if (!file || incoming.method !== 'GET') {
                outgoing.writeHead(404);
                outgoing.end('Not found');
                return;
            }
            outgoing.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' });
            outgoing.end(await readFile(new URL(`./public/${file[0]}`, import.meta.url)));
        } catch {
            outgoing.writeHead(500, { 'Content-Type': 'text/plain' });
            outgoing.end('The example could not handle this request. Restart and try again.');
        }
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const server = createAppServer();
    server.listen({ host: '127.0.0.1', port: Number(process.env.PORT || 0) }, () => {
        const url = `http://127.0.0.1:${server.address().port}`;
        console.log(`Open your course: ${url}`);
        if (process.env.OPEN_BROWSER !== 'false' && !process.env.CI) {
            const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
            const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
            const browser = spawn(command, args, { stdio: 'ignore', detached: true });
            browser.on('error', () => console.log('Open the URL above in your browser.'));
            browser.unref();
        }
    });
}
